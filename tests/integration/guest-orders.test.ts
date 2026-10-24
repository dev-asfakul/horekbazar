// Phase F part 3 (D28): guest checkout against a real replica set. The same placement transaction as a
// customer's order (stock, pricing, request key), a secret link stored only as a hash, claim only for
// a verified matching email, no per-customer coupons without an account, and no rewards for guests.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { cleanAddress } from "@/lib/modules/orders/addresses";
import { placeOrder, type PlaceOrderInput } from "@/lib/modules/orders/checkout";
import { claimGuestOrder, findGuestOrder, guestLinkFor, guestOrderToken, hashGuestToken } from "@/lib/modules/orders/guest";
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
const savedSecret = process.env.AUTH_SECRET;
const savedSite = process.env.NEXT_PUBLIC_SITE_URL;

async function product(slug: string, price: number, stock: number) {
  const id = String(await createProduct(db, client, actor, { slug: `${slug}-${tag}`, name: { bn: "প্রোডাক্ট", en: slug }, primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  const v = String(await createVariant(db, client, actor, id, { sku: `G-${randomUUID().slice(0, 8).toUpperCase()}`, title: { bn: "প্যাক" }, options: [], price: { amountMinor: price, currency: "BDT" }, position: 0 }));
  if (stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: stock }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return { product: id, variant: v };
}

async function guest(lines: { variant: string; qty: number }[], opts: { email?: string; coupon?: string } = {}) {
  const deviceId = randomBytes(16).toString("hex");
  for (const l of lines) await addToCart(db, { deviceId }, l.variant, l.qty);
  if (opts.coupon) await applyCoupon(db, { deviceId }, opts.coupon).catch(() => undefined);
  const cart = (await db.collection("carts").findOne({ deviceId, status: "active" }))!;
  const quote = await quoteLines(db, cart.lines, { couponCode: cart.couponCode, zoneId: "dhaka" });
  const address = await cleanAddress(db, { label: "home", name: "করিম", phone: "01812-345678", zoneId: "dhaka", district: "ঢাকা", area: "ধানমন্ডি", line: "বাসা ৫" });
  const input: PlaceOrderInput = { guest: { deviceId, address }, customer: { name: "করিম", email: opts.email ?? `g-${randomUUID().slice(0, 8)}@example.com` }, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" };
  return { deviceId, input };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};
const orderOf = async (orderNumber: string) => (await db.collection<OrderDoc>("orders").findOne({ orderNumber }))!;

beforeAll(async () => {
  process.env.AUTH_SECRET = randomBytes(32).toString("hex");
  process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example";
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(await createCategory(db, client, actor, { slug: `guest-${tag}`, parentId: null, name: { bn: "খাবার" }, position: 1 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "dhaka", name: { bn: "ঢাকা" }, fee: { amountMinor: 6000, currency: "BDT" }, estimate: { bn: "১-২ দিন" }, areas: [], enabled: true });
  await db.collection(SETTINGS).updateOne({ _id: SETTINGS_ID } as never, { $set: { "features.checkout": true } });
});
afterAll(async () => {
  if (savedSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = savedSecret;
  if (savedSite === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = savedSite;
  await cleanup();
});

describe("guest placement", () => {
  it("places an order from the device cart with the typed address, through the same transaction", async () => {
    const p = await product("dal", 12000, 5);
    const g = await guest([{ variant: p.variant, qty: 2 }]);
    const r = await placeOrder(db, client, g.input);
    const order = await orderOf(r.orderNumber);
    expect(order.userId).toBeUndefined();
    expect(order).toMatchObject({ status: "pending_confirmation", totals: { merchandise: 24000, delivery: 6000, grandTotal: 30000 }, address: { phone: "+8801812345678", zoneId: "dhaka", zoneName: { bn: "ঢাকা" } }, customer: { email: g.input.customer.email } });
    // Only the hash of the link is stored, and it is the hash of this order's link.
    const token = guestOrderToken(order._id);
    expect(order.guest!.tokenHash).toBe(hashGuestToken(token));
    expect(JSON.stringify(order)).not.toContain(token);
    expect(order.guest!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 179 * 86400_000);
    expect(guestLinkFor(order)).toBe(token);
    expect(await db.collection("stock").findOne({ variantId: new ObjectId(p.variant) })).toMatchObject({ reserved: 2, available: 3 });
    expect(await db.collection("carts").countDocuments({ deviceId: g.deviceId, status: "converted" })).toBe(1);
    // The confirmation email links to the secret page, not to an account page.
    const email = (await db.collection("outbox").findOne({ idempotencyKey: `email.send:order-${String(order._id)}:1` }))!;
    expect(JSON.stringify(email.payload)).toContain(`/order-status/${token}`);
    expect(JSON.stringify(email.payload)).not.toContain("/account/orders");
  });

  it("a double submit places one order; the replay returns it; a changed request is refused", async () => {
    const p = await product("tea", 25000, 5);
    const g = await guest([{ variant: p.variant, qty: 1 }]);
    const results = await Promise.allSettled([placeOrder(db, client, g.input), placeOrder(db, client, g.input), placeOrder(db, client, g.input)]);
    const numbers = new Set(results.filter((x) => x.status === "fulfilled").map((x) => (x as PromiseFulfilledResult<{ orderNumber: string }>).value.orderNumber));
    expect(numbers.size).toBe(1);
    expect(await db.collection("orders").countDocuments({ "customer.email": g.input.customer.email })).toBe(1);
    expect((await placeOrder(db, client, g.input)).replayed).toBe(true);
    expect(await code(placeOrder(db, client, { ...g.input, note: "অন্য" }))).toBe("idempotency_key_reused");
  });

  it("refuses a stale total, an empty device cart, and an input that is both or neither", async () => {
    const p = await product("ghee", 50000, 5);
    const g = await guest([{ variant: p.variant, qty: 1 }]);
    expect(await code(placeOrder(db, client, { ...g.input, expectedTotal: 1 }))).toBe("price_changed");
    expect(await code(placeOrder(db, client, { ...g.input, idempotencyKey: randomUUID(), guest: { ...g.input.guest!, deviceId: randomBytes(16).toString("hex") } }))).toBe("cart_empty");
    expect(await code(placeOrder(db, client, { ...g.input, idempotencyKey: randomUUID(), userId: "u-1" }))).toBe("address_required");
    expect(await code(placeOrder(db, client, { ...g.input, idempotencyKey: randomUUID(), guest: undefined }))).toBe("address_required");
  });

  it("a per-customer coupon needs an account; a general coupon works for guests", async () => {
    const now = new Date();
    const eligibility = { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] };
    await db.collection("coupons").insertOne({ _id: new ObjectId(), code: `ONCE${tag}`.toUpperCase(), kind: "fixed", value: 1000, used: 0, perCustomerLimit: 1, startsAt: new Date(now.getTime() - 60_000), eligibility, status: "active", version: 1, createdAt: now, updatedAt: now });
    await db.collection("coupons").insertOne({ _id: new ObjectId(), code: `ALL${tag}`.toUpperCase(), kind: "fixed", value: 1000, used: 0, startsAt: new Date(now.getTime() - 60_000), eligibility, status: "active", version: 1, createdAt: now, updatedAt: now });
    const p = await product("sugar", 9000, 10);
    const deviceId = randomBytes(16).toString("hex");
    await addToCart(db, { deviceId }, p.variant, 1);
    expect(await code(applyCoupon(db, { deviceId }, `ONCE${tag}`.toUpperCase()))).toBe("coupon_account_required");
    const g = await guest([{ variant: p.variant, qty: 1 }], { coupon: `ALL${tag}`.toUpperCase() });
    const order = await orderOf((await placeOrder(db, client, g.input)).orderNumber);
    expect(order.totals.coupon).toBe(1000);
    expect(await db.collection("couponRedemptions").countDocuments({ orderId: order._id, userId: `guest:${String(order._id)}` })).toBe(1);
    expect(await db.collection("couponCustomerUsage").countDocuments({ userId: `guest:${String(order._id)}` })).toBe(0);
  });
});

describe("guest order access and claim", () => {
  it("is found only by its link: never by order number, never after expiry", async () => {
    const p = await product("flour", 7000, 5);
    const g = await guest([{ variant: p.variant, qty: 1 }]);
    const r = await placeOrder(db, client, g.input);
    const token = guestOrderToken(r.orderId);
    expect((await findGuestOrder(db, token)).state).toBe("open");
    expect((await findGuestOrder(db, r.orderNumber)).state).toBe("not_found");
    expect((await findGuestOrder(db, guestOrderToken(new ObjectId()))).state).toBe("not_found");
    expect((await findGuestOrder(db, token, new Date(Date.now() + 181 * 86400_000))).state).toBe("expired");
  });

  it("claims only for a verified, matching email; once; the order then belongs to the account", async () => {
    const p = await product("rice2", 8000, 5);
    const email = `claim-${tag}@example.com`;
    const g = await guest([{ variant: p.variant, qty: 1 }], { email });
    const r = await placeOrder(db, client, g.input);
    const token = guestOrderToken(r.orderId);
    // An existing account with the same email but unverified, or a different verified email: refused.
    expect(await code(claimGuestOrder(db, token, { id: "u-a", email, emailVerified: false }))).toBe("claim_email_unverified");
    expect(await code(claimGuestOrder(db, token, { id: "u-b", email: `other-${tag}@example.com`, emailVerified: true }))).toBe("claim_not_allowed");
    expect((await orderOf(r.orderNumber)).userId).toBeUndefined();
    // Two claims racing: one wins.
    const both = await Promise.allSettled([claimGuestOrder(db, token, { id: "u-c", email: email.toUpperCase(), emailVerified: true }), claimGuestOrder(db, token, { id: "u-d", email, emailVerified: true })]);
    const order = await orderOf(r.orderNumber);
    expect(["u-c", "u-d"]).toContain(order.userId);
    expect(order.guest!.claimedAt).toBeInstanceOf(Date);
    expect(both.filter((b) => b.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    // After the claim the link no longer shows the order; it says where it went.
    expect((await findGuestOrder(db, token)).state).toBe("claimed");
    expect(await code(claimGuestOrder(db, token, { id: "u-z", email, emailVerified: true }))).toBe("claim_not_allowed");
    expect(await claimGuestOrder(db, token, { id: order.userId!, email, emailVerified: true })).toEqual({ orderNumber: r.orderNumber });
  });

  it("status changes keep emailing the guest with the secret link and earn no rewards", async () => {
    const p = await product("salt2", 3000, 5);
    const g = await guest([{ variant: p.variant, qty: 1 }]);
    const r = await placeOrder(db, client, g.input);
    const order = await orderOf(r.orderNumber);
    await transitionOrder(db, client, { orderId: order._id, expectedVersion: 1, to: "confirmed", actor: staff });
    const mail = await db.collection("outbox").find({ "payload.template": "order-status" }).toArray();
    const mine = mail.filter((m) => JSON.stringify(m.payload).includes(r.orderNumber));
    expect(mine.length).toBeGreaterThan(0);
    expect(JSON.stringify(mine[0]!.payload)).toContain(`/order-status/${guestOrderToken(order._id)}`);
    expect(await db.collection("rewardLedger").countDocuments({ orderId: order._id })).toBe(0);
  });
});
