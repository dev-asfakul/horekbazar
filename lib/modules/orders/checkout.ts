// Order placement (B7; domain-rules §4.1 checkout placement, §5; SCHEMA.md checkout.place).
//
// One transaction: request-key insert, cart re-priced inside the transaction, the customer's expected
// total compared with the server's, every line's guarded stock update with its reservation and ledger
// row, flash-sale cap and coupon guarded increments, the order insert, the first orderEvents row, the
// cart compare-and-set to `converted`, the request-key result and the outbox email. Any failure rolls
// all of it back. A transient conflict is retried a bounded number of times, then CHECKOUT_BUSY.
// A replay (same key, same request; or an order already placed with this checkoutKey) returns the
// existing order instead of placing a second one.
//
// Placement is refused while the store has ordering off (`features.checkout`), and always for a
// product marked `sample` (showcase records: prices and stock are illustrative, never sold).
import { createHash, randomInt } from "node:crypto";
import { MongoServerError, ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { INVENTORY_LEDGER, STOCK, type InventoryLedgerDoc, type StockDoc } from "../catalogue/schema.ts";
import { isDuplicateKey } from "../catalogue/common.ts";
import { enqueueOutbox } from "../platform/outbox.ts";
import { CommerceError } from "../pricing/cart.ts";
import { loadSettingsFor, quoteLines } from "../pricing/quote.ts";
import { CARTS, COUPON_CUSTOMER_USAGE, COUPON_REDEMPTIONS, COUPONS, PROMOTIONS, type CartDoc, type CouponDoc } from "../pricing/schema.ts";
import { EMAIL_JOB } from "../../adapters/jobs/handlers.ts";
import { orderEmailExtras } from "./notify.ts";
import { GUEST_LINK_DAYS, guestOrderPath, guestOrderToken, hashGuestToken } from "./guest.ts";
import { ADDRESSES, IDEMPOTENCY_KEYS, ORDER_EVENTS, ORDERS, RESERVATIONS, type AddressDoc, type IdempotencyKeyDoc, type OrderDoc, type OrderLine } from "./schema.ts";

/** A guest's delivery address, already cleaned by orders/addresses.ts `cleanAddress`. */
export type GuestAddress = Omit<OrderDoc["address"], "zoneName">;

export interface PlaceOrderInput {
  /** A signed-in customer. Exactly one of `userId` and `guest` (Phase F, D28). */
  userId?: string | undefined;
  /** Guest checkout: the device cart and the address typed at checkout. */
  guest?: { deviceId: string; address: GuestAddress } | undefined;
  customer: { name: string; email: string };
  /** The signed-in customer's saved address. */
  addressId?: string | undefined;
  note?: string | undefined;
  expectedTotal: number;
  idempotencyKey: string;
  locale: "bn" | "en";
  now?: Date;
}

export type PlaceOrderResult = { orderNumber: string; orderId: string; replayed: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_TTL_MS = 7 * 24 * 3600_000;
const ATTEMPTS = 5;
const ORDER_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** PREFIX-YYMMDD-XXXXXX (Dhaka date, 6 random characters): readable, not sequential. */
export function newOrderNumber(prefix: string, now: Date): string {
  const d = new Date(now.getTime() + 6 * 3600_000);
  const date = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  let tail = "";
  for (let i = 0; i < 6; i++) tail += ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)];
  return `${prefix}-${date}-${tail}`;
}

export const orderPrefix = (raw: string | undefined) => {
  const p = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return p.length >= 2 ? p : "ORD";
};

const fingerprint = (input: PlaceOrderInput) =>
  createHash("sha256")
    .update(JSON.stringify({ a: input.addressId ?? input.guest?.address ?? null, e: input.guest ? input.customer.email.toLowerCase() : undefined, n: input.note?.trim() ?? "", t: input.expectedTotal }))
    .digest("hex");

/** The request-key owner: the customer, or the guest's device (hashed: the device id is a cart bearer). */
const principalOf = (input: PlaceOrderInput) => input.userId ?? `guest:${createHash("sha256").update(input.guest!.deviceId).digest("hex").slice(0, 40)}`;

const transient = (error: unknown) =>
  error instanceof MongoServerError && (error.hasErrorLabel("TransientTransactionError") || error.hasErrorLabel("UnknownTransactionCommitResult") || error.code === 112);

async function existing(db: Db, input: PlaceOrderInput): Promise<PlaceOrderResult | null> {
  const key = await db.collection<IdempotencyKeyDoc>(IDEMPOTENCY_KEYS).findOne({ scope: "checkout", principalId: principalOf(input), key: input.idempotencyKey });
  if (key && key.fingerprint !== fingerprint(input)) throw new CommerceError("idempotency_key_reused");
  // A guest's request key is committed with the order in one transaction, so its result names the order.
  const filter = input.userId ? { userId: input.userId, checkoutKey: input.idempotencyKey } : key?.resultRef && ObjectId.isValid(key.resultRef) ? { _id: new ObjectId(key.resultRef), userId: { $exists: false }, checkoutKey: input.idempotencyKey } : null;
  if (!filter) return null;
  const order = await db.collection<OrderDoc>(ORDERS).findOne(filter, { projection: { orderNumber: 1 } });
  return order ? { orderNumber: order.orderNumber, orderId: String(order._id), replayed: true } : null;
}

async function placeOnce(db: Db, session: ClientSession, input: PlaceOrderInput, now: Date): Promise<PlaceOrderResult> {
  const settings = await loadSettingsFor(db, session);
  await db.collection(IDEMPOTENCY_KEYS).insertOne(
    { _id: new ObjectId(), scope: "checkout", principalId: principalOf(input), key: input.idempotencyKey, fingerprint: fingerprint(input), expiresAt: new Date(now.getTime() + KEY_TTL_MS), createdAt: now },
    { session },
  );
  const cart = await db.collection<CartDoc>(CARTS).findOne(input.userId ? { userId: input.userId, status: "active" } : { deviceId: input.guest!.deviceId, status: "active" }, { session });
  if (!cart || cart.lines.length === 0) throw new CommerceError("cart_empty");
  let address: GuestAddress | AddressDoc;
  if (input.userId) {
    if (!input.addressId || !ObjectId.isValid(input.addressId)) throw new CommerceError("address_required");
    const saved = await db.collection<AddressDoc>(ADDRESSES).findOne({ _id: new ObjectId(input.addressId), userId: input.userId }, { session });
    if (!saved) throw new CommerceError("address_required");
    address = saved;
  } else {
    address = input.guest!.address;
  }
  const zone = settings.delivery.zones.find((z) => z.id === address.zoneId && z.enabled);
  if (!zone) throw new CommerceError("zone_unavailable");

  const quote = await quoteLines(db, cart.lines, { ...(input.userId ? { userId: input.userId } : {}), couponCode: cart.couponCode, zoneId: zone.id, now, session });
  if (quote.unavailable.length) throw new CommerceError("lines_unavailable", { lines: quote.unavailable.map((l) => l.variantId) });
  if (quote.lines.some((l) => l.product.sample)) throw new CommerceError("sample_not_for_sale");
  const short = quote.lines.filter((l) => l.available < l.quantity);
  if (short.length) throw new CommerceError("insufficient_stock", { lines: short.map((l) => ({ variantId: l.variantId, available: l.available })) });
  const priced = quote.priced;
  if (priced.coupon && !priced.coupon.applied) throw new CommerceError(`coupon_${priced.coupon.problem}`);
  if (!priced.delivery) throw new CommerceError("zone_unavailable");
  if (priced.total !== input.expectedTotal) throw new CommerceError("price_changed", { total: priced.total });

  const orderId = new ObjectId();
  // Who acted, in the ledger and order events: the customer, or this guest order.
  const actorId = input.userId ?? `guest:${String(orderId)}`;
  const guestToken = input.userId ? null : guestOrderToken(orderId);
  const lines: OrderLine[] = [];
  for (const [i, ql] of quote.lines.entries()) {
    const pl = priced.lines[i]!;
    const lineId = new ObjectId().toHexString();
    const after = await db.collection<StockDoc>(STOCK).findOneAndUpdate(
      { variantId: new ObjectId(ql.variantId), available: { $gte: ql.quantity } },
      { $inc: { reserved: ql.quantity, available: -ql.quantity, version: 1 }, $set: { updatedAt: now } },
      { session, returnDocument: "after" },
    );
    if (!after) throw new CommerceError("insufficient_stock", { lines: [{ variantId: ql.variantId }] });
    await db.collection(RESERVATIONS).insertOne({ _id: new ObjectId(), orderId, lineId, variantId: new ObjectId(ql.variantId), qty: ql.quantity, status: "active", createdAt: now, updatedAt: now }, { session });
    const ledger: Omit<InventoryLedgerDoc, "_id"> = {
      variantId: new ObjectId(ql.variantId),
      kind: "reserve",
      qty: ql.quantity,
      onHandAfter: after.onHand,
      reservedAfter: after.reserved,
      actor: { type: "customer", id: actorId },
      refType: "order",
      refId: String(orderId),
      lineRef: lineId,
      idempotencyKey: `order:${String(orderId)}:${lineId}:reserve`,
      createdAt: now,
    };
    await db.collection(INVENTORY_LEDGER).insertOne(ledger, { session });
    if (pl.appliedPromotion?.kind === "flash_sale") {
      const capped = await db.collection(PROMOTIONS).updateOne(
        { _id: new ObjectId(pl.appliedPromotion.id), status: "active", $or: [{ cap: { $exists: false } }, { $expr: { $lte: [{ $add: ["$sold", ql.quantity] }, "$cap"] } }] },
        { $inc: { sold: ql.quantity } },
        { session },
      );
      if (capped.matchedCount === 0) throw new CommerceError("price_changed", { reason: "flash_sale_sold_out" });
    }
    lines.push({
      lineId,
      variantId: new ObjectId(ql.variantId),
      productId: new ObjectId(ql.productId),
      sku: ql.variant.sku,
      slug: ql.product.slug,
      name: ql.product.name,
      variantTitle: ql.variant.title,
      options: ql.variant.options,
      ...(ql.product.media[0]?.publicId ? { imagePublicId: ql.product.media[0].publicId } : {}),
      basePrice: pl.basePrice,
      unitPrice: pl.unitPrice,
      quantity: pl.quantity,
      lineTotal: pl.lineTotal,
      couponShare: pl.couponAllocation,
      ...(pl.appliedPromotion ? { appliedPromotion: { id: new ObjectId(pl.appliedPromotion.id), kind: pl.appliedPromotion.kind } } : {}),
      ...(pl.tierMinQty ? { tierMinQty: pl.tierMinQty } : {}),
      status: "active",
    });
  }

  let coupon: OrderDoc["coupon"];
  if (priced.coupon?.applied) {
    const doc = await db.collection<CouponDoc>(COUPONS).findOneAndUpdate(
      { code: priced.coupon.code, status: "active", $or: [{ usageLimit: { $exists: false } }, { $expr: { $lt: ["$used", "$usageLimit"] } }] },
      { $inc: { used: 1 } },
      { session, returnDocument: "after" },
    );
    if (!doc) throw new CommerceError("coupon_limit_reached");
    const usage = db.collection(COUPON_CUSTOMER_USAGE);
    // A guest never reaches here with a per-customer or first-order coupon (pricing "account_required"),
    // and has no account to count usage against.
    if (!input.userId) {
      if (doc.perCustomerLimit !== undefined || doc.eligibility.firstOrderOnly) throw new CommerceError("coupon_account_required");
    } else if (doc.perCustomerLimit !== undefined) {
      try {
        await usage.updateOne({ couponId: doc._id, userId: input.userId, count: { $lt: doc.perCustomerLimit } }, { $inc: { count: 1 }, $set: { updatedAt: now } }, { session, upsert: true });
      } catch (error) {
        // The usage row exists at the limit, so the guarded filter missed and the upsert hit the unique index.
        if (isDuplicateKey(error)) throw new CommerceError("coupon_already_used");
        throw error;
      }
    } else {
      await usage.updateOne({ couponId: doc._id, userId: input.userId }, { $inc: { count: 1 }, $set: { updatedAt: now } }, { session, upsert: true });
    }
    await db.collection(COUPON_REDEMPTIONS).insertOne({ _id: new ObjectId(), couponId: doc._id, userId: actorId, orderId, amount: priced.coupon.discount + priced.coupon.deliveryCovered, status: "held", createdAt: now, updatedAt: now }, { session });
    coupon = { couponId: doc._id, code: doc.code, kind: doc.kind, discount: priced.coupon.discount };
  }

  const savings = priced.lines.reduce((a, l) => a + (l.basePrice - l.unitPrice) * l.quantity, 0);
  const orderNumber = newOrderNumber(orderPrefix(settings.orders?.numberPrefix), now);
  const order: OrderDoc = {
    _id: orderId,
    orderNumber,
    ...(input.userId ? { userId: input.userId } : { guest: { tokenHash: hashGuestToken(guestToken!), expiresAt: new Date(now.getTime() + GUEST_LINK_DAYS * 24 * 3600_000) } }),
    customer: { name: input.customer.name.slice(0, 120) || "—", email: input.customer.email },
    status: "pending_confirmation",
    lines,
    address: { label: address.label, name: address.name, phone: address.phone, zoneId: zone.id, zoneName: zone.name, district: address.district, area: address.area, line: address.line, ...(address.landmark ? { landmark: address.landmark } : {}) },
    delivery: { zoneId: zone.id, fee: priced.delivery.fee, baseFee: priced.delivery.baseFee, ...(priced.delivery.free ? { free: priced.delivery.free } : {}), ...(zone.estimate ? { estimate: zone.estimate } : {}) },
    totals: { merchandise: priced.merchandise, savings, coupon: priced.coupon?.applied ? priced.coupon.discount : 0, rewards: 0, delivery: priced.delivery.fee, grandTotal: priced.total },
    ...(coupon ? { coupon } : {}),
    paymentMethod: "cod",
    ...(input.note?.trim() ? { note: input.note.trim().slice(0, 500) } : {}),
    locale: input.locale,
    checkoutKey: input.idempotencyKey,
    version: 1,
    placedAt: now,
    statusChangedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<OrderDoc>(ORDERS).insertOne(order, { session });
  await db.collection(ORDER_EVENTS).insertOne({ _id: new ObjectId(), orderId, seq: 1, from: "placed", to: "pending_confirmation", actor: { type: "customer", id: actorId }, createdAt: now }, { session });
  const converted = await db.collection<CartDoc>(CARTS).updateOne({ _id: cart._id, version: cart.version, status: "active" }, { $set: { status: "converted", convertedOrderId: orderId, updatedAt: now }, $inc: { version: 1 } }, { session });
  if (converted.matchedCount === 0) throw new CommerceError("cart_changed");
  await db.collection(IDEMPOTENCY_KEYS).updateOne({ scope: "checkout", principalId: principalOf(input), key: input.idempotencyKey }, { $set: { resultRef: String(orderId), result: { orderNumber } } }, { session });
  await enqueueOutbox(db, { type: EMAIL_JOB, aggregateId: `order-${String(orderId)}`, seq: 1, payload: { template: "order-placed", to: input.customer.email, locale: input.locale, name: input.customer.name, orderNumber, ...orderEmailExtras(settings, input.locale, orderNumber, priced.total, guestToken ? guestOrderPath(input.locale, guestToken) : undefined) } }, { session, now });
  return { orderNumber, orderId: String(orderId), replayed: false };
}

export async function placeOrder(db: Db, client: MongoClient, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!UUID.test(input.idempotencyKey)) throw new CommerceError("idempotency_key_invalid");
  if (Boolean(input.userId) === Boolean(input.guest)) throw new CommerceError("address_required");
  if (input.guest && !/^[a-f0-9]{32}$/.test(input.guest.deviceId)) throw new CommerceError("cart_empty");
  if (!Number.isInteger(input.expectedTotal) || input.expectedTotal < 0) throw new CommerceError("price_changed");
  const settings = await loadSettingsFor(db);
  if (!settings.features.checkout) throw new CommerceError("checkout_disabled");
  const replay = await existing(db, input);
  if (replay) return replay;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const session = client.startSession();
    try {
      let result!: PlaceOrderResult;
      // One attempt per loop: our own bounded retry, so a long conflict ends in CHECKOUT_BUSY, not a hang.
      session.startTransaction({ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
      try {
        result = await placeOnce(db, session, input, input.now ?? new Date());
        await session.commitTransaction();
      } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
      }
      return result;
    } catch (error) {
      if (isDuplicateKey(error)) {
        // Same key or same checkoutKey committed by a concurrent request: return its order.
        const again = await existing(db, input);
        if (again) return again;
        if (attempt < ATTEMPTS) continue;
      }
      if (transient(error) && attempt < ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 20 * attempt + randomInt(30)));
        continue;
      }
      if (transient(error)) throw new CommerceError("checkout_busy");
      throw error;
    } finally {
      await session.endSession();
    }
  }
  throw new CommerceError("checkout_busy");
}
