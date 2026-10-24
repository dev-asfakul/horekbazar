// Orders module schemas (B7; SCHEMA.md → Order and OrderLine, Address, reservations, orderEvents,
// idempotencyKeys; domain-rules §3, §4.1). Zod is the source of the committed validators.
//
// Addresses are their own collection (one document per saved address, owned by `userId`) rather than
// embedded in the auth user document: Better Auth owns that document's shape, and a separate
// collection gives each address its own version for compare-and-set. Orders keep a snapshot.
// Location is the D21(b) interim until D12 (the location dataset) is decided: a delivery zone chosen
// from the store's zones plus free-text district and area.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";
import { localizedText } from "../catalogue/schema.ts";

export const ADDRESSES = "addresses";
export const ORDERS = "orders";
export const RESERVATIONS = "reservations";
export const ORDER_EVENTS = "orderEvents";
export const IDEMPOTENCY_KEYS = "idempotencyKeys";

export const MAX_ADDRESSES = 10;
/** Bangladeshi mobile number in E.164 (D13): +880 1[3-9] then 8 digits. */
export const BD_PHONE_E164 = /^\+8801[3-9]\d{8}$/;

const text = (max: number) => z.string().trim().min(1).max(max);

export const addressSchema = z
  .object({
    _id: zObjectId(),
    userId: z.string().min(1).max(100),
    label: z.enum(["home", "office", "other"]),
    name: text(80),
    phone: z.string().regex(BD_PHONE_E164),
    zoneId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    district: text(60),
    area: text(80),
    line: text(200),
    landmark: text(120).optional(),
    isDefault: z.boolean(),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type AddressDoc = z.infer<typeof addressSchema>;

export const ORDER_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "processing",
  "ready_to_ship",
  "shipped",
  "delivered",
  "delivery_failed",
  "returned_to_origin",
  "completed",
  "rejected",
  "cancelled_by_customer",
  "cancelled_by_store",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const LINE_STATUSES = ["active", "cancelled", "shipped", "delivered", "returned"] as const;

const money = zInt().min(0).max(10_000_000_000);

export const orderLineSchema = z
  .object({
    /** Stable line identity (ObjectId hex), created at placement, never reused (§4.1). */
    lineId: z.string().regex(/^[a-f0-9]{24}$/),
    variantId: zObjectId(),
    productId: zObjectId(),
    sku: z.string().min(1).max(64),
    slug: z.string().min(1).max(120),
    name: localizedText(200),
    variantTitle: localizedText(120),
    options: z.array(z.object({ key: z.string().min(1).max(40), value: localizedText(80) }).strict()).max(5),
    imagePublicId: z.string().max(300).optional(),
    basePrice: money,
    unitPrice: money,
    quantity: zInt().min(1).max(99),
    lineTotal: money,
    /** This line's share of the coupon discount (largest remainder, §5.3). */
    couponShare: money,
    appliedPromotion: z.object({ id: zObjectId(), kind: z.enum(["product", "flash_sale"]) }).strict().optional(),
    tierMinQty: zInt().min(2).optional(),
    status: z.enum(LINE_STATUSES),
  })
  .strict();
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderSchema = z
  .object({
    _id: zObjectId(),
    /** Human-readable, random part: never exposes the database id or the store's volume. */
    orderNumber: z.string().regex(/^[A-Z0-9]{2,6}-\d{6}-[A-Z0-9]{6}$/),
    /** The customer's account. Absent on a guest order until it is claimed (Phase F, D28). */
    userId: z.string().min(1).max(100).optional(),
    customer: z.object({ name: text(120), email: z.string().max(254) }).strict(),
    /**
     * Guest checkout (D28): only the SHA-256 of the secret link token (orders/guest.ts), when the link
     * stops working, and when a verified account claimed the order. Never the token itself.
     */
    guest: z
      .object({
        tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
        expiresAt: zDate(),
        claimedAt: zDate().optional(),
      })
      .strict()
      .optional(),
    status: z.enum(ORDER_STATUSES),
    lines: z.array(orderLineSchema).min(1).max(50),
    address: z
      .object({
        label: z.enum(["home", "office", "other"]),
        name: text(80),
        phone: z.string().regex(BD_PHONE_E164),
        zoneId: z.string().min(1).max(40),
        zoneName: localizedText(60),
        district: text(60),
        area: text(80),
        line: text(200),
        landmark: text(120).optional(),
      })
      .strict(),
    delivery: z.object({ zoneId: z.string().min(1).max(40), fee: money, baseFee: money, free: z.enum(["threshold", "products", "coupon"]).optional(), estimate: localizedText(80).optional() }).strict(),
    totals: z.object({ merchandise: money, savings: money, coupon: money, rewards: money, delivery: money, grandTotal: money }).strict(),
    coupon: z.object({ couponId: zObjectId(), code: z.string().max(30), kind: z.enum(["percent", "fixed", "free_delivery"]), discount: money }).strict().optional(),
    paymentMethod: z.literal("cod"),
    note: z.string().trim().max(500).optional(),
    locale: z.enum(["bn", "en"]),
    checkoutKey: z.string().uuid(),
    /** Who changed the status last and why (reason shown to the customer for rejections/cancellations). */
    statusReason: z.string().trim().max(500).optional(),
    version: zInt().min(1),
    placedAt: zDate(),
    statusChangedAt: zDate(),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type OrderDoc = z.infer<typeof orderSchema>;

export const reservationSchema = z
  .object({
    _id: zObjectId(),
    orderId: zObjectId(),
    lineId: z.string().regex(/^[a-f0-9]{24}$/),
    variantId: zObjectId(),
    qty: zInt().min(1).max(99),
    status: z.enum(["active", "committed", "released"]),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type ReservationDoc = z.infer<typeof reservationSchema>;

export const orderEventSchema = z
  .object({
    _id: zObjectId(),
    orderId: zObjectId(),
    /** The order's new version: unique with orderId, so two writers cannot both record a step. */
    seq: zInt().min(1),
    from: z.union([z.enum(ORDER_STATUSES), z.literal("placed")]),
    to: z.enum(ORDER_STATUSES),
    actor: z.object({ type: z.enum(["customer", "staff", "system", "courier"]), id: z.string().min(1).max(100) }).strict(),
    reason: z.string().trim().max(500).optional(),
    createdAt: zDate(),
  })
  .strict();
export type OrderEventDoc = z.infer<typeof orderEventSchema>;

export const IDEMPOTENCY_SCOPES = ["checkout", "order_transition", "customer_cancel", "return_transition", "inventory", "rewards_adjust"] as const;

export const idempotencyKeySchema = z
  .object({
    _id: zObjectId(),
    scope: z.enum(IDEMPOTENCY_SCOPES),
    principalId: z.string().min(1).max(100),
    key: z.string().uuid(),
    /** Hash of the normalised request: the same key with a different request is refused. */
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    resultRef: z.string().max(100).optional(),
    result: z.object({ orderNumber: z.string().max(40) }).strict().optional(),
    expiresAt: zDate(),
    createdAt: zDate(),
  })
  .strict();
export type IdempotencyKeyDoc = z.infer<typeof idempotencyKeySchema>;
