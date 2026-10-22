// B7 placement and order transitions against a real replica set (domain-rules §3, §4.1; build plan
// I1–I8): one transaction per placement, idempotent replays, no oversell under a race, coupon limits
// under concurrency, price changes refused, ordering off and sample products refused, the state
// machine with stock release and commit.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { createAddress, normaliseBdPhone } from "@/lib/modules/orders/addresses";
import { placeOrder, type PlaceOrderInput } from "@/lib/modules/orders/checkout";
import type { OrderDoc } from "@/lib/modules/orders/schema";
import { transitionOrder } from "@/lib/modules/orders/transitions";
import { addToCart, applyCoupon, CommerceError } from "@/lib/modules/pricing/cart";
import { quoteLines } from "@/lib/modules/pricing/quote";
import { SETTINGS, SETTINGS_ID } from "@/lib/modules/settings/schema";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: null };
const staff = { type: "staff" as const, id: "staff-1", role: "owner", ip: null };
const tag = randomUUID().slice(0, 6);
let cat: string;

async function product(slug: string, price: number, stock: number, extra: { sample?: true } = {}) {
  const id = String(await createProduct(db, client, actor, { slug: `${slug}-${tag}`, name: { bn: "প্রোডাক্ট", en: slug }, primaryCategoryId: cat, categoryIds: [cat], attributes: [], ...extra }));
  const v = String(await createVariant(db, client, actor, id, { sku: `S-${randomUUID().slice(0, 8).toUpperCase()}`, title: { bn: "প্যাক" }, options: [], price: { amountMinor: price, currency: "BDT" }, position: 0, ...extra }));
  if (stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: stock }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return { product: id, variant: v };
}

async function customer(lines: { variant: string; qty: number }[], coupon?: string) {
  const userId = `u-${randomUUID()}`;
  for (const l of lines) await addToCart(db, { userId }, l.variant, l.qty);
  if (coupon) await applyCoupon(db, { userId }, coupon);
  const addressId = String(await createAddress(db, userId, { label: "home", name: "রহিম", phone: "01712-345678", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "বাসা ১২, রোড ৩" }));
  const cart = (await db.collection("carts").findOne({ userId, status: "active" }))!;
  const quote = await quoteLines(db, cart.lines, { userId, couponCode: cart.couponCode, zoneId: "dhaka" });
  const input: PlaceOrderInput = { userId, customer: { name: "রহিম", email: `${userId}@example.com` }, addressId, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" };
  return { userId, input, total: quote.priced.total };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};
const stockOf = async (variant: string) => (await db.collection("stock").findOne({ variantId: new ObjectId(variant) }))!;
const setCheckout = (on: boolean) => db.collection(SETTINGS).updateOne({ _id: SETTINGS_ID } as never, { $set: { "features.checkout": on } });

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(await createCategory(db, client, actor, { slug: `food-${tag}`, parentId: null, name: { bn: "খাবার" }, position: 1 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "dhaka", name: { bn: "ঢাকা" }, fee: { amountMinor: 6000, currency: "BDT" }, estimate: { bn: "১-২ দিন" }, areas: [], enabled: true });
  await setCheckout(true);
});
afterAll(async () => cleanup());

describe("addresses", () => {
  it("normalises Bangladeshi mobile numbers to E.164 and refuses others", () => {
    expect(normaliseBdPhone("01712-345678")).toBe("+8801712345678");
    expect(normaliseBdPhone("+880 1912 345678")).toBe("+8801912345678");
    expect(normaliseBdPhone("০১৮১২৩৪৫৬৭৮")).toBe("+8801812345678");
    expect(normaliseBdPhone("01212345678")).toBeNull();
    expect(normaliseBdPhone("0171234567")).toBeNull();
  });
});

describe("placement", () => {
  it("I1: places one order in one transaction: reservation, ledger, snapshot, event, cart converted, email queued", async () => {
    const p = await product("rice", 8500, 10);
    const c = await customer([{ variant: p.variant, qty: 3 }]);
    const r = await placeOrder(db, client, c.input);
    expect(r.replayed).toBe(false);
    expect(r.orderNumber).toMatch(/^ORD-\d{6}-[A-Z0-9]{6}$/);
    const order = (await db.collection<OrderDoc>("orders").findOne({ orderNumber: r.orderNumber }))!;
    expect(order).toMatchObject({ status: "pending_confirmation", version: 1, paymentMethod: "cod", totals: { merchandise: 25500, delivery: 6000, grandTotal: 31500 }, address: { phone: "+8801712345678", zoneId: "dhaka" } });
    expect(order.lines[0]).toMatchObject({ unitPrice: 8500, quantity: 3, status: "active" });
    expect(await stockOf(p.variant)).toMatchObject({ onHand: 10, reserved: 3, available: 7 });
    const lineId = order.lines[0]!.lineId;
    expect(await db.collection("inventoryLedger").countDocuments({ idempotencyKey: `order:${String(order._id)}:${lineId}:reserve`, qty: 3 })).toBe(1);
    expect(await db.collection("reservations").countDocuments({ orderId: order._id, status: "active" })).toBe(1);
    expect(await db.collection("orderEvents").countDocuments({ orderId: order._id, seq: 1, to: "pending_confirmation" })).toBe(1);
    expect(await db.collection("carts").countDocuments({ userId: c.userId, status: "converted", convertedOrderId: order._id })).toBe(1);
    expect(await db.collection("outbox").countDocuments({ idempotencyKey: `email.send:order-${String(order._id)}:1` })).toBe(1);
  });

  it("I2: a double submit with the same key creates one order; the replay returns it", async () => {
    const p = await product("oil", 19000, 5);
    const c = await customer([{ variant: p.variant, qty: 1 }]);
    const results = await Promise.allSettled([placeOrder(db, client, c.input), placeOrder(db, client, c.input), placeOrder(db, client, c.input)]);
    const numbers = new Set(results.filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<{ orderNumber: string }>).value.orderNumber));
    expect(numbers.size).toBe(1);
    expect(await db.collection("orders").countDocuments({ userId: c.userId })).toBe(1);
    expect((await stockOf(p.variant)).reserved).toBe(1);
    expect((await placeOrder(db, client, c.input)).replayed).toBe(true);
  });

  it("I3: the same key with a different request is refused", async () => {
    const p = await product("salt", 3000, 5);
    const c = await customer([{ variant: p.variant, qty: 1 }]);
    await placeOrder(db, client, c.input);
    expect(await code(placeOrder(db, client, { ...c.input, note: "অন্য অনুরোধ" }))).toBe("idempotency_key_reused");
  });

  it("I4: two customers racing for the last unit: one order, stock never below zero", async () => {
    const p = await product("last", 5000, 1);
    const a = await customer([{ variant: p.variant, qty: 1 }]);
    const b = await customer([{ variant: p.variant, qty: 1 }]);
    const results = await Promise.all([code(placeOrder(db, client, a.input)), code(placeOrder(db, client, b.input))]);
    expect(results.filter((x) => x === "ok")).toHaveLength(1);
    expect(results.filter((x) => x === "insufficient_stock")).toHaveLength(1);
    expect(await stockOf(p.variant)).toMatchObject({ onHand: 1, reserved: 1, available: 0 });
  });

  it("I5: a coupon limited to 2 uses holds under 5 concurrent customers", async () => {
    const p = await product("tea", 20000, 50);
    const now = new Date();
    await db.collection("coupons").insertOne({ _id: new ObjectId(), code: `TWO${tag}`.toUpperCase(), kind: "fixed", value: 2000, used: 0, usageLimit: 2, startsAt: new Date(now.getTime() - 60_000), eligibility: { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] }, status: "active", version: 1, createdAt: now, updatedAt: now });
    const buyers = await Promise.all([1, 2, 3, 4, 5].map(() => customer([{ variant: p.variant, qty: 1 }], `two${tag}`)));
    const results = await Promise.all(buyers.map((c) => code(placeOrder(db, client, c.input))));
    expect(results.filter((x) => x === "ok")).toHaveLength(2);
    expect(results.filter((x) => x === "coupon_limit_reached")).toHaveLength(3);
    expect((await db.collection("coupons").findOne({ code: `TWO${tag}`.toUpperCase() }))!.used).toBe(2);
    expect(await db.collection("couponRedemptions").countDocuments({ status: "held" })).toBe(2);
    expect((await stockOf(p.variant)).reserved).toBe(2);
  });

  it("I6: a price change since the customer looked is refused with the new total and writes nothing", async () => {
    const p = await product("sugar", 12000, 5);
    const c = await customer([{ variant: p.variant, qty: 1 }]);
    await db.collection("variants").updateOne({ _id: new ObjectId(p.variant) }, { $set: { "price.amountMinor": 13000 } });
    let detail: Record<string, unknown> | undefined;
    try {
      await placeOrder(db, client, c.input);
    } catch (e) {
      detail = (e as CommerceError).detail;
      expect((e as CommerceError).code).toBe("price_changed");
    }
    expect(detail).toEqual({ total: 19000 });
    expect(await db.collection("orders").countDocuments({ userId: c.userId })).toBe(0);
    expect(await db.collection("idempotencyKeys").countDocuments({ principalId: c.userId })).toBe(0);
    expect((await stockOf(p.variant)).reserved).toBe(0);
    expect((await placeOrder(db, client, { ...c.input, expectedTotal: 19000, idempotencyKey: randomUUID() })).replayed).toBe(false);
  });

  it("I7: ordering off refuses placement; a sample product is never sold", async () => {
    const p = await product("flour", 7000, 5);
    const c = await customer([{ variant: p.variant, qty: 1 }]);
    await setCheckout(false);
    expect(await code(placeOrder(db, client, c.input))).toBe("checkout_disabled");
    await setCheckout(true);
    // Sample records publish only in a *_dev database; mark a published product as one directly.
    const s = await product("showcase", 7000, 5);
    await db.collection("products").updateOne({ _id: new ObjectId(s.product) }, { $set: { sample: true } });
    const d = await customer([{ variant: s.variant, qty: 1 }]);
    expect(await code(placeOrder(db, client, d.input))).toBe("sample_not_for_sale");
    expect((await stockOf(s.variant)).reserved).toBe(0);
  });
});

describe("transitions", () => {
  it("I8: confirm, refuse illegal and stale steps, customer cancel releases stock and the coupon", async () => {
    const p = await product("lentil", 15000, 10);
    const now = new Date();
    await db.collection("coupons").insertOne({ _id: new ObjectId(), code: `ONE${tag}`.toUpperCase(), kind: "fixed", value: 1000, used: 0, usageLimit: 1, startsAt: new Date(now.getTime() - 60_000), eligibility: { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] }, status: "active", version: 1, createdAt: now, updatedAt: now });
    const c = await customer([{ variant: p.variant, qty: 2 }], `one${tag}`);
    const placed = await placeOrder(db, client, c.input);
    const id = new ObjectId(placed.orderId);
    expect(await code(transitionOrder(db, client, { orderId: id, expectedVersion: 1, to: "shipped", actor: staff }))).toBe("transition_not_allowed");
    expect(await code(transitionOrder(db, client, { orderId: id, expectedVersion: 1, to: "rejected", actor: staff }))).toBe("reason_required");
    const confirmed = await transitionOrder(db, client, { orderId: id, expectedVersion: 1, to: "confirmed", actor: staff });
    expect(confirmed).toMatchObject({ status: "confirmed", version: 2 });
    expect(await code(transitionOrder(db, client, { orderId: id, expectedVersion: 1, to: "processing", actor: staff }))).toBe("version_conflict");
    expect(await code(transitionOrder(db, client, { orderId: id, expectedVersion: 2, to: "cancelled_by_customer", actor: { type: "customer", id: "someone-else" } }))).toBe("transition_not_allowed");
    await transitionOrder(db, client, { orderId: id, expectedVersion: 2, to: "cancelled_by_customer", actor: { type: "customer", id: c.userId } });
    expect(await stockOf(p.variant)).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
    expect((await db.collection("coupons").findOne({ code: `ONE${tag}`.toUpperCase() }))!.used).toBe(0);
    expect(await db.collection("couponRedemptions").countDocuments({ orderId: id, status: "released" })).toBe(1);
    expect(await db.collection("orderEvents").countDocuments({ orderId: id })).toBe(3);
    expect(await db.collection("auditLog").countDocuments({ action: "order.transition", "target.id": placed.orderNumber })).toBe(1);
  });

  it("I8b: shipping commits stock once; concurrent identical steps record one event", async () => {
    const p = await product("ghee", 90000, 4);
    const c = await customer([{ variant: p.variant, qty: 2 }]);
    const { orderId } = await placeOrder(db, client, c.input);
    const id = new ObjectId(orderId);
    let v = 1;
    for (const to of ["confirmed", "processing", "ready_to_ship"] as const) v = (await transitionOrder(db, client, { orderId: id, expectedVersion: v, to, actor: staff })).version;
    const both = await Promise.all([code(transitionOrder(db, client, { orderId: id, expectedVersion: v, to: "shipped", actor: staff })), code(transitionOrder(db, client, { orderId: id, expectedVersion: v, to: "shipped", actor: staff }))]);
    expect(both.filter((x) => x === "ok").length).toBeGreaterThanOrEqual(1);
    expect(await stockOf(p.variant)).toMatchObject({ onHand: 2, reserved: 0, available: 2 });
    expect(await db.collection("inventoryLedger").countDocuments({ refId: orderId, kind: "commit" })).toBe(1);
    expect(await db.collection("orderEvents").countDocuments({ orderId: id, to: "shipped" })).toBe(1);
  });
});
