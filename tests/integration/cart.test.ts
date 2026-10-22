// B6 cart and quote against a real replica set: stock-limited adds, merge on sign-in, concurrent edits,
// coupons refused with their reason, promotions and flash sales re-priced on every read (notices for
// price changes and stock), and the first Owner from deployment credentials.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus, updateVariant } from "@/lib/modules/catalogue/products";
import { quoteLines } from "@/lib/modules/pricing/quote";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { bootstrapOwner } from "@/lib/modules/identity/bootstrap";
import { AUTH_COLLECTIONS } from "@/lib/modules/identity/schema";
import { activeCart, addToCart, applyCoupon, CommerceError, mergeDeviceCart, removeCoupon, setCartQuantity, viewCart } from "@/lib/modules/pricing/cart";
import { COUPONS, PROMOTIONS } from "@/lib/modules/pricing/schema";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: null };
const tag = randomUUID().slice(0, 6);
let cat: string;
let rice: { product: string; variant: string };
let oil: { product: string; variant: string };

async function product(slug: string, price: number, stock: number) {
  const id = String(await createProduct(db, client, actor, { slug: `${slug}-${tag}`, name: { bn: "পণ্য", en: slug }, primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  const v = String(await createVariant(db, client, actor, id, { sku: `S-${randomUUID().slice(0, 8).toUpperCase()}`, title: { bn: "প্যাক" }, options: [], price: { amountMinor: price, currency: "BDT" }, position: 0 }));
  if (stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: stock }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return { product: id, variant: v };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};

const now = new Date();
const coupon = (over: Record<string, unknown>) => ({
  _id: new ObjectId(),
  kind: "percent",
  value: 10,
  used: 0,
  startsAt: new Date(now.getTime() - 3600_000),
  eligibility: { firstOrderOnly: false, categoryIds: [], productIds: [], excludeCategoryIds: [], excludeProductIds: [], zoneIds: [] },
  status: "active",
  version: 1,
  createdAt: now,
  updatedAt: now,
  ...over,
});

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(await createCategory(db, client, actor, { slug: `food-${tag}`, parentId: null, name: { bn: "খাবার" }, position: 1 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  rice = await product("rice", 8500, 5);
  oil = await product("oil", 19000, 0);
});
afterAll(async () => cleanup());

describe("cart", () => {
  it("adds within available stock, merges a variant into one line, and refuses more than is available", async () => {
    const owner = { deviceId: `dev${randomUUID().replaceAll("-", "")}` };
    await addToCart(db, owner, rice.variant, 2);
    await addToCart(db, owner, rice.variant, 2);
    expect((await activeCart(db, owner))!.lines).toMatchObject([{ quantity: 4 }]);
    expect(await code(addToCart(db, owner, rice.variant, 2))).toBe("insufficient_stock");
    expect(await code(addToCart(db, owner, oil.variant, 1))).toBe("insufficient_stock");
    expect(await code(addToCart(db, owner, rice.variant, 0))).toBe("qty_range");
    expect(await code(addToCart(db, owner, String(new ObjectId()), 1))).toBe("not_found");
    await setCartQuantity(db, owner, rice.variant, 1);
    expect((await activeCart(db, owner))!.lines[0]!.quantity).toBe(1);
    await setCartQuantity(db, owner, rice.variant, 0);
    expect((await activeCart(db, owner))!.lines).toHaveLength(0);
  });

  it("concurrent adds from two tabs both land (compare-and-set, no lost update)", async () => {
    const owner = { userId: `u-${randomUUID()}` };
    await Promise.all([addToCart(db, owner, rice.variant, 1), addToCart(db, owner, rice.variant, 1), addToCart(db, owner, rice.variant, 1)]);
    const cart = (await activeCart(db, owner))!;
    expect(cart.lines[0]!.quantity).toBe(3);
    expect(await db.collection("carts").countDocuments({ userId: owner.userId, status: "active" })).toBe(1);
  });

  it("merges the device cart into the customer's cart on sign-in, once", async () => {
    const deviceId = `dev${randomUUID().replaceAll("-", "")}`;
    const userId = `u-${randomUUID()}`;
    await addToCart(db, { userId }, rice.variant, 1);
    await addToCart(db, { deviceId }, rice.variant, 2);
    await mergeDeviceCart(db, deviceId, userId);
    await mergeDeviceCart(db, deviceId, userId);
    expect((await activeCart(db, { userId }))!.lines[0]!.quantity).toBe(3);
    expect(await activeCart(db, { deviceId })).toBeNull();
  });
});

describe("coupons and quotes", () => {
  it("refuses unknown, expired and exhausted codes with their reason, and applies a valid one", async () => {
    await db.collection(COUPONS).insertMany([
      coupon({ code: `SAVE10${tag}`.toUpperCase() }),
      coupon({ code: `OLD${tag}`.toUpperCase(), endsAt: new Date(now.getTime() - 1000) }),
      coupon({ code: `GONE${tag}`.toUpperCase(), usageLimit: 1, used: 1 }),
    ] as never[]);
    const owner = { userId: `u-${randomUUID()}` };
    await addToCart(db, owner, rice.variant, 2);
    expect(await code(applyCoupon(db, owner, "NOPE123"))).toBe("coupon_not_found");
    expect(await code(applyCoupon(db, owner, `old${tag}`))).toBe("coupon_expired");
    expect(await code(applyCoupon(db, owner, `gone${tag}`))).toBe("coupon_limit_reached");
    await applyCoupon(db, owner, ` save10${tag} `);
    const view = await viewCart(db, owner);
    expect(view.quote!.priced.merchandise).toBe(17000);
    expect(view.quote!.priced.coupon).toMatchObject({ applied: true, discount: 1700 });
    await removeCoupon(db, owner);
    expect((await viewCart(db, owner)).quote!.priced.coupon).toBeNull();
  });

  it("re-prices on every read: a promotion shows, and its end raises the price with a notice", async () => {
    const owner = { userId: `u-${randomUUID()}` };
    await addToCart(db, owner, rice.variant, 1);
    const promo = { _id: new ObjectId(), name: { bn: "অফার" }, kind: "flash_sale", discount: { type: "percent", value: 20 }, scope: { type: "variants", ids: [new ObjectId(rice.variant)] }, startsAt: new Date(now.getTime() - 1000), endsAt: new Date(now.getTime() + 3600_000), sold: 0, status: "active", version: 1, createdAt: now, updatedAt: now };
    await db.collection(PROMOTIONS).insertOne(promo as never);
    const during = await viewCart(db, owner);
    expect(during.quote!.priced.lines[0]).toMatchObject({ unitPrice: 6800, appliedPromotion: { kind: "flash_sale" } });
    await db.collection(PROMOTIONS).updateOne({ _id: promo._id }, { $set: { endsAt: new Date(Date.now() - 1) } });
    const after = await viewCart(db, owner);
    expect(after.quote!.priced.lines[0]!.unitPrice).toBe(8500);
    expect(after.quote!.lines[0]!.notices).toContain("price_up");
    // Shown once: the next read has no notice.
    expect((await viewCart(db, owner)).quote!.lines[0]!.notices).not.toContain("price_up");
  });

  it("flags lines that went out of stock or were unpublished", async () => {
    const owner = { userId: `u-${randomUUID()}` };
    await addToCart(db, owner, rice.variant, 5);
    await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "adjust", reason: "damaged", lines: [{ variantId: rice.variant, qty: -3 }] });
    expect((await viewCart(db, owner)).quote!.lines[0]!.notices).toContain("insufficient_stock");
    await setProductStatus(db, client, actor, rice.product, (await getProduct(db, rice.product))!.product.version, "draft");
    const view = await viewCart(db, owner);
    expect(view.quote!.lines).toHaveLength(0);
    expect(view.quote!.unavailable[0]!.notices).toEqual(["unavailable"]);
  });
});

describe("tiers, free-delivery products and zone thresholds", () => {
  it("rejects tiers that do not fall with quantity, and prices with them; free delivery by product or threshold", async () => {
    const p = await product("tiered", 10000, 50);
    const v = (await db.collection<import("@/lib/modules/catalogue/schema").VariantDoc>("variants").findOne({ _id: new ObjectId(p.variant) }))!;
    const base = { sku: v.sku, title: v.title, options: [], price: v.price, position: 0 };
    await expect(updateVariant(db, client, actor, p.variant, v.version, { ...base, tiers: [{ minQty: 5, unitPrice: { amountMinor: 10000, currency: "BDT" } }] })).rejects.toMatchObject({ code: "tiers_invalid" });
    await expect(updateVariant(db, client, actor, p.variant, v.version, { ...base, tiers: [{ minQty: 5, unitPrice: { amountMinor: 9000, currency: "BDT" } }, { minQty: 3, unitPrice: { amountMinor: 8000, currency: "BDT" } }] })).rejects.toMatchObject({ code: "tiers_invalid" });
    await updateVariant(db, client, actor, p.variant, v.version, { ...base, tiers: [{ minQty: 5, unitPrice: { amountMinor: 9000, currency: "BDT" } }, { minQty: 10, unitPrice: { amountMinor: 8500, currency: "BDT" } }] });
    const settings = await getSettings(db);
    await upsertDeliveryZone(db, actor, settings.version, { id: "zone-t", name: { bn: "জোন" }, fee: { amountMinor: 6000, currency: "BDT" }, freeThreshold: { amountMinor: 100000, currency: "BDT" }, estimate: { bn: "১ দিন" }, areas: [], enabled: true });
    const q4 = await quoteLines(db, [{ variantId: new ObjectId(p.variant), quantity: 4 }], { zoneId: "zone-t" });
    expect(q4.priced.lines[0]).toMatchObject({ unitPrice: 10000, lineTotal: 40000 });
    expect(q4.priced.delivery).toMatchObject({ fee: 6000, missingForFree: 60000 });
    const q10 = await quoteLines(db, [{ variantId: new ObjectId(p.variant), quantity: 12 }], { zoneId: "zone-t" });
    expect(q10.priced.lines[0]).toMatchObject({ unitPrice: 8500, tierMinQty: 10, lineTotal: 102000 });
    expect(q10.priced.delivery).toMatchObject({ fee: 0, free: "threshold" });
    await db.collection("products").updateOne({ _id: new ObjectId(p.product) }, { $set: { freeDelivery: true } });
    const qFree = await quoteLines(db, [{ variantId: new ObjectId(p.variant), quantity: 1 }], { zoneId: "zone-t" });
    expect(qFree.priced.delivery).toMatchObject({ fee: 0, free: "products" });
  });
});

describe("first Owner from deployment credentials", () => {
  const env = { OWNER_EMAIL: `Owner-${tag}@Example.com`, OWNER_PASSWORD: "a long owner passphrase", OWNER_NAME: "Store Owner", AUTH_SECRET: "t".repeat(40), NEXT_PUBLIC_SITE_URL: "http://localhost:3000" };
  it("does nothing when not configured, creates once, never replaces, and syncs the password only on request", async () => {
    expect(await bootstrapOwner(db, client, {})).toEqual({ result: "skipped", reason: "not_configured" });
    expect(await bootstrapOwner(db, client, { ...env, OWNER_PASSWORD: "short" })).toEqual({ result: "refused", reason: "weak_password" });
    const created = await bootstrapOwner(db, client, env);
    expect(created.result).toBe("created");
    const user = await db.collection(AUTH_COLLECTIONS.user).findOne({ email: env.OWNER_EMAIL.toLowerCase() });
    expect(user).toMatchObject({ staffRoleKey: "owner", emailVerified: true });
    const account = await db.collection(AUTH_COLLECTIONS.account).findOne({ providerId: "credential" });
    expect(String(account!.password)).not.toContain(env.OWNER_PASSWORD);
    expect(await bootstrapOwner(db, client, env)).toEqual({ result: "exists" });
    expect(await bootstrapOwner(db, client, { ...env, OWNER_EMAIL: "other@example.com" }, { syncPassword: true })).toEqual({ result: "refused", reason: "other_owner" });
    const before = account!.password;
    expect((await bootstrapOwner(db, client, { ...env, OWNER_PASSWORD: "a new owner passphrase" }, { syncPassword: true })).result).toBe("password_synced");
    expect((await db.collection(AUTH_COLLECTIONS.account).findOne({ _id: account!._id }))!.password).not.toBe(before);
    expect(await db.collection("auditLog").countDocuments({ action: { $in: ["identity.owner_bootstrapped", "identity.owner_password_synced"] } })).toBe(2);
  });
});
