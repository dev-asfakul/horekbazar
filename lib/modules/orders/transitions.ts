// Order state machine (domain-rules §3, §4.1). The only code that changes an order's status. Each
// transition is one transaction: compare-and-set on the order's `version`, an `orderEvents` row with
// `seq` = the new version (unique with orderId), the stock effect for every line (release on
// reject/cancel, commit on the first shipment), coupon and flash-sale restoration on cancellation,
// the customer email through the outbox, and an audit row for staff.
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { INVENTORY_LEDGER, STOCK, type InventoryLedgerDoc, type StockDoc } from "../catalogue/schema.ts";
import { inTransaction } from "../catalogue/common.ts";
import type { Capability } from "../identity/capabilities.ts";
import { enqueueOutbox } from "../platform/outbox.ts";
import { recordAudit } from "../platform/audit.ts";
import { CommerceError } from "../pricing/cart.ts";
import { COUPON_CUSTOMER_USAGE, COUPON_REDEMPTIONS, COUPONS, PROMOTIONS } from "../pricing/schema.ts";
import { EMAIL_JOB } from "../../adapters/jobs/handlers.ts";
import { loadSettingsFor } from "../pricing/quote.ts";
import { orderEmailExtras } from "./notify.ts";
import { ORDER_EVENTS, ORDERS, RESERVATIONS, type OrderDoc, type OrderStatus, type ReservationDoc } from "./schema.ts";

export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_confirmation: ["confirmed", "rejected", "cancelled_by_customer", "cancelled_by_store"],
  confirmed: ["processing", "cancelled_by_customer", "cancelled_by_store"],
  processing: ["ready_to_ship", "cancelled_by_store"],
  ready_to_ship: ["shipped", "cancelled_by_store"],
  shipped: ["delivered", "delivery_failed"],
  delivered: ["completed"],
  delivery_failed: ["shipped", "returned_to_origin"],
  returned_to_origin: [],
  completed: [],
  rejected: [],
  cancelled_by_customer: [],
  cancelled_by_store: [],
};

/** Capability a staff member needs to move an order into each state. */
export const TRANSITION_CAPABILITY: Partial<Record<OrderStatus, Capability>> = {
  confirmed: "orders.confirm",
  rejected: "orders.confirm",
  processing: "orders.confirm",
  ready_to_ship: "fulfilment.write",
  cancelled_by_store: "orders.confirm",
  shipped: "fulfilment.write",
  delivered: "fulfilment.write",
  delivery_failed: "fulfilment.write",
  returned_to_origin: "fulfilment.write",
  completed: "orders.confirm",
};

/** The customer may cancel only before packing starts [A]. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ["pending_confirmation", "confirmed"];
const RELEASING: readonly OrderStatus[] = ["rejected", "cancelled_by_customer", "cancelled_by_store"];
/** States the customer is emailed about. */
const NOTIFY: readonly OrderStatus[] = ["confirmed", "rejected", "cancelled_by_store", "cancelled_by_customer", "shipped", "delivered", "delivery_failed"];
/** Reasons are required where the customer is owed an explanation. */
const NEEDS_REASON: readonly OrderStatus[] = ["rejected", "cancelled_by_store", "delivery_failed"];

export type TransitionActor = { type: "customer"; id: string } | { type: "staff"; id: string; role: string; ip?: string | null } | { type: "system" | "courier"; id: string };

export interface TransitionInput {
  orderId: ObjectId;
  expectedVersion: number;
  to: OrderStatus;
  actor: TransitionActor;
  reason?: string | undefined;
  now?: Date;
}

async function stockMove(db: Db, session: ClientSession, r: ReservationDoc, kind: "release" | "commit", orderId: ObjectId, actor: TransitionActor, now: Date) {
  const inc = kind === "release" ? { reserved: -r.qty, available: r.qty, version: 1 } : { onHand: -r.qty, reserved: -r.qty, version: 1 };
  const after = await db.collection<StockDoc>(STOCK).findOneAndUpdate({ variantId: r.variantId, reserved: { $gte: r.qty }, ...(kind === "commit" ? { onHand: { $gte: r.qty } } : {}) }, { $inc: inc, $set: { updatedAt: now } }, { session, returnDocument: "after" });
  if (!after) throw new CommerceError("stock_inconsistent", { variantId: String(r.variantId) });
  const ledger: Omit<InventoryLedgerDoc, "_id"> = {
    variantId: r.variantId,
    kind,
    qty: kind === "release" ? r.qty : -r.qty,
    onHandAfter: after.onHand,
    reservedAfter: after.reserved,
    actor: { type: actor.type === "customer" ? "customer" : actor.type === "staff" ? "staff" : "system", id: actor.id },
    refType: "order",
    refId: String(orderId),
    lineRef: r.lineId,
    idempotencyKey: `order:${String(orderId)}:${r.lineId}:${kind}`,
    createdAt: now,
  };
  await db.collection(INVENTORY_LEDGER).insertOne(ledger, { session });
}

export async function transitionOrder(db: Db, client: MongoClient, input: TransitionInput): Promise<OrderDoc> {
  const now = input.now ?? new Date();
  const reason = input.reason?.trim() || undefined;
  if (NEEDS_REASON.includes(input.to) && !reason) throw new CommerceError("reason_required");
  return inTransaction(client, async (session) => {
    const orders = db.collection<OrderDoc>(ORDERS);
    const order = await orders.findOne({ _id: input.orderId }, { session });
    if (!order) throw new CommerceError("not_found");
    if (order.status === input.to && order.version === input.expectedVersion + 1) return order; // replay of the same step
    if (order.version !== input.expectedVersion) throw new CommerceError("version_conflict");
    if (!TRANSITIONS[order.status].includes(input.to)) throw new CommerceError("transition_not_allowed", { from: order.status, to: input.to });
    if (input.actor.type === "customer") {
      if (input.actor.id !== order.userId || input.to !== "cancelled_by_customer" || !CUSTOMER_CANCELLABLE.includes(order.status)) throw new CommerceError("transition_not_allowed");
    }
    const version = order.version + 1;
    const lineStatus = RELEASING.includes(input.to) ? "cancelled" : input.to === "shipped" ? "shipped" : input.to === "delivered" ? "delivered" : null;
    const lines = lineStatus ? order.lines.map((l) => (l.status === "cancelled" || l.status === "returned" ? l : { ...l, status: lineStatus as typeof l.status })) : order.lines;
    const res = await orders.updateOne(
      { _id: order._id, version: order.version, status: order.status },
      { $set: { status: input.to, version, lines, statusChangedAt: now, updatedAt: now, ...(reason ? { statusReason: reason } : {}) }, ...(reason ? {} : { $unset: { statusReason: "" } }) },
      { session },
    );
    if (res.matchedCount === 0) throw new CommerceError("version_conflict");
    await db.collection(ORDER_EVENTS).insertOne({ _id: new ObjectId(), orderId: order._id, seq: version, from: order.status, to: input.to, actor: { type: input.actor.type, id: input.actor.id }, ...(reason ? { reason } : {}), createdAt: now }, { session });

    const reservations = db.collection<ReservationDoc>(RESERVATIONS);
    if (RELEASING.includes(input.to) || (input.to === "shipped" && order.status === "ready_to_ship")) {
      const kind = RELEASING.includes(input.to) ? "release" : "commit";
      for (const r of await reservations.find({ orderId: order._id, status: "active" }, { session }).toArray()) {
        const moved = await reservations.updateOne({ _id: r._id, status: "active" }, { $set: { status: kind === "release" ? "released" : "committed", updatedAt: now } }, { session });
        if (moved.modifiedCount === 1) await stockMove(db, session, r, kind, order._id, input.actor, now);
      }
    }
    if (RELEASING.includes(input.to)) {
      // Restore the coupon use and flash-sale units this order took (proposed [A] "restore on cancel").
      const redemption = await db.collection(COUPON_REDEMPTIONS).findOneAndUpdate({ orderId: order._id, status: "held" }, { $set: { status: "released", updatedAt: now } }, { session });
      if (redemption) {
        await db.collection(COUPONS).updateOne({ _id: redemption.couponId, used: { $gt: 0 } }, { $inc: { used: -1 } }, { session });
        await db.collection(COUPON_CUSTOMER_USAGE).updateOne({ couponId: redemption.couponId, userId: order.userId, count: { $gt: 0 } }, { $inc: { count: -1 }, $set: { updatedAt: now } }, { session });
      }
      for (const l of order.lines) {
        if (l.appliedPromotion?.kind === "flash_sale") await db.collection(PROMOTIONS).updateOne({ _id: l.appliedPromotion.id, sold: { $gte: l.quantity } }, { $inc: { sold: -l.quantity } }, { session });
      }
    }
    if (input.to === "completed") await db.collection(COUPON_REDEMPTIONS).updateOne({ orderId: order._id, status: "held" }, { $set: { status: "consumed", updatedAt: now } }, { session });

    if (NOTIFY.includes(input.to) && order.customer.email) {
      const settings = await loadSettingsFor(db, session);
      await enqueueOutbox(db, { type: EMAIL_JOB, aggregateId: `order-${String(order._id)}`, seq: version, payload: { template: "order-status", to: order.customer.email, locale: order.locale, name: order.customer.name, orderNumber: order.orderNumber, status: input.to, ...(reason ? { reason } : {}), ...orderEmailExtras(settings, order.locale, order.orderNumber) } }, { session, now });
    }
    if (input.actor.type === "staff") {
      await recordAudit(db, { actor: { id: input.actor.id, role: input.actor.role }, action: "order.transition", target: { type: "order", id: order.orderNumber }, before: { status: order.status }, after: { status: input.to, ...(reason ? { reason } : {}) }, ip: input.actor.ip ?? null }, { session, now });
    }
    return { ...order, status: input.to, version, lines, statusChangedAt: now, updatedAt: now, ...(reason ? { statusReason: reason } : {}) };
  });
}
