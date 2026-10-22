// B8 shipments, courier sync, webhooks and returns against a real replica set (build plan §11 B8, I9;
// domain-rules §3, §4.1, §6, §7, §13). Courier HTTP is replaced by a recorded-answer stand-in for
// these tests only (vi.stubGlobal("fetch")); the product code never fakes a courier answer.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { createAddress } from "@/lib/modules/orders/addresses";
import { placeOrder, type PlaceOrderInput } from "@/lib/modules/orders/checkout";
import { ORDERS, type OrderDoc } from "@/lib/modules/orders/schema";
import { transitionOrder } from "@/lib/modules/orders/transitions";
import { addToCart, CommerceError } from "@/lib/modules/pricing/cart";
import { quoteLines } from "@/lib/modules/pricing/quote";
import { SETTINGS, SETTINGS_ID } from "@/lib/modules/settings/schema";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { COURIER_EVENTS, RETURNS, SHIPMENTS, type ReturnDoc, type ShipmentDoc } from "@/lib/modules/fulfilment/schema";
import { applyCourierStatus, createShipment, inspectReturnedLine, retryBooking, transitionShipment, updateTracking } from "@/lib/modules/fulfilment/shipments";
import { runCourierBooking } from "@/lib/modules/fulfilment/courier-jobs";
import { parseSteadfastEvent, receiveCourierEvent } from "@/lib/modules/fulfilment/webhooks";
import { inspectReturn, recordRefund, requestReturn, settleReturn, transitionReturn } from "@/lib/modules/fulfilment/returns";
import { drainOutbox } from "@/lib/modules/platform/outbox";
import { outboxHandlers } from "@/lib/adapters/jobs/handlers";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: null };
const staff = { type: "staff" as const, id: "staff-1", role: "owner", ip: null };
const tag = randomUUID().slice(0, 6);
const STEADFAST_ENV = { STEADFAST_API_KEY: "test-key", STEADFAST_SECRET_KEY: "test-secret" };
let cat: string;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};

async function product(slug: string, price: number, stock: number) {
  const id = String(await createProduct(db, client, actor, { slug: `${slug}-${tag}-${randomUUID().slice(0, 4)}`, name: { bn: "প্রোডাক্ট", en: slug }, primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  const v = String(await createVariant(db, client, actor, id, { sku: `S-${randomUUID().slice(0, 8).toUpperCase()}`, title: { bn: "প্যাক" }, options: [], price: { amountMinor: price, currency: "BDT" }, position: 0 }));
  if (stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: stock }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return v;
}

/** Places an order and walks it to `ready_to_ship` (or `processing`). */
async function order(lines: { variant: string; qty: number }[], until: "processing" | "ready_to_ship" = "ready_to_ship") {
  const userId = `u-${randomUUID()}`;
  for (const l of lines) await addToCart(db, { userId }, l.variant, l.qty);
  const addressId = String(await createAddress(db, userId, { label: "home", name: "রহিম", phone: "01712-345678", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "বাসা ১২, রোড ৩" }));
  const cart = (await db.collection("carts").findOne({ userId, status: "active" }))!;
  const quote = await quoteLines(db, cart.lines, { userId, couponCode: cart.couponCode, zoneId: "dhaka" });
  const input: PlaceOrderInput = { userId, customer: { name: "রহিম", email: `${userId}@example.com` }, addressId, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" };
  const { orderId } = await placeOrder(db, client, input);
  const id = new ObjectId(orderId);
  let v = 1;
  for (const to of ["confirmed", "processing", "ready_to_ship"] as const) {
    v = (await transitionOrder(db, client, { orderId: id, expectedVersion: v, to, actor: staff })).version;
    if (to === until) break;
  }
  return { id, userId, orderId };
}

const orderOf = async (id: ObjectId) => (await db.collection<OrderDoc>(ORDERS).findOne({ _id: id }))!;
const shipmentOf = async (id: ObjectId) => (await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: id }))!;
const stockOf = async (variant: string) => (await db.collection("stock").findOne({ variantId: new ObjectId(variant) }))!;
const step = async (s: ShipmentDoc, to: ShipmentDoc["status"], reason?: string) => transitionShipment(db, { shipmentId: s._id, expectedVersion: (await shipmentOf(s._id)).version, to, reason, actor: staff });
let consignmentSeq = 0;
const consignment = () => `C-${tag}-${++consignmentSeq}`;

/** Ships and delivers an order through a manual shipment. */
async function delivered(lines: { variant: string; qty: number }[]) {
  const o = await order(lines);
  const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Local rider", consignmentId: consignment(), actor: staff });
  await step(s, "handed_over");
  await step(s, "delivered");
  return { ...o, shipment: s };
}

/** A stand-in for the courier's HTTP answers, recorded per test. */
function courierHttp(answers: Record<string, () => { status: number; body: unknown }>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    const key = Object.keys(answers).find((k) => path.endsWith(k));
    if (!key) throw new TypeError("network down");
    const a = answers[key]!();
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  });
  return calls;
}
function withSteadfastEnv() {
  for (const [k, v] of Object.entries(STEADFAST_ENV)) vi.stubEnv(k, v);
}

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(await createCategory(db, client, actor, { slug: `food-${tag}`, parentId: null, name: { bn: "খাবার" }, position: 1 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "dhaka", name: { bn: "ঢাকা" }, fee: { amountMinor: 6000, currency: "BDT" }, estimate: { bn: "১-২ দিন" }, areas: [], enabled: true });
  await db.collection(SETTINGS).updateOne({ _id: SETTINGS_ID } as never, { $set: { "features.checkout": true } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => cleanup());

describe("shipments: lifecycle and stock (I9)", () => {
  it("a draft commits nothing; hand-over needs a consignment, ships the order and commits stock once", async () => {
    const v = await product("rice", 50000, 5);
    const o = await order([{ variant: v, qty: 2 }]);
    const before = await stockOf(v);
    const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Local rider", actor: staff });
    expect(s).toMatchObject({ status: "draft", open: true, courier: "manual", codAmount: (await orderOf(o.id)).totals.grandTotal });
    expect(await stockOf(v)).toMatchObject({ onHand: before.onHand, reserved: before.reserved });
    expect(await db.collection("inventoryLedger").countDocuments({ refId: o.orderId, kind: "commit" })).toBe(0);
    expect(await code(step(s, "handed_over"))).toBe("transition_not_allowed"); // draft → handed_over skips booked
    const booked = await updateTracking(db, { shipmentId: s._id, expectedVersion: s.version, consignmentId: consignment(), trackingUrl: "https://courier.example.com/t/1", actor: staff });
    expect(booked.status).toBe("booked");
    expect(await code(step(booked, "delivered"))).toBe("transition_not_allowed"); // skip-ahead
    expect(await code(transitionShipment(db, { shipmentId: s._id, expectedVersion: booked.version - 1, to: "handed_over", actor: staff }))).toBe("version_conflict");
    const shipped = await step(booked, "handed_over");
    // Replaying the same step with the same expected version returns the first result.
    expect(await code(transitionShipment(db, { shipmentId: s._id, expectedVersion: booked.version, to: "handed_over", actor: staff }))).toBe("ok");
    expect(shipped.status).toBe("handed_over");
    expect((await orderOf(o.id)).status).toBe("shipped");
    expect(await stockOf(v)).toMatchObject({ onHand: before.onHand - 2, reserved: before.reserved - 2 });
    expect(await db.collection("inventoryLedger").countDocuments({ refId: o.orderId, kind: "commit" })).toBe(1);
    await step(shipped, "delivered");
    expect((await orderOf(o.id)).status).toBe("delivered");
    expect((await shipmentOf(s._id)).open).toBe(false);
    const audits = await db.collection("auditLog").find({ "target.type": "shipment", "target.id": { $regex: (await orderOf(o.id)).orderNumber } }).toArray();
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(["shipment.create", "shipment.tracking", "shipment.transition"]));
  });

  it("only one open shipment per order, consignments are unique per courier, and only packing orders get one", async () => {
    const v = await product("dal", 12000, 10);
    const early = await order([{ variant: v, qty: 1 }], "processing");
    const a = await createShipment(db, { orderId: early.id, courier: "manual", carrierName: "Rider", consignmentId: consignment(), actor: staff });
    expect(await code(createShipment(db, { orderId: early.id, courier: "manual", carrierName: "Rider", actor: staff }))).toBe("shipment_exists");
    // processing → shipped is not an order step: the order must be ready to ship first.
    expect(await code(step(a, "handed_over"))).toBe("transition_not_allowed");
    const other = await order([{ variant: v, qty: 1 }]);
    expect(await code(createShipment(db, { orderId: other.id, courier: "manual", carrierName: "Rider", consignmentId: a.consignmentId, actor: staff }))).toBe("consignment_taken");
    expect(await code(createShipment(db, { orderId: other.id, courier: "manual", actor: staff }))).toBe("carrier_required");
    expect(await code(createShipment(db, { orderId: other.id, courier: "manual", carrierName: "Rider", trackingUrl: "http://insecure.example.com", actor: staff }))).toBe("tracking_invalid");
    expect(await code(createShipment(db, { orderId: other.id, courier: "manual", carrierName: "Rider", trackingUrl: "javascript:alert(1)", actor: staff }))).toBe("tracking_invalid");
    const pending = await placeOrder(db, client, await (async () => {
      const userId = `u-${randomUUID()}`;
      await addToCart(db, { userId }, v, 1);
      const addressId = String(await createAddress(db, userId, { label: "home", name: "করিম", phone: "01812-345678", zoneId: "dhaka", district: "ঢাকা", area: "উত্তরা", line: "বাসা ৪" }));
      const cart = (await db.collection("carts").findOne({ userId, status: "active" }))!;
      const quote = await quoteLines(db, cart.lines, { userId, couponCode: cart.couponCode, zoneId: "dhaka" });
      return { userId, customer: { name: "করিম", email: `${userId}@example.com` }, addressId, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" as const };
    })());
    expect(await code(createShipment(db, { orderId: new ObjectId(pending.orderId), courier: "manual", carrierName: "Rider", actor: staff }))).toBe("order_not_shippable");
    // Cancelling an unshipped shipment frees the order for a new one and never touches stock.
    await step(a, "cancelled", "Wrong parcel size");
    expect(await code(createShipment(db, { orderId: early.id, courier: "manual", carrierName: "Rider", actor: staff }))).toBe("ok");
  });

  it("a failed delivery can go out again without a second commit, or come back; returned items are inspected per line", async () => {
    const v1 = await product("oil", 30000, 5);
    const v2 = await product("salt", 4000, 5);
    const o = await order([{ variant: v1, qty: 2 }, { variant: v2, qty: 1 }]);
    const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Rider", consignmentId: consignment(), actor: staff });
    await step(s, "handed_over");
    expect(await code(step(s, "delivery_failed"))).toBe("reason_required");
    await step(s, "delivery_failed", "Customer not reachable");
    expect((await orderOf(o.id)).status).toBe("delivery_failed");
    await step(s, "handed_over"); // second attempt, same consignment
    expect((await orderOf(o.id)).status).toBe("shipped");
    expect(await db.collection("inventoryLedger").countDocuments({ refId: o.orderId, kind: "commit" })).toBe(2); // one per line, once
    await step(s, "delivery_failed", "Refused at the door");
    const afterShip1 = await stockOf(v1);
    const afterShip2 = await stockOf(v2);
    expect(await code(inspectReturnedLine(db, { shipmentId: s._id, lineId: (await orderOf(o.id)).lines[0]!.lineId, outcome: "restock", actor: staff }))).toBe("transition_not_allowed"); // not back yet
    await step(s, "returned");
    const back = await orderOf(o.id);
    expect(back.status).toBe("returned_to_origin");
    // The courier saying "returned" never restocks: nothing moved yet.
    expect((await stockOf(v1)).onHand).toBe(afterShip1.onHand);
    const [l1, l2] = back.lines;
    await inspectReturnedLine(db, { shipmentId: s._id, lineId: l1!.lineId, outcome: "restock", note: "Sealed", actor: staff });
    await inspectReturnedLine(db, { shipmentId: s._id, lineId: l2!.lineId, outcome: "write_off", note: "Packet torn", actor: staff });
    expect(await stockOf(v1)).toMatchObject({ onHand: afterShip1.onHand + 2, available: afterShip1.available + 2 });
    expect(await stockOf(v2)).toMatchObject({ onHand: afterShip2.onHand, available: afterShip2.available });
    expect(await code(inspectReturnedLine(db, { shipmentId: s._id, lineId: l1!.lineId, outcome: "write_off", actor: staff }))).toBe("already_inspected");
    const ledger = await db.collection("inventoryLedger").find({ refType: "rto", refId: o.orderId }).toArray();
    expect(ledger.map((l) => l.idempotencyKey).sort()).toEqual([`rto:${o.orderId}:${l1!.lineId}:restock`, `rto:${o.orderId}:${l2!.lineId}:write_off`].sort());
    expect((await shipmentOf(s._id)).rtoInspection?.map((r) => r.outcome)).toEqual(["restock", "write_off"]);
  });
});

describe("courier status: forward only, verified, never a restock (I9)", () => {
  it("applies newer statuses, ignores older ones, and delivers the order only on a final delivered", async () => {
    const v = await product("tea", 20000, 5);
    const o = await order([{ variant: v, qty: 1 }]);
    const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Rider", consignmentId: consignment(), actor: staff });
    await db.collection(SHIPMENTS).updateOne({ _id: s._id }, { $set: { courier: "steadfast" } }); // a booked Steadfast parcel
    await step(s, "handed_over");
    expect(await applyCourierStatus(db, { shipmentId: s._id, raw: "hold", provider: "steadfast" })).toBe("applied");
    expect(await applyCourierStatus(db, { shipmentId: s._id, raw: "pending", provider: "steadfast" })).toBe("stale"); // out of order
    expect(await applyCourierStatus(db, { shipmentId: s._id, raw: "delivered_approval_pending", provider: "steadfast" })).toBe("applied");
    expect((await orderOf(o.id)).status).toBe("shipped"); // approval pending is not delivery
    expect(await applyCourierStatus(db, { shipmentId: s._id, raw: "delivered", provider: "steadfast" })).toBe("applied");
    expect((await orderOf(o.id)).status).toBe("delivered");
    expect((await shipmentOf(s._id)).status).toBe("delivered");
    expect(await applyCourierStatus(db, { shipmentId: s._id, raw: "cancelled", provider: "steadfast" })).toBe("stale"); // final stays final
    const events = await db.collection("orderEvents").find({ orderId: o.id, to: "delivered" }).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]!.actor).toEqual({ type: "courier", id: "steadfast" });
  });

  it("a courier cancellation is shown to staff but changes neither the order nor stock", async () => {
    const v = await product("sugar", 9000, 5);
    const o = await order([{ variant: v, qty: 1 }]);
    const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Rider", consignmentId: consignment(), actor: staff });
    await db.collection(SHIPMENTS).updateOne({ _id: s._id }, { $set: { courier: "steadfast" } });
    await step(s, "handed_over");
    const stock = await stockOf(v);
    expect(await applyCourierStatus(db, { shipmentId: s._id, raw: "cancelled", provider: "steadfast" })).toBe("applied");
    expect((await orderOf(o.id)).status).toBe("shipped");
    expect((await shipmentOf(s._id)).status).toBe("handed_over");
    expect(await stockOf(v)).toMatchObject({ onHand: stock.onHand, reserved: stock.reserved });
  });
});

describe("courier webhooks (I9)", () => {
  async function steadfastShipment() {
    const v = await product("ghee", 80000, 5);
    const o = await order([{ variant: v, qty: 1 }]);
    const cid = String(Math.floor(Math.random() * 1e9));
    const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Rider", consignmentId: cid, actor: staff });
    await db.collection(SHIPMENTS).updateOne({ _id: s._id }, { $set: { courier: "steadfast" } });
    await step(s, "handed_over");
    return { o, s, cid };
  }

  it("a duplicate delivery is recorded once; the applied status comes from the courier's API, not the body", async () => {
    withSteadfastEnv();
    const { o, s, cid } = await steadfastShipment();
    const calls = courierHttp({ [`/status_by_cid/${cid}`]: () => ({ status: 200, body: { status: 200, delivery_status: "hold" } }) });
    // The body claims "delivered"; the courier's API says "hold". Only "hold" is applied.
    const body = { notification_type: "delivery_status", consignment_id: Number(cid), invoice: "x", status: "delivered", updated_at: new Date().toISOString() };
    const event = parseSteadfastEvent(body)!;
    expect(await receiveCourierEvent(db, "steadfast", event)).toEqual({ outcome: "applied" });
    expect(await receiveCourierEvent(db, "steadfast", parseSteadfastEvent(body)!)).toEqual({ outcome: "duplicate" });
    expect(calls).toHaveLength(1);
    expect((await shipmentOf(s._id)).courierStatus?.code).toBe("hold");
    expect((await orderOf(o.id)).status).toBe("shipped");
    const stored = await db.collection(COURIER_EVENTS).find({ consignmentId: cid }).toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ claimedStatus: "delivered", verifiedStatus: "hold", outcome: "applied" });
    expect(Object.keys(stored[0]!)).not.toContain("raw");
  });

  it("an older event after a newer one cannot regress the status; unknown and stale callbacks do nothing", async () => {
    withSteadfastEnv();
    const { s, cid } = await steadfastShipment();
    let answer = "delivered_approval_pending";
    courierHttp({ [`/status_by_cid/${cid}`]: () => ({ status: 200, body: { status: 200, delivery_status: answer } }) });
    const at = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    expect((await receiveCourierEvent(db, "steadfast", parseSteadfastEvent({ consignment_id: cid, status: "x", updated_at: at(1) })!)).outcome).toBe("applied");
    answer = "pending"; // the courier's view replayed from an older point
    expect((await receiveCourierEvent(db, "steadfast", parseSteadfastEvent({ consignment_id: cid, status: "y", updated_at: at(5) })!)).outcome).toBe("stale");
    expect((await shipmentOf(s._id)).courierStatus?.code).toBe("delivered_approval_pending");
    expect((await receiveCourierEvent(db, "steadfast", parseSteadfastEvent({ consignment_id: "999999999999", status: "delivered" })!)).outcome).toBe("unmatched");
    expect((await receiveCourierEvent(db, "steadfast", parseSteadfastEvent({ consignment_id: cid, status: "delivered", updated_at: at(60 * 24 * 5) })!)).outcome).toBe("outside_window");
    expect(parseSteadfastEvent({ consignment_id: "<script>" })).toBeNull();
    expect(parseSteadfastEvent([])).toBeNull();
  });

  it("when the courier's API fails the event is kept, the failure is visible and the job retries", async () => {
    withSteadfastEnv();
    const { s, cid } = await steadfastShipment();
    courierHttp({ [`/status_by_cid/${cid}`]: () => ({ status: 503, body: { message: "maintenance" } }) });
    expect((await receiveCourierEvent(db, "steadfast", parseSteadfastEvent({ consignment_id: cid, status: "delivered", updated_at: new Date().toISOString() })!)).outcome).toBe("verify_failed");
    const after = await shipmentOf(s._id);
    expect(after.lastSync).toMatchObject({ ok: false });
    expect(after.courierStatus).toBeUndefined();
    const job = await db.collection("outbox").findOne({ idempotencyKey: { $regex: `^courier\\.sync:shipment-${String(s._id)}:` } });
    expect(job).toMatchObject({ status: "failed", attempts: 1 });
    // Later the courier answers: the next drain applies it.
    courierHttp({ [`/status_by_cid/${cid}`]: () => ({ status: 200, body: { status: 200, delivery_status: "hold" } }) });
    await db.collection("outbox").updateOne({ _id: job!._id }, { $set: { availableAt: new Date(0) } });
    const drained = await drainOutbox(db, outboxHandlers, { workerId: "test", trigger: "worker", budgetMs: 5000 });
    expect(drained.done).toBeGreaterThanOrEqual(1);
    expect((await shipmentOf(s._id)).courierStatus?.code).toBe("hold");
  });
});

describe("courier booking (I9)", () => {
  it("is refused when the courier is not configured, and never pretends to book", async () => {
    const v = await product("honey", 70000, 5);
    const o = await order([{ variant: v, qty: 1 }]);
    expect(await code(createShipment(db, { orderId: o.id, courier: "steadfast", actor: staff, env: {} }))).toBe("courier_unavailable");
    expect(await code(createShipment(db, { orderId: o.id, courier: "pathao", actor: staff, env: { PATHAO_CLIENT_ID: "a", PATHAO_CLIENT_SECRET: "b", PATHAO_USERNAME: "c", PATHAO_PASSWORD: "d" } }))).toBe("courier_unavailable");
    // Configured for the admin, but the worker has no credentials: the booking fails visibly.
    const s = await createShipment(db, { orderId: o.id, courier: "steadfast", actor: staff, env: STEADFAST_ENV });
    expect(s.status).toBe("draft");
    expect(s.consignmentId).toBeUndefined();
    expect(s.booking).toMatchObject({ state: "failed" });
    expect(s.booking?.error).toMatch(/not configured/);
  });

  it("records the consignment only when the courier accepts; a re-run does nothing; refusals and outages are visible", async () => {
    withSteadfastEnv();
    const v = await product("flour", 15000, 9);
    const o = await order([{ variant: v, qty: 1 }]);
    const cid = String(Math.floor(Math.random() * 1e9));
    const calls = courierHttp({ "/create_order": () => ({ status: 200, body: { status: 200, message: "ok", consignment: { consignment_id: Number(cid), invoice: "x", tracking_code: `TRK${cid}`, status: "in_review" } } }) });
    const s = await createShipment(db, { orderId: o.id, courier: "steadfast", actor: staff });
    expect(s).toMatchObject({ status: "booked", consignmentId: cid, trackingCode: `TRK${cid}`, booking: { state: "accepted" }, courierStatus: { code: "in_review" } });
    expect(s.trackingUrl).toBeUndefined(); // no guessed tracking link
    const job = (await db.collection("outbox").findOne({ idempotencyKey: `courier.book:shipment-${String(s._id)}:1` }))!;
    expect(await runCourierBooking(db, job as never)).toEqual({ providerRef: cid });
    expect(calls.filter((c) => c.endsWith("/create_order"))).toHaveLength(1);

    const o2 = await order([{ variant: v, qty: 1 }]);
    courierHttp({ "/create_order": () => ({ status: 422, body: { status: 422, message: "invoice already exists", errors: { invoice: ["taken"] } } }) });
    const refused = await createShipment(db, { orderId: o2.id, courier: "steadfast", actor: staff });
    expect(refused).toMatchObject({ status: "draft", booking: { state: "failed" } });
    expect(refused.booking?.error).toMatch(/Steadfast refused/);
    // Staff booked it in the Steadfast portal and enter the consignment by hand.
    const manual = await updateTracking(db, { shipmentId: refused._id, expectedVersion: refused.version, consignmentId: `${cid}9`, actor: staff });
    expect(manual.status).toBe("booked");

    const o3 = await order([{ variant: v, qty: 1 }]);
    courierHttp({}); // network down
    const down = await createShipment(db, { orderId: o3.id, courier: "steadfast", actor: staff });
    expect(down).toMatchObject({ status: "draft", booking: { state: "requested" } });
    expect(down.booking?.error).toMatch(/network down/);
    expect(await db.collection("outbox").findOne({ idempotencyKey: `courier.book:shipment-${String(down._id)}:1` })).toMatchObject({ status: "failed", attempts: 1 });
    expect(await code(retryBooking(db, { shipmentId: down._id, expectedVersion: down.version, actor: staff, env: STEADFAST_ENV }))).toBe("transition_not_allowed"); // still in flight
  });
});

describe("customer returns (I9)", () => {
  it("only the owner, only after delivery, only within the window, never more than received", async () => {
    const v = await product("soap", 6000, 9);
    const o = await order([{ variant: v, qty: 3 }]);
    const line = (await orderOf(o.id)).lines[0]!;
    const number = (await orderOf(o.id)).orderNumber;
    expect(await code(requestReturn(db, { userId: o.userId, orderNumber: number, lines: [{ lineId: line.lineId, qty: 1 }], reason: "Broken" }))).toBe("not_returnable");
    const s = await createShipment(db, { orderId: o.id, courier: "manual", carrierName: "Rider", consignmentId: consignment(), actor: staff });
    await step(s, "handed_over");
    await step(s, "delivered");
    expect(await code(requestReturn(db, { userId: "u-someone-else", orderNumber: number, lines: [{ lineId: line.lineId, qty: 1 }], reason: "Broken" }))).toBe("not_found");
    expect(await code(requestReturn(db, { userId: o.userId, orderNumber: number, lines: [{ lineId: line.lineId, qty: 4 }], reason: "Broken" }))).toBe("return_qty_exceeded");
    expect(await code(requestReturn(db, { userId: o.userId, orderNumber: number, lines: [{ lineId: line.lineId, qty: 1 }], reason: " " }))).toBe("reason_required");
    expect(await code(requestReturn(db, { userId: o.userId, orderNumber: number, lines: [{ lineId: line.lineId, qty: 1 }], reason: "Broken", now: new Date(Date.now() + 8 * 24 * 3600_000) }))).toBe("window_closed");
    await requestReturn(db, { userId: o.userId, orderNumber: number, lines: [{ lineId: line.lineId, qty: 2 }], reason: "Two were broken" });
    expect(await code(requestReturn(db, { userId: o.userId, orderNumber: number, lines: [{ lineId: line.lineId, qty: 2 }], reason: "Again" }))).toBe("return_qty_exceeded");
  });

  it("stock moves only after inspection, per line, once; refunds are capped and store rewards wait for B9", async () => {
    const v1 = await product("cup", 25000, 9);
    const v2 = await product("plate", 35000, 9);
    const d = await delivered([{ variant: v1, qty: 2 }, { variant: v2, qty: 1 }]);
    const ord = await orderOf(d.id);
    const [l1, l2] = ord.lines;
    const r0 = await requestReturn(db, { userId: d.userId, orderNumber: ord.orderNumber, lines: [{ lineId: l1!.lineId, qty: 2 }, { lineId: l2!.lineId, qty: 1 }], reason: "Wrong colour" });
    const s1 = await stockOf(v1);
    const s2 = await stockOf(v2);
    const at = async () => (await db.collection<ReturnDoc>(RETURNS).findOne({ _id: r0._id }))!;
    expect(await code(settleReturn(db, { returnId: r0._id, expectedVersion: r0.version, actor: staff }))).toBe("transition_not_allowed"); // restock before inspected
    expect(await code(transitionReturn(db, { returnId: r0._id, expectedVersion: r0.version, to: "received", actor: staff }))).toBe("transition_not_allowed");
    await transitionReturn(db, { returnId: r0._id, expectedVersion: r0.version, to: "approved", actor: staff });
    // Approval and receipt alone never restock.
    await transitionReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, to: "received", actor: staff });
    expect((await stockOf(v1)).onHand).toBe(s1.onHand);
    expect(await code(inspectReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, outcomes: { [l1!.lineId]: { outcome: "restock" } }, actor: staff }))).toBe("inspection_incomplete");
    await inspectReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, outcomes: { [l1!.lineId]: { outcome: "restock" }, [l2!.lineId]: { outcome: "write_off", note: "Chipped" } }, actor: staff });
    expect((await stockOf(v1)).onHand).toBe(s1.onHand);
    const settled = await settleReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, actor: staff });
    expect(settled.status).toBe("restocked");
    expect(await stockOf(v1)).toMatchObject({ onHand: s1.onHand + 2, available: s1.available + 2 });
    expect(await stockOf(v2)).toMatchObject({ onHand: s2.onHand, available: s2.available });
    expect(await code(settleReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, actor: staff }))).toBe("transition_not_allowed");
    const keys = (await db.collection("inventoryLedger").find({ refType: "return", refId: String(r0._id) }).toArray()).map((l) => l.idempotencyKey).sort();
    expect(keys).toEqual([`return:${String(r0._id)}:${l1!.lineId}:restock`, `return:${String(r0._id)}:${l2!.lineId}:write_off`].sort());
    const cap = l1!.lineTotal - l1!.couponShare + l2!.lineTotal - l2!.couponShare;
    expect(await code(recordRefund(db, { returnId: r0._id, expectedVersion: (await at()).version, method: "bkash", amount: cap + 1, actor: staff }))).toBe("refund_exceeds");
    expect(await code(recordRefund(db, { returnId: r0._id, expectedVersion: (await at()).version, method: "store_reward", amount: 100, actor: staff }))).toBe("store_reward_unavailable");
    const refunded = await recordRefund(db, { returnId: r0._id, expectedVersion: (await at()).version, method: "bkash", amount: cap, reference: "TX123", actor: staff });
    expect(refunded).toMatchObject({ status: "refunded", refund: { method: "bkash", amount: cap } });
    expect((await at()).history.map((h) => h.to)).toEqual(["requested", "approved", "received", "inspected", "restocked", "refunded"]);
    expect(await db.collection("auditLog").countDocuments({ action: "return.transition", "target.id": { $regex: String(r0._id) } })).toBe(5);
  });

  it("a rejection needs a note and ends the return", async () => {
    const v = await product("mug", 15000, 9);
    const d = await delivered([{ variant: v, qty: 1 }]);
    const ord = await orderOf(d.id);
    const r = await requestReturn(db, { userId: d.userId, orderNumber: ord.orderNumber, lines: [{ lineId: ord.lines[0]!.lineId, qty: 1 }], reason: "Changed my mind" });
    expect(await code(transitionReturn(db, { returnId: r._id, expectedVersion: r.version, to: "rejected", actor: staff }))).toBe("reason_required");
    await transitionReturn(db, { returnId: r._id, expectedVersion: r.version, to: "rejected", note: "Used item", actor: staff });
    expect(await code(transitionReturn(db, { returnId: r._id, expectedVersion: r.version + 1, to: "approved", actor: staff }))).toBe("transition_not_allowed");
    // A rejected return frees the quantity for a new request.
    expect(await code(requestReturn(db, { userId: d.userId, orderNumber: ord.orderNumber, lines: [{ lineId: ord.lines[0]!.lineId, qty: 1 }], reason: "Actually broken" }))).toBe("ok");
  });
});
