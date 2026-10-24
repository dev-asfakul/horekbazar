// Cart service (B6; SCHEMA.md → Cart; domain-rules §4.1 "Cart"). One active cart per owner: a
// signed-in customer (`userId`) or a device (`deviceId`, an httpOnly cookie set by the cart actions).
// Prices are never stored for charging: every read re-prices through quoteLines. Every change is a
// compare-and-set on `version`, so concurrent tabs cannot lose each other's edits, and placement (B7)
// converts the cart with the same compare-and-set.
import { ObjectId, type Db } from "mongodb";
import { PRODUCTS, STOCK, VARIANTS, type ProductDoc, type StockDoc, type VariantDoc } from "../catalogue/schema.ts";
import { couponStateProblem, type CouponProblem } from "./engine.ts";
import { quoteLines, toCouponRule, type Quote } from "./quote.ts";
import { CARTS, COUPON_CODE, COUPONS, MAX_CART_LINES, MAX_LINE_QTY, type CartDoc, type CouponDoc } from "./schema.ts";

export type CartOwner = { userId: string } | { deviceId: string };

export type CommerceErrorCode =
  | "not_found"
  | "unavailable"
  | "insufficient_stock"
  | "qty_range"
  | "cart_full"
  | "busy"
  | `coupon_${CouponProblem}`
  | "coupon_invalid";

export class CommerceError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown> | undefined;
  constructor(code: string, detail?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

const ownerFilter = (owner: CartOwner) => ("userId" in owner ? { userId: owner.userId } : { deviceId: owner.deviceId });

export async function activeCart(db: Db, owner: CartOwner): Promise<CartDoc | null> {
  return db.collection<CartDoc>(CARTS).findOne({ ...ownerFilter(owner), status: "active" });
}

/** Read-modify-write with compare-and-set on `version`, retried a few times on a concurrent change. */
async function mutate(db: Db, owner: CartOwner, change: (cart: CartDoc) => Promise<CartDoc> | CartDoc): Promise<CartDoc> {
  const carts = db.collection<CartDoc>(CARTS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const now = new Date();
    const current = (await activeCart(db, owner)) ?? { _id: new ObjectId(), ...ownerFilter(owner), lines: [], status: "active" as const, version: 0, createdAt: now, updatedAt: now };
    // Shallow copies: structuredClone would turn ObjectIds into plain objects.
    const next = await change({ ...current, lines: current.lines.map((l) => ({ ...l })) });
    next.version = current.version + 1;
    next.updatedAt = now;
    if (current.version === 0 && !(await carts.findOne({ _id: current._id }))) {
      try {
        await carts.insertOne(next);
        return next;
      } catch (error) {
        if ((error as { code?: number }).code === 11000) continue; // another request created the cart first
        throw error;
      }
    }
    const res = await carts.replaceOne({ _id: current._id, version: current.version, status: "active" }, next);
    if (res.matchedCount === 1) return next;
  }
  throw new CommerceError("busy");
}

async function sellable(db: Db, variantId: ObjectId) {
  const variant = await db.collection<VariantDoc>(VARIANTS).findOne({ _id: variantId });
  if (!variant) throw new CommerceError("not_found");
  const product = await db.collection<ProductDoc>(PRODUCTS).findOne({ _id: variant.productId }, { projection: { status: 1 } });
  if (variant.status !== "active" || product?.status !== "published") throw new CommerceError("unavailable");
  const stock = await db.collection<StockDoc>(STOCK).findOne({ variantId }, { projection: { available: 1 } });
  return { available: stock?.available ?? 0 };
}

function parseVariant(id: string) {
  if (!ObjectId.isValid(id) || String(new ObjectId(id)) !== id) throw new CommerceError("not_found");
  return new ObjectId(id);
}

/** Adds `qty` of a variant (merging into its line). Refuses more than is available now. */
export async function addToCart(db: Db, owner: CartOwner, variantIdText: string, qty: number): Promise<CartDoc> {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) throw new CommerceError("qty_range");
  const variantId = parseVariant(variantIdText);
  const { available } = await sellable(db, variantId);
  return mutate(db, owner, (cart) => {
    const line = cart.lines.find((l) => l.variantId.equals(variantId));
    const total = (line?.quantity ?? 0) + qty;
    if (total > MAX_LINE_QTY) throw new CommerceError("qty_range", { max: MAX_LINE_QTY });
    if (total > available) throw new CommerceError("insufficient_stock", { available });
    if (line) line.quantity = total;
    else {
      if (cart.lines.length >= MAX_CART_LINES) throw new CommerceError("cart_full");
      cart.lines.push({ variantId, quantity: qty, addedAt: new Date() });
    }
    return cart;
  });
}

/** Sets a line's quantity; 0 removes it. Lowering is always allowed, raising needs stock. */
export async function setCartQuantity(db: Db, owner: CartOwner, variantIdText: string, qty: number): Promise<CartDoc> {
  if (!Number.isInteger(qty) || qty < 0 || qty > MAX_LINE_QTY) throw new CommerceError("qty_range");
  const variantId = parseVariant(variantIdText);
  const current = await activeCart(db, owner);
  const before = current?.lines.find((l) => l.variantId.equals(variantId))?.quantity ?? 0;
  const available = qty > before ? (await sellable(db, variantId)).available : Number.MAX_SAFE_INTEGER;
  return mutate(db, owner, (cart) => {
    const i = cart.lines.findIndex((l) => l.variantId.equals(variantId));
    if (i < 0) throw new CommerceError("not_found");
    if (qty === 0) cart.lines.splice(i, 1);
    else {
      if (qty > cart.lines[i]!.quantity && qty > available) throw new CommerceError("insufficient_stock", { available });
      cart.lines[i]!.quantity = qty;
    }
    return cart;
  });
}

export const removeFromCart = (db: Db, owner: CartOwner, variantId: string) => setCartQuantity(db, owner, variantId, 0);

/** Normalises what the customer typed: trimmed, upper case, Bengali digits to Latin. */
export function normaliseCouponCode(text: string): string {
  return text
    .trim()
    .replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)))
    .toUpperCase();
}

/**
 * Applies a coupon code. A code that does not exist or breaks a state rule (expired, limit reached,
 * already used …) is refused with its reason; eligibility for the current lines is shown by the
 * quote, because it changes as the cart changes.
 */
export async function applyCoupon(db: Db, owner: CartOwner, text: string, now = new Date()): Promise<CartDoc> {
  const code = normaliseCouponCode(text);
  if (!COUPON_CODE.test(code)) throw new CommerceError("coupon_not_found");
  const doc = await db.collection<CouponDoc>(COUPONS).findOne({ code });
  if (!doc) throw new CommerceError("coupon_not_found");
  const userId = "userId" in owner ? owner.userId : undefined;
  let used = 0;
  let hasOrders = false;
  if (userId) {
    used = (await db.collection<{ count: number }>("couponCustomerUsage").findOne({ couponId: doc._id, userId }))?.count ?? 0;
    hasOrders = (await db.collection("orders").countDocuments({ userId, status: { $nin: ["rejected", "cancelled_by_customer", "cancelled_by_store"] } }, { limit: 1 })) > 0;
  }
  const problem = couponStateProblem(toCouponRule(doc, { used, hasOrders, guest: !userId }), now);
  if (problem) throw new CommerceError(`coupon_${problem}`);
  return mutate(db, owner, (cart) => {
    if (cart.lines.length === 0) throw new CommerceError("not_found");
    cart.couponCode = code;
    return cart;
  });
}

export async function removeCoupon(db: Db, owner: CartOwner): Promise<CartDoc> {
  return mutate(db, owner, (cart) => {
    delete cart.couponCode;
    return cart;
  });
}

/**
 * Sign-in merge: device lines are added to the customer's cart (quantities summed, capped at the
 * line maximum), the device coupon is kept when the customer's cart has none, and the device cart is
 * removed. Running it twice is harmless: the device cart no longer exists the second time.
 */
export async function mergeDeviceCart(db: Db, deviceId: string, userId: string): Promise<CartDoc | null> {
  const device = await activeCart(db, { deviceId });
  if (!device) return activeCart(db, { userId });
  const merged = device.lines.length
    ? await mutate(db, { userId }, (cart) => {
        for (const dl of device.lines) {
          const line = cart.lines.find((l) => l.variantId.equals(dl.variantId));
          if (line) line.quantity = Math.min(MAX_LINE_QTY, line.quantity + dl.quantity);
          else if (cart.lines.length < MAX_CART_LINES) cart.lines.push(dl);
        }
        if (!cart.couponCode && device.couponCode) cart.couponCode = device.couponCode;
        return cart;
      })
    : await activeCart(db, { userId });
  await db.collection<CartDoc>(CARTS).deleteOne({ _id: device._id, version: device.version });
  return merged;
}

export interface CartView {
  cart: CartDoc | null;
  quote: Quote | null;
  count: number;
}

/** The cart re-priced now, with per-line notices; records the prices shown for the next notice. */
export async function viewCart(db: Db, owner: CartOwner, options: { zoneId?: string; now?: Date } = {}): Promise<CartView> {
  const cart = await activeCart(db, owner);
  if (!cart || cart.lines.length === 0) return { cart, quote: null, count: 0 };
  const seen = new Map(cart.lines.filter((l) => l.seenUnitPrice !== undefined).map((l) => [String(l.variantId), l.seenUnitPrice!]));
  const quote = await quoteLines(db, cart.lines, {
    ...("userId" in owner ? { userId: owner.userId } : {}),
    ...(cart.couponCode ? { couponCode: cart.couponCode } : {}),
    ...(options.zoneId ? { zoneId: options.zoneId } : {}),
    ...(options.now ? { now: options.now } : {}),
    seen,
  });
  // Remember what was shown, so a later change in price is noticed once. Best effort: a concurrent
  // edit wins and the notice simply shows again next time.
  const shown = new Map(quote.priced.lines.map((l) => [l.variantId, l.unitPrice]));
  if (cart.lines.some((l) => shown.has(String(l.variantId)) && l.seenUnitPrice !== shown.get(String(l.variantId)))) {
    const lines = cart.lines.map((l) => (shown.has(String(l.variantId)) ? { ...l, seenUnitPrice: shown.get(String(l.variantId))! } : l));
    await db.collection<CartDoc>(CARTS).updateOne({ _id: cart._id, version: cart.version }, { $set: { lines } });
  }
  return { cart, quote, count: cart.lines.reduce((a, l) => a + l.quantity, 0) };
}

export async function cartCount(db: Db, owner: CartOwner): Promise<number> {
  const cart = await activeCart(db, owner);
  return cart ? cart.lines.reduce((a, l) => a + l.quantity, 0) : 0;
}
