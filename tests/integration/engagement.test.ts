// B9 engagement on a disposable replica set: reviews (verified purchase, moderation, public rating),
// rewards ledger (accrue on completion, reverse on settled returns, idempotent, off by default,
// staff adjustment) and messaging (ownership, order reference, duplicate submits, unread counters).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { createAddress } from "@/lib/modules/orders/addresses";
import { placeOrder } from "@/lib/modules/orders/checkout";
import { ORDERS, type OrderDoc } from "@/lib/modules/orders/schema";
import { transitionOrder } from "@/lib/modules/orders/transitions";
import { addToCart, CommerceError } from "@/lib/modules/pricing/cart";
import { quoteLines } from "@/lib/modules/pricing/quote";
import { SETTINGS, SETTINGS_ID } from "@/lib/modules/settings/schema";
import { getSettings, updateRewardSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { createShipment, transitionShipment } from "@/lib/modules/fulfilment/shipments";
import { inspectReturn, requestReturn, settleReturn, transitionReturn } from "@/lib/modules/fulfilment/returns";
import { RETURNS, type ReturnDoc, type ShipmentDoc, SHIPMENTS } from "@/lib/modules/fulfilment/schema";
import { customerReviews, moderateReview, productReviews, reviewableLines, submitReview } from "@/lib/modules/reviews/reviews";
import { adjustRewards, reverseForReturn, rewardSummary } from "@/lib/modules/rewards/rewards";
import { REWARD_LEDGER, REWARD_LOCKS } from "@/lib/modules/rewards/schema";
import { customerConversations, postMessage, readConversation, setConversationStatus, staffInbox, startConversation } from "@/lib/modules/messaging/messaging";
import { CONVERSATIONS, MESSAGES } from "@/lib/modules/messaging/schema";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: null };
const staff = { type: "staff" as const, id: "staff-1", role: "owner", ip: null };
const tag = randomUUID().slice(0, 6);
let cat: string;
let seq = 0;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};
const key = () => randomUUID();

async function product(slug: string, price: number, stock: number) {
  const id = String(await createProduct(db, client, actor, { slug: `${slug}-${tag}-${randomUUID().slice(0, 4)}`, name: { bn: "প্রোডাক্ট", en: slug }, primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  const v = String(await createVariant(db, client, actor, id, { sku: `S-${randomUUID().slice(0, 8).toUpperCase()}`, title: { bn: "প্যাক" }, options: [], price: { amountMinor: price, currency: "BDT" }, position: 0 }));
  await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: stock }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return { productId: id, variant: v };
}

const orderOf = async (id: ObjectId) => (await db.collection<OrderDoc>(ORDERS).findOne({ _id: id }))!;

/** Places an order for a new customer and walks it to `delivered` (or stops at `processing`). */
async function delivered(lines: { variant: string; qty: number }[], until: "processing" | "delivered" = "delivered", userId = `u-${randomUUID()}`) {
  for (const l of lines) await addToCart(db, { userId }, l.variant, l.qty);
  const addressId = String(await createAddress(db, userId, { label: "home", name: "রহিম", phone: "01712-345678", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "বাসা ১২, রোড ৩" }));
  const cart = (await db.collection("carts").findOne({ userId, status: "active" }))!;
  const quote = await quoteLines(db, cart.lines, { userId, couponCode: cart.couponCode, zoneId: "dhaka" });
  const { orderId } = await placeOrder(db, client, { userId, customer: { name: "রহিম উদ্দিন", email: `${userId}@example.com` }, addressId, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" });
  const id = new ObjectId(orderId);
  let v = 1;
  for (const to of ["confirmed", "processing", "ready_to_ship"] as const) {
    v = (await transitionOrder(db, client, { orderId: id, expectedVersion: v, to, actor: staff })).version;
    if (to === until) return { id, userId, orderId };
  }
  const s = await createShipment(db, { orderId: id, courier: "manual", carrierName: "Rider", consignmentId: `C-${tag}-${++seq}`, actor: staff });
  const ship = async (to: ShipmentDoc["status"]) => transitionShipment(db, { shipmentId: s._id, expectedVersion: (await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: s._id }))!.version, to, actor: staff });
  await ship("handed_over");
  await ship("delivered");
  return { id, userId, orderId };
}
const complete = async (id: ObjectId) => transitionOrder(db, client, { orderId: id, expectedVersion: (await orderOf(id)).version, to: "completed", actor: staff });

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(await createCategory(db, client, actor, { slug: `eng-${tag}`, parentId: null, name: { bn: "খাবার" }, position: 1 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "dhaka", name: { bn: "ঢাকা" }, fee: { amountMinor: 6000, currency: "BDT" }, estimate: { bn: "১-২ দিন" }, areas: [], enabled: true });
  await db.collection(SETTINGS).updateOne({ _id: SETTINGS_ID } as never, { $set: { "features.checkout": true } });
});
afterAll(async () => cleanup());

describe("reviews (B9, §10.4)", () => {
  it("only a customer's delivered line, once per order line, and nothing while the feature is off", async () => {
    const p = await product("tea", 25000, 10);
    const early = await delivered([{ variant: p.variant, qty: 1 }], "processing");
    const line = (await orderOf(early.id)).lines[0]!;
    const me = { id: early.userId, name: "রহিম উদ্দিন" };
    const input = { orderId: early.orderId, lineId: line.lineId, rating: 5, body: "ভালো চা" };
    expect(await code(submitReview(db, me, input, { enabled: false }))).toBe("reviews_off");
    expect(await code(submitReview(db, me, input, { enabled: true }))).toBe("review_not_eligible"); // not delivered yet
    const o = await delivered([{ variant: p.variant, qty: 2 }]);
    const l = (await orderOf(o.id)).lines[0]!;
    const buyer = { id: o.userId, name: "রহিম উদ্দিন" };
    const good = { orderId: o.orderId, lineId: l.lineId, rating: 4, title: "  Fresh ", body: "Good tea\u0007\n\n\n\nstrong" };
    expect(await code(submitReview(db, { id: "u-stranger", name: "X" }, good, { enabled: true }))).toBe("not_found"); // not their order
    expect(await code(submitReview(db, buyer, { ...good, rating: 6 }, { enabled: true }))).toBe("review_invalid");
    expect(await code(submitReview(db, buyer, { ...good, body: "   " }, { enabled: true }))).toBe("review_invalid");
    expect((await reviewableLines(db, o.userId)).map((x) => x.lineId)).toEqual([l.lineId]);
    await submitReview(db, buyer, good, { enabled: true });
    expect(await code(submitReview(db, buyer, good, { enabled: true }))).toBe("review_exists");
    const [mine] = await customerReviews(db, o.userId);
    expect(mine).toMatchObject({ status: "pending", authorName: "রহিম", title: "Fresh", body: "Good tea\n\nstrong" });
    expect((await reviewableLines(db, o.userId))[0]!.review).toMatchObject({ status: "pending", rating: 4 });
    // Pending reviews are not public and not counted.
    expect(await productReviews(db, p.productId)).toMatchObject({ count: 0, items: [] });
  });

  it("moderation publishes, rejects with a reason, replies only to published, and is version-checked", async () => {
    const p = await product("oil", 90000, 10);
    const a = await delivered([{ variant: p.variant, qty: 1 }]);
    const b = await delivered([{ variant: p.variant, qty: 1 }]);
    for (const [o, rating] of [[a, 5], [b, 2]] as const) {
      const l = (await orderOf(o.id)).lines[0]!;
      await submitReview(db, { id: o.userId, name: "Karim" }, { orderId: o.orderId, lineId: l.lineId, rating, body: `Rated ${rating}` }, { enabled: true });
    }
    const [ra] = await customerReviews(db, a.userId);
    const [rb] = await customerReviews(db, b.userId);
    expect(await code(moderateReview(db, actor, String(ra!._id), ra!.version, { kind: "reply", body: "Thanks" }))).toBe("transition_not_allowed");
    const pub = await moderateReview(db, actor, String(ra!._id), ra!.version, { kind: "publish" });
    expect(pub.status).toBe("published");
    expect(await code(moderateReview(db, actor, String(ra!._id), ra!.version, { kind: "publish" }))).toBe("version_conflict");
    expect(await code(moderateReview(db, actor, String(rb!._id), rb!.version, { kind: "reject", reason: " " }))).toBe("reason_required");
    const rej = await moderateReview(db, actor, String(rb!._id), rb!.version, { kind: "reject", reason: "Mentions a phone number" });
    expect(rej).toMatchObject({ status: "rejected", rejectionReason: "Mentions a phone number" });
    await moderateReview(db, actor, String(ra!._id), pub.version, { kind: "reply", body: "Thank you" });
    const pr = await productReviews(db, p.productId);
    expect(pr).toMatchObject({ count: 1, average: 5 });
    expect(pr.items[0]!.reply?.body).toBe("Thank you");
    expect(await db.collection("auditLog").countDocuments({ "target.type": "review", "target.id": { $in: [String(ra!._id), String(rb!._id)] } })).toBe(3);
  });

  it("one review per order line: the same product on a second order can be reviewed again, never the same line twice", async () => {
    const p = await product("flour", 12000, 20);
    const first = await delivered([{ variant: p.variant, qty: 1 }]);
    const second = await delivered([{ variant: p.variant, qty: 2 }], "delivered", first.userId);
    const me = { id: first.userId, name: "Nasima Begum" };
    const lines = await reviewableLines(db, first.userId);
    expect(lines.filter((l) => l.productId === p.productId)).toHaveLength(2);
    const l1 = (await orderOf(first.id)).lines[0]!;
    const l2 = (await orderOf(second.id)).lines[0]!;
    // Five concurrent submits for the same line create exactly one review.
    const results = await Promise.all(Array.from({ length: 5 }, () => code(submitReview(db, me, { orderId: first.orderId, lineId: l1.lineId, rating: 5, body: "Fine flour" }, { enabled: true }))));
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => r === "review_exists")).toHaveLength(4);
    // A second, distinct eligible line for the same product is its own review.
    expect(await code(submitReview(db, me, { orderId: second.orderId, lineId: l2.lineId, rating: 3, body: "Lumpy this time" }, { enabled: true }))).toBe("ok");
    // Editing or resubmitting a reviewed line is refused (a written review is final).
    expect(await code(submitReview(db, me, { orderId: second.orderId, lineId: l2.lineId, rating: 5, body: "Changed my mind" }, { enabled: true }))).toBe("review_exists");
    expect(await db.collection("reviews").countDocuments({ userId: first.userId })).toBe(2);
    // Identifier substitution: my order with another order's line id, another customer's order, junk ids.
    const other = await delivered([{ variant: p.variant, qty: 1 }]);
    const otherLine = (await orderOf(other.id)).lines[0]!;
    expect(await code(submitReview(db, me, { orderId: first.orderId, lineId: otherLine.lineId, rating: 5, body: "x" }, { enabled: true }))).toBe("not_found");
    expect(await code(submitReview(db, me, { orderId: other.orderId, lineId: otherLine.lineId, rating: 5, body: "x" }, { enabled: true }))).toBe("not_found");
    expect(await code(submitReview(db, me, { orderId: "not-an-id", lineId: l1.lineId, rating: 5, body: "x" }, { enabled: true }))).toBe("not_found");
    // Never purchased: a product with no order line of mine cannot be reviewed at all.
    expect((await reviewableLines(db, first.userId)).some((l) => l.productId === String(otherLine.productId) && l.orderId === other.orderId)).toBe(false);
    // The database enforces it too, whatever the service does.
    const dup = { ...(await db.collection("reviews").findOne({ orderId: first.id }))!, _id: new ObjectId() };
    expect(await code(db.collection("reviews").insertOne(dup))).toMatch(/E11000/);
    const names = (await db.collection("reviews").listIndexes().toArray()).map((i) => i.name);
    expect(names).toContain("orderId_lineId_unique");
    expect(names).not.toContain("userId_productId_unique");
  });

  it("public product reviews expose published reviews only, with public fields only", async () => {
    const p = await product("sugar", 15000, 10);
    const buyers = await Promise.all([1, 2, 3].map(() => delivered([{ variant: p.variant, qty: 1 }])));
    const ids: string[] = [];
    for (const [i, o] of buyers.entries()) {
      const l = (await orderOf(o.id)).lines[0]!;
      ids.push((await submitReview(db, { id: o.userId, name: "Rina Das" }, { orderId: o.orderId, lineId: l.lineId, rating: i + 3, body: `Review ${i}` }, { enabled: true })).id);
    }
    const v = async (id: string) => (await db.collection("reviews").findOne({ _id: new ObjectId(id) }))!.version as number;
    const pub = await moderateReview(db, actor, ids[0]!, await v(ids[0]!), { kind: "publish" });
    await moderateReview(db, actor, ids[0]!, pub.version, { kind: "reply", body: "Thanks" });
    await moderateReview(db, actor, ids[1]!, await v(ids[1]!), { kind: "reject", reason: "Contains a phone number" });
    // ids[2] stays pending.
    const pr = await productReviews(db, p.productId);
    expect(pr.count).toBe(1);
    expect(pr.average).toBe(3);
    expect(pr.items).toHaveLength(1);
    const item = pr.items[0]! as Record<string, unknown>;
    expect(Object.keys(item).sort()).toEqual(["_id", "authorName", "body", "createdAt", "rating", "reply"]);
    expect(Object.keys(item.reply as object).sort()).toEqual(["at", "body"]);
    // No reviews at all: zero count, no invented average.
    const none = await product("pepper", 9000, 5);
    expect(await productReviews(db, none.productId)).toEqual({ items: [], count: 0, average: 0 });
    const audit = await db.collection("auditLog").find({ "target.type": "review", "target.id": { $in: ids } }).toArray();
    expect(audit.map((a) => a.action).sort()).toEqual(["review.published", "review.rejected", "review.replied"].sort());
    expect(audit.every((a) => a.actor.id === actor.id)).toBe(true);
  });

  it("migration 0002 drops the old one-per-product index on a database that has it and keeps existing reviews", async () => {
    // A separate database shaped like one migrated from the earlier B9 commit.
    const old = await freshDb();
    try {
      const reviews = old.db.collection("reviews");
      await reviews.createIndex({ userId: 1, productId: 1 }, { name: "userId_productId_unique", unique: true });
      const now = new Date();
      const docs = [1, 2].map((n) => ({ _id: new ObjectId(), userId: `u-${n}`, productId: new ObjectId(), orderId: new ObjectId(), lineId: "a".repeat(24), rating: 4, body: `Existing ${n}`, authorName: "Rahim", status: "published", version: 2, createdAt: now, updatedAt: now }));
      await reviews.insertMany(docs);
      const r = await runMigrations(old.db);
      expect(r.applied).toContain("0002-reviews-one-per-order-line");
      const names = (await reviews.listIndexes().toArray()).map((i) => i.name);
      expect(names).toContain("orderId_lineId_unique");
      expect(names).not.toContain("userId_productId_unique");
      expect(await reviews.countDocuments()).toBe(2); // existing reviews are kept unchanged
      expect(await reviews.findOne({ _id: docs[0]!._id })).toMatchObject({ body: "Existing 1", status: "published" });
      expect((await runMigrations(old.db)).applied).toEqual([]); // idempotent
    } finally {
      await old.cleanup();
    }
  });
});

describe("rewards ledger (B9, §5.7)", () => {
  it("writes nothing while rewards are off (the default)", async () => {
    const p = await product("salt", 10000, 10);
    const o = await delivered([{ variant: p.variant, qty: 3 }]);
    await complete(o.id);
    expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: o.userId })).toBe(0);
    // Staff cannot write points either while the feature is off.
    expect(await code(adjustRewards(db, client, actor, { userId: o.userId, points: 10, reason: "Goodwill", idempotencyKey: key() }))).toBe("rewards_off");
    expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: o.userId })).toBe(0);
  });

  it("accrues once on completion, reverses in proportion on a settled return, never twice", async () => {
    const s = await getSettings(db);
    expect(await code(updateRewardSettings(db, actor, s.version, { enabled: true }))).toBe("Error: invalid"); // rules needed
    await updateRewardSettings(db, actor, s.version, { enabled: true, rules: { pointsPer100Taka: 2, expiryDays: 365 } });
    const p = await product("ghee", 50000, 10); // ৳500 each
    const o = await delivered([{ variant: p.variant, qty: 4 }]); // ৳2000 → 40 points
    // The customer asks to return one before the order completes; the goods come back afterwards.
    const line = (await orderOf(o.id)).lines[0]!;
    const r0 = await requestReturn(db, { userId: o.userId, orderNumber: (await orderOf(o.id)).orderNumber, lines: [{ lineId: line.lineId, qty: 1 }], reason: "Leaking" });
    const at = async () => (await db.collection<ReturnDoc>(RETURNS).findOne({ _id: r0._id }))!;
    await transitionReturn(db, { returnId: r0._id, expectedVersion: r0.version, to: "approved", actor: staff });
    await complete(o.id);
    const first = await rewardSummary(db, o.userId);
    expect(first.balance).toBe(40); // unsettled returns do not lower the accrual
    expect(first.entries[0]).toMatchObject({ kind: "accrue", points: 40, basisMinor: 200000 });
    expect(first.entries[0]!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 364 * 86_400_000);
    // A retried accrual with the same key is a no-op (unique idempotencyKey).
    const { accrueForOrder } = await import("@/lib/modules/rewards/rewards");
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await accrueForOrder(db, session, await orderOf(o.id), await getSettings(db), new Date());
      });
    } finally {
      await session.endSession();
    }
    expect((await rewardSummary(db, o.userId)).balance).toBe(40);
    // One of four settled → 10 points reversed, once.
    await transitionReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, to: "received", actor: staff });
    await inspectReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, outcomes: { [line.lineId]: { outcome: "restock" } }, actor: staff });
    await settleReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, actor: staff });
    const after = await rewardSummary(db, o.userId);
    expect(after.balance).toBe(30);
    expect(after.entries[0]).toMatchObject({ kind: "reverse", points: -10 });
    expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: o.userId, kind: "reverse" })).toBe(1);
    // A repeated settlement is refused by the return state machine, and a replayed reversal is a no-op.
    expect(await code(settleReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, actor: staff }))).not.toBe("ok");
    const replay = client.startSession();
    try {
      await replay.withTransaction(async () => {
        await reverseForReturn(db, replay, await at(), await orderOf(o.id), new Date());
      });
    } finally {
      await replay.endSession();
    }
    expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: o.userId, kind: "reverse" })).toBe(1);
    expect((await rewardSummary(db, o.userId)).balance).toBe(30);
  });

  it("an order completing while its return settles is counted exactly once, whichever commits first", async () => {
    const p = await product("honey", 50000, 20); // ৳500 each, 2 points per ৳100
    for (let run = 0; run < 3; run++) {
      const o = await delivered([{ variant: p.variant, qty: 4 }]);
      const ord = await orderOf(o.id);
      const line = ord.lines[0]!;
      const r0 = await requestReturn(db, { userId: o.userId, orderNumber: ord.orderNumber, lines: [{ lineId: line.lineId, qty: 1 }], reason: "Crystallised" });
      const at = async () => (await db.collection<ReturnDoc>(RETURNS).findOne({ _id: r0._id }))!;
      await transitionReturn(db, { returnId: r0._id, expectedVersion: r0.version, to: "approved", actor: staff });
      await transitionReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, to: "received", actor: staff });
      await inspectReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, outcomes: { [line.lineId]: { outcome: "restock" } }, actor: staff });
      const v = (await at()).version;
      await Promise.all([complete(o.id), settleReturn(db, { returnId: r0._id, expectedVersion: v, actor: staff })]);
      // Kept 3 of 4 × ৳500 = ৳1500 → 30 points, either as 40 − 10 or as a 30-point accrual.
      expect((await rewardSummary(db, o.userId)).balance).toBe(30);
      expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: o.userId, kind: "accrue" })).toBe(1);
      expect(await db.collection(REWARD_LOCKS).countDocuments({ _id: o.userId as never })).toBe(1);
    }
  });

  it("a return settled before completion lowers the accrual instead", async () => {
    const p = await product("lentil", 20000, 10); // ৳200 each
    const o = await delivered([{ variant: p.variant, qty: 5 }]); // ৳1000
    const ord = await orderOf(o.id);
    const line = ord.lines[0]!;
    const r0 = await requestReturn(db, { userId: o.userId, orderNumber: ord.orderNumber, lines: [{ lineId: line.lineId, qty: 2 }], reason: "Torn bag" });
    const at = async () => (await db.collection<ReturnDoc>(RETURNS).findOne({ _id: r0._id }))!;
    await transitionReturn(db, { returnId: r0._id, expectedVersion: r0.version, to: "approved", actor: staff });
    await transitionReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, to: "received", actor: staff });
    await inspectReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, outcomes: { [line.lineId]: { outcome: "write_off" } }, actor: staff });
    await settleReturn(db, { returnId: r0._id, expectedVersion: (await at()).version, actor: staff });
    expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: o.userId })).toBe(0); // nothing accrued yet, nothing reversed
    await complete(o.id);
    expect((await rewardSummary(db, o.userId)).balance).toBe(12); // ৳600 kept × 2 / ৳100
  });

  it("staff adjustments need a reason and a key, are idempotent, audited, and cannot go below zero", async () => {
    const u = `u-${randomUUID()}`;
    const k = key();
    expect(await code(adjustRewards(db, client, actor, { userId: u, points: 5, reason: "", idempotencyKey: k }))).toBe("reason_required");
    expect(await code(adjustRewards(db, client, actor, { userId: u, points: 0, reason: "x", idempotencyKey: k }))).toBe("invalid_value");
    expect(await code(adjustRewards(db, client, actor, { userId: u, points: 5, reason: "x", idempotencyKey: "short" }))).toBe("idempotency_key_invalid");
    expect(await code(adjustRewards(db, client, actor, { userId: u, points: -1, reason: "x", idempotencyKey: k }))).toBe("rewards_insufficient");
    await adjustRewards(db, client, actor, { userId: u, points: 25, reason: "Goodwill for a late delivery", idempotencyKey: k });
    await adjustRewards(db, client, actor, { userId: u, points: 25, reason: "Goodwill for a late delivery", idempotencyKey: k }); // retry
    expect(await code(adjustRewards(db, client, actor, { userId: u, points: 30, reason: "changed", idempotencyKey: k }))).toBe("idempotency_key_reused");
    expect((await rewardSummary(db, u)).balance).toBe(25);
    expect(await db.collection("auditLog").countDocuments({ action: "rewards.adjusted", "target.id": u })).toBe(1);
    expect(await db.collection("auditLog").findOne({ action: "rewards.adjusted", "target.id": u })).toMatchObject({ actor: { id: actor.id } });
    // Two concurrent deductions cannot both pass the balance check.
    const both = await Promise.all([code(adjustRewards(db, client, actor, { userId: u, points: -20, reason: "Correction A", idempotencyKey: key() })), code(adjustRewards(db, client, actor, { userId: u, points: -20, reason: "Correction B", idempotencyKey: key() }))]);
    expect(both.sort()).toEqual(["ok", "rewards_insufficient"]);
    expect((await rewardSummary(db, u)).balance).toBe(5);
    expect(await db.collection(REWARD_LEDGER).countDocuments({ userId: u })).toBe(2);
  });

  it("expired accruals stop counting towards the balance", async () => {
    const u = `u-${randomUUID()}`;
    const past = new Date(Date.now() - 1000);
    await db.collection(REWARD_LEDGER).insertOne({ _id: new ObjectId(), userId: u, kind: "accrue", points: 50, basisMinor: 250000, expiresAt: past, actor: { type: "system", id: "order.completed" }, idempotencyKey: `test:${u}`, createdAt: new Date(Date.now() - 86_400_000) });
    expect((await rewardSummary(db, u)).balance).toBe(0);
    // A reversal of the expired accrual must not reduce newer, unexpired points.
    const oldOrder = new ObjectId();
    await db.collection(REWARD_LEDGER).updateOne({ idempotencyKey: `test:${u}` }, { $set: { orderId: oldOrder } });
    await db.collection(REWARD_LEDGER).insertOne({ _id: new ObjectId(), userId: u, kind: "reverse", points: -20, orderId: oldOrder, actor: { type: "system", id: "return.settled" }, idempotencyKey: `test:${u}:rev`, createdAt: new Date() });
    await db.collection(REWARD_LEDGER).insertOne({ _id: new ObjectId(), userId: u, kind: "accrue", points: 30, orderId: new ObjectId(), basisMinor: 150000, expiresAt: new Date(Date.now() + 86_400_000), actor: { type: "system", id: "order.completed" }, idempotencyKey: `test:${u}:new`, createdAt: new Date() });
    expect((await rewardSummary(db, u)).balance).toBe(30);
  });
});

describe("messaging (B9, §10.4)", () => {
  it("customers see only their own conversations; order references must be theirs; duplicates post once", async () => {
    const p = await product("rice", 60000, 10);
    const o = await delivered([{ variant: p.variant, qty: 1 }], "processing");
    const me = { id: o.userId, name: "Rahim" };
    const number = (await orderOf(o.id)).orderNumber;
    expect(await code(startConversation(client, db, me, { subject: "Where is it?", body: "Hi", orderNumber: "ORD-000000-ZZZZZZ", clientKey: key() }))).toBe("not_found");
    expect(await code(startConversation(client, db, me, { subject: "", body: "Hi", clientKey: key() }))).toBe("message_invalid");
    expect(await code(startConversation(client, db, me, { subject: "x", body: "Hi", clientKey: "bad" }))).toBe("idempotency_key_invalid");
    const k = key();
    const c1 = await startConversation(client, db, me, { subject: "Delivery time", body: "When will it arrive?", orderNumber: number, clientKey: k });
    const c2 = await startConversation(client, db, me, { subject: "Delivery time", body: "When will it arrive?", orderNumber: number, clientKey: k });
    expect(c2).toEqual({ id: c1.id, created: false });
    expect(await customerConversations(db, o.userId)).toHaveLength(1);
    expect(await readConversation(db, { from: "customer", userId: "u-other" }, c1.id)).toBeNull();
    expect(await code(postMessage(client, db, { from: "customer", customer: { id: "u-other", name: "X" } }, c1.id, { body: "hi", clientKey: key() }))).toBe("not_found");

    const inbox = await staffInbox(db, {});
    const row = inbox.items.find((c) => String(c._id) === c1.id)!;
    expect(row).toMatchObject({ unreadByStaff: 1, orderNumber: number, customerName: "Rahim" });
    const rk = key();
    await postMessage(client, db, { from: "staff", actor }, c1.id, { body: "Tomorrow", clientKey: rk });
    await postMessage(client, db, { from: "staff", actor }, c1.id, { body: "Tomorrow", clientKey: rk });
    const staffView = await readConversation(db, { from: "staff" }, c1.id);
    expect(staffView!.messages.map((m) => m.from)).toEqual(["customer", "staff"]);
    const mineView = await readConversation(db, { from: "customer", userId: o.userId }, c1.id);
    expect(mineView!.conversation.unreadByCustomer).toBe(0);
    expect(await db.collection(MESSAGES).countDocuments({ conversationId: new ObjectId(c1.id) })).toBe(2);
  });

  it("staff close (version-checked); staff cannot post to a closed one; a customer message reopens it", async () => {
    const me = { id: `u-${randomUUID()}`, name: "Salma" };
    const c = await startConversation(client, db, me, { subject: "Size", body: "Do you have 5 kg?", clientKey: key() });
    const conv = (await readConversation(db, { from: "staff" }, c.id))!.conversation;
    expect(await code(setConversationStatus(db, actor, c.id, conv.version + 5, "closed"))).toBe("version_conflict");
    await setConversationStatus(db, actor, c.id, conv.version, "closed");
    expect(await code(postMessage(client, db, { from: "staff", actor }, c.id, { body: "x", clientKey: key() }))).toBe("conversation_closed");
    await postMessage(client, db, { from: "customer", customer: me }, c.id, { body: "One more question", clientKey: key() });
    expect((await readConversation(db, { from: "staff" }, c.id))!.conversation.status).toBe("open");
  });
  it("rejects another customer's order, keeps unread counters right, and reopens by staff", async () => {
    const p = await product("dates", 40000, 10);
    const theirs = await delivered([{ variant: p.variant, qty: 1 }], "processing");
    const me = { id: `u-${randomUUID()}`, name: "Jamal" };
    const theirNumber = (await orderOf(theirs.id)).orderNumber;
    expect(await code(startConversation(client, db, me, { subject: "Order", body: "Status?", orderNumber: theirNumber, clientKey: key() }))).toBe("not_found");
    expect(await db.collection(CONVERSATIONS).countDocuments({ userId: me.id })).toBe(0);
    const c = await startConversation(client, db, me, { subject: "Question", body: "First", clientKey: key() });
    await postMessage(client, db, { from: "customer", customer: me }, c.id, { body: "Second", clientKey: key() });
    expect((await staffInbox(db, {})).items.find((x) => String(x._id) === c.id)).toMatchObject({ unreadByStaff: 2, unreadByCustomer: 0 });
    // Reading as staff clears the staff counter only; a staff reply counts for the customer.
    await readConversation(db, { from: "staff" }, c.id);
    await postMessage(client, db, { from: "staff", actor }, c.id, { body: "Answer", clientKey: key() });
    const raw = async () => (await db.collection(CONVERSATIONS).findOne({ _id: new ObjectId(c.id) }))!;
    expect(await raw()).toMatchObject({ unreadByStaff: 0, unreadByCustomer: 1, messageCount: 3, lastFrom: "staff" });
    // Someone else reading does not clear my counter; I do.
    expect(await readConversation(db, { from: "customer", userId: theirs.userId }, c.id)).toBeNull();
    expect((await raw()).unreadByCustomer).toBe(1);
    await readConversation(db, { from: "customer", userId: me.id }, c.id);
    expect((await raw()).unreadByCustomer).toBe(0);
    // Close, then reopen by staff (version-checked), then staff may post again.
    await setConversationStatus(db, actor, c.id, (await raw()).version, "closed");
    await setConversationStatus(db, actor, c.id, (await raw()).version, "open");
    expect(await code(postMessage(client, db, { from: "staff", actor }, c.id, { body: "Anything else?", clientKey: key() }))).toBe("ok");
    expect(await db.collection("auditLog").countDocuments({ "target.type": "conversation", "target.id": c.id })).toBeGreaterThanOrEqual(3);
    // Junk and unknown ids reveal nothing.
    expect(await code(postMessage(client, db, { from: "customer", customer: me }, "not-an-id", { body: "x", clientKey: key() }))).toBe("not_found");
    expect(await code(postMessage(client, db, { from: "customer", customer: me }, String(new ObjectId()), { body: "x", clientKey: key() }))).toBe("not_found");
    // A client key reused on a different conversation is refused, not silently dropped.
    const k = key();
    await postMessage(client, db, { from: "customer", customer: me }, c.id, { body: "Keyed", clientKey: k });
    const other = await startConversation(client, db, me, { subject: "Another", body: "Hi", clientKey: key() });
    expect(await code(postMessage(client, db, { from: "customer", customer: me }, other.id, { body: "Keyed", clientKey: k }))).toBe("idempotency_key_reused");
    // Customers' own list is scoped to them.
    expect((await customerConversations(db, me.id)).every((x) => x.userId === me.id)).toBe(true);
    expect(await customerConversations(db, theirs.userId)).toHaveLength(0);
  });
});
