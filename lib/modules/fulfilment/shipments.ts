// Shipment service (B8; domain-rules §3, §4.1, §6, §7). The only code that changes a shipment.
// Every change is one transaction: compare-and-set on the shipment's `version`, the order step it
// implies (through the order state machine, which commits stock on the first hand-over), a
// checkpoint, and an audit row for staff. A courier booking is an outbox job written in the same
// transaction. Nothing here invents a booking, a consignment id or a tracking checkpoint.
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { INVENTORY_LEDGER, STOCK, type InventoryLedgerDoc, type StockDoc } from "../catalogue/schema.ts";
import { inTransaction, isDuplicateKey } from "../catalogue/common.ts";
import { enqueueOutbox, runOutboxJobNow } from "../platform/outbox.ts";
import { recordAudit } from "../platform/audit.ts";
import { CommerceError } from "../pricing/cart.ts";
import { ORDERS, RESERVATIONS, type OrderDoc, type OrderStatus, type ReservationDoc } from "../orders/schema.ts";
import { applyOrderTransition, type TransitionActor } from "../orders/transitions.ts";
import { courierState } from "../../adapters/courier/index.ts";
import { courierStatusAdvances, COURIER_STATUS_RANK, normaliseCourierStatus } from "./courier-status.ts";
import { COURIER_BOOK_JOB, OPEN_SHIPMENT, SHIPMENTS, type CourierKey, type ShipmentDoc, type ShipmentStatus } from "./schema.ts";

/** Allowed steps of the store's own fulfilment state. `booked` is reached by recording a consignment. */
export const SHIPMENT_TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  draft: ["booked", "cancelled"],
  booked: ["handed_over", "cancelled"],
  handed_over: ["delivered", "delivery_failed"],
  // A failed attempt is either sent out again (same consignment) or comes back to the store.
  delivery_failed: ["handed_over", "returned"],
  delivered: [],
  returned: [],
  cancelled: [],
};

/** The order step each shipment step implies (the order machine still validates it). */
const ORDER_STEP: Partial<Record<ShipmentStatus, OrderStatus>> = { handed_over: "shipped", delivered: "delivered", delivery_failed: "delivery_failed", returned: "returned_to_origin" };
const NEEDS_REASON: readonly ShipmentStatus[] = ["delivery_failed", "cancelled"];

/** Steps staff take with a button (booked comes from tracking details or the courier). */
export const STAFF_STEPS: readonly ShipmentStatus[] = ["handed_over", "delivered", "delivery_failed", "returned", "cancelled"];

/** Orders a shipment can be created for: packing has started and nothing has shipped yet. */
export const SHIPPABLE_ORDER: readonly OrderStatus[] = ["processing", "ready_to_ship"];

export type StaffActor = Extract<TransitionActor, { type: "staff" }>;
type ShipmentActor = StaffActor | { type: "system" | "courier"; id: string };

const actorRef = (a: ShipmentActor) => ({ type: a.type, id: a.id });
const auditActor = (a: ShipmentActor) => (a.type === "staff" ? { id: a.id, role: a.role } : null);

/** Consignment ids and tracking codes: letters, digits and . _ - / (what couriers print). */
export const TRACKING_REF = /^[A-Za-z0-9._\-/]{1,80}$/;

export interface TrackingInput {
  carrierName?: string | undefined;
  consignmentId?: string | undefined;
  trackingCode?: string | undefined;
  trackingUrl?: string | undefined;
}

/** Validates staff-entered tracking details; returns the field names that are wrong. */
export function trackingProblems(input: TrackingInput): string[] {
  const problems: string[] = [];
  if (input.carrierName !== undefined && (input.carrierName.trim().length === 0 || input.carrierName.length > 80)) problems.push("carrierName");
  if (input.consignmentId !== undefined && !TRACKING_REF.test(input.consignmentId)) problems.push("consignmentId");
  if (input.trackingCode !== undefined && !TRACKING_REF.test(input.trackingCode)) problems.push("trackingCode");
  if (input.trackingUrl !== undefined) {
    let ok = false;
    try {
      const url = new URL(input.trackingUrl);
      ok = url.protocol === "https:" && url.hostname.includes(".") && !url.username && !url.password && input.trackingUrl.length <= 500 && !/\s/.test(input.trackingUrl);
    } catch {
      ok = false;
    }
    if (!ok) problems.push("trackingUrl");
  }
  return problems;
}

async function audit(db: Db, session: ClientSession, actor: ShipmentActor, action: string, shipment: ShipmentDoc, before: Record<string, unknown>, after: Record<string, unknown>, now: Date) {
  const a = auditActor(actor);
  if (!a) return;
  await recordAudit(db, { actor: a, action, target: { type: "shipment", id: `${shipment.orderNumber}/${shipment.invoice}` }, before, after, ip: actor.type === "staff" ? (actor.ip ?? null) : null }, { session, now });
}

export interface CreateShipmentInput extends TrackingInput {
  orderId: ObjectId;
  courier: CourierKey;
  note?: string | undefined;
  actor: StaffActor;
  now?: Date;
  env?: Record<string, string | undefined>;
}

/**
 * Creates the order's shipment. Manual: carrier name required; with a consignment id it is `booked`,
 * otherwise `draft`. A courier with an API: `draft` plus a booking job; the job records the
 * consignment only when the courier accepts. Never commits stock (that happens at hand-over).
 */
export async function createShipment(db: Db, input: CreateShipmentInput): Promise<ShipmentDoc> {
  const now = input.now ?? new Date();
  const courier = courierState(input.courier, input.env);
  if (input.courier !== "manual" && (courier.state !== "available" || !courier.booking)) throw new CommerceError("courier_unavailable", { courier: input.courier });
  if (input.courier === "manual" && !input.carrierName?.trim()) throw new CommerceError("carrier_required");
  const tracking: TrackingInput = input.courier === "manual" ? input : { trackingUrl: input.trackingUrl };
  if (trackingProblems(tracking).length > 0) throw new CommerceError("tracking_invalid", { fields: trackingProblems(tracking) });

  const created = await inTransaction(db.client, async (session) => {
    const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: input.orderId }, { session });
    if (!order) throw new CommerceError("not_found");
    if (!SHIPPABLE_ORDER.includes(order.status)) throw new CommerceError("order_not_shippable", { status: order.status });
    const shipments = db.collection<ShipmentDoc>(SHIPMENTS);
    if (await shipments.findOne({ orderId: order._id, open: true }, { session, projection: { _id: 1 } })) throw new CommerceError("shipment_exists");
    const n = (await shipments.countDocuments({ orderId: order._id }, { session })) + 1;
    const status: ShipmentStatus = input.courier === "manual" && input.consignmentId ? "booked" : "draft";
    const doc: ShipmentDoc = {
      _id: new ObjectId(),
      orderId: order._id,
      orderNumber: order.orderNumber,
      courier: input.courier,
      ...(input.courier === "manual" ? { carrierName: input.carrierName!.trim() } : {}),
      ...(input.courier === "manual" && input.consignmentId ? { consignmentId: input.consignmentId } : {}),
      ...(input.courier === "manual" && input.trackingCode ? { trackingCode: input.trackingCode } : {}),
      ...(tracking.trackingUrl ? { trackingUrl: tracking.trackingUrl } : {}),
      invoice: `${order.orderNumber}-${n}`,
      codAmount: order.totals.grandTotal,
      status,
      open: true,
      ...(input.courier !== "manual" ? { booking: { state: "requested" as const, requestedAt: now } } : {}),
      checkpoints: [{ code: status, source: "staff", at: now }],
      createdBy: actorRef(input.actor),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await shipments.insertOne(doc, { session });
    } catch (error) {
      if (isDuplicateKey(error)) throw new CommerceError(doc.consignmentId ? "consignment_taken" : "shipment_exists");
      throw error;
    }
    let jobKey: string | null = null;
    if (input.courier !== "manual") {
      jobKey = (await enqueueOutbox(db, { type: COURIER_BOOK_JOB, aggregateId: `shipment-${String(doc._id)}`, seq: 1, payload: { shipmentId: String(doc._id), ...(input.note ? { note: input.note.slice(0, 200) } : {}) } }, { session, now })).idempotencyKey;
    }
    await audit(db, session, input.actor, "shipment.create", doc, {}, { courier: doc.courier, status, ...(doc.consignmentId ? { consignmentId: doc.consignmentId } : {}) }, now);
    return { doc, jobKey };
  });
  if (created.jobKey) await runBookingNow(db, created.jobKey, String(created.doc._id));
  return (await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: created.doc._id })) ?? created.doc;
}

/** Tries the booking job straight away; on failure the row stays for the next drain (outbox retry). */
async function runBookingNow(db: Db, key: string, shipmentId: string) {
  const { outboxHandlers } = await import("../../adapters/jobs/handlers.ts");
  await runOutboxJobNow(db, key, outboxHandlers, { workerId: `inline-shipment-${shipmentId}` });
}

/** Re-requests a booking after the courier refused it (staff fixed the cause, or chose to retry). */
export async function retryBooking(db: Db, input: { shipmentId: ObjectId; expectedVersion: number; actor: StaffActor; now?: Date; env?: Record<string, string | undefined> }) {
  const now = input.now ?? new Date();
  const result = await inTransaction(db.client, async (session) => {
    const shipments = db.collection<ShipmentDoc>(SHIPMENTS);
    const s = await shipments.findOne({ _id: input.shipmentId }, { session });
    if (!s) throw new CommerceError("not_found");
    if (s.version !== input.expectedVersion) throw new CommerceError("version_conflict");
    if (s.courier === "manual" || s.status !== "draft" || s.booking?.state !== "failed") throw new CommerceError("transition_not_allowed");
    const courier = courierState(s.courier, input.env);
    if (courier.state !== "available" || !courier.booking) throw new CommerceError("courier_unavailable", { courier: s.courier });
    const version = s.version + 1;
    // A new invoice: the courier may have stored the refused one.
    const invoice = `${s.orderNumber}-${(await shipments.countDocuments({ orderId: s.orderId }, { session })) + 1}r${version}`.slice(0, 60);
    const res = await shipments.updateOne({ _id: s._id, version: s.version }, { $set: { booking: { state: "requested", requestedAt: now }, invoice, version, updatedAt: now } }, { session });
    if (res.matchedCount === 0) throw new CommerceError("version_conflict");
    const key = (await enqueueOutbox(db, { type: COURIER_BOOK_JOB, aggregateId: `shipment-${String(s._id)}`, seq: version, payload: { shipmentId: String(s._id) } }, { session, now })).idempotencyKey;
    await audit(db, session, input.actor, "shipment.booking_retry", s, { booking: s.booking?.state }, { booking: "requested" }, now);
    return key;
  });
  await runBookingNow(db, result, String(input.shipmentId));
}

/**
 * Staff edit the tracking details. Manual shipments: everything. Courier shipments: the tracking
 * link at any time, and the consignment id only after the courier refused the booking (staff booked
 * it in the courier's own portal). Recording a consignment on a draft makes it `booked`.
 */
export async function updateTracking(db: Db, input: TrackingInput & { shipmentId: ObjectId; expectedVersion: number; actor: StaffActor; now?: Date }): Promise<ShipmentDoc> {
  const now = input.now ?? new Date();
  const problems = trackingProblems(input);
  if (problems.length > 0) throw new CommerceError("tracking_invalid", { fields: problems });
  return inTransaction(db.client, async (session) => {
    const shipments = db.collection<ShipmentDoc>(SHIPMENTS);
    const s = await shipments.findOne({ _id: input.shipmentId }, { session });
    if (!s) throw new CommerceError("not_found");
    if (s.version !== input.expectedVersion) throw new CommerceError("version_conflict");
    if (!s.open) throw new CommerceError("shipment_closed");
    const manual = s.courier === "manual";
    const mayEditConsignment = manual || (s.status === "draft" && s.booking?.state === "failed");
    if (!mayEditConsignment && (input.consignmentId !== undefined || input.trackingCode !== undefined)) throw new CommerceError("tracking_locked");
    if (!manual && input.carrierName !== undefined) throw new CommerceError("tracking_locked");
    if (s.status !== "draft" && s.status !== "booked" && input.consignmentId !== undefined && input.consignmentId !== s.consignmentId) throw new CommerceError("tracking_locked");
    const set: Partial<ShipmentDoc> = { updatedAt: now, version: s.version + 1 };
    const unset: Record<string, ""> = {};
    if (input.carrierName !== undefined) set.carrierName = input.carrierName.trim();
    if (input.consignmentId !== undefined) set.consignmentId = input.consignmentId;
    for (const key of ["trackingCode", "trackingUrl"] as const) {
      if (key === "trackingCode" && !mayEditConsignment) continue;
      if (input[key] !== undefined) set[key] = input[key];
      else if (key in input && s[key] !== undefined) unset[key] = "";
    }
    const becomesBooked = s.status === "draft" && (set.consignmentId ?? s.consignmentId) !== undefined;
    if (becomesBooked) {
      set.status = "booked";
      if (s.booking?.state === "failed") set.booking = { ...s.booking, settledAt: now, error: "Consignment entered by staff after the courier refused the booking" };
    }
    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(unset).length > 0) update.$unset = unset;
    if (becomesBooked) update.$push = { checkpoints: { code: "booked", source: "staff", at: now } };
    try {
      const res = await shipments.updateOne({ _id: s._id, version: s.version }, update, { session });
      if (res.matchedCount === 0) throw new CommerceError("version_conflict");
    } catch (error) {
      if (isDuplicateKey(error)) throw new CommerceError("consignment_taken");
      throw error;
    }
    const pick = (d: Partial<ShipmentDoc>) => ({ carrierName: d.carrierName, consignmentId: d.consignmentId, trackingCode: d.trackingCode, trackingUrl: d.trackingUrl, status: d.status });
    await audit(db, session, input.actor, "shipment.tracking", s, pick(s), pick({ ...s, ...set, ...Object.fromEntries(Object.keys(unset).map((k) => [k, undefined])) }), now);
    return (await shipments.findOne({ _id: s._id }, { session }))!;
  });
}

export interface ShipmentStepInput {
  shipmentId: ObjectId;
  expectedVersion: number;
  to: ShipmentStatus;
  reason?: string | undefined;
  actor: ShipmentActor;
  now?: Date;
}

/** One fulfilment step, with the order step it implies, inside the caller's transaction. */
async function applyShipmentStep(db: Db, session: ClientSession, input: ShipmentStepInput, s: ShipmentDoc): Promise<ShipmentDoc> {
  const now = input.now ?? new Date();
  const reason = input.reason?.trim() || undefined;
  if (!SHIPMENT_TRANSITIONS[s.status].includes(input.to)) throw new CommerceError("transition_not_allowed", { from: s.status, to: input.to });
  if (NEEDS_REASON.includes(input.to) && !reason) throw new CommerceError("reason_required");
  if (input.to === "handed_over" && !s.consignmentId) throw new CommerceError("consignment_required");
  if (input.to === "booked") throw new CommerceError("transition_not_allowed");
  const orderStep = ORDER_STEP[input.to];
  if (orderStep) {
    const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: s.orderId }, { session, projection: { version: 1, status: 1 } });
    if (!order) throw new CommerceError("not_found");
    const orderActor: TransitionActor = input.actor.type === "staff" ? input.actor : { type: input.actor.type, id: input.actor.id };
    await applyOrderTransition(db, session, { orderId: s.orderId, expectedVersion: order.version, to: orderStep, actor: orderActor, reason, now, viaShipment: true });
  }
  const open = OPEN_SHIPMENT.includes(input.to);
  const version = s.version + 1;
  const set: Partial<ShipmentDoc> = { status: input.to, open, version, updatedAt: now, ...(reason ? { statusReason: reason } : {}), ...(input.to === "handed_over" && !s.handedOverAt ? { handedOverAt: now } : {}), ...(!open ? { closedAt: now } : {}) };
  const res = await db.collection<ShipmentDoc>(SHIPMENTS).updateOne(
    { _id: s._id, version: s.version, status: s.status },
    { $set: set, ...(reason ? {} : { $unset: { statusReason: "" } }), $push: { checkpoints: { code: input.to, source: input.actor.type === "courier" ? "courier" : input.actor.type === "system" ? "system" : "staff", ...(reason ? { note: reason } : {}), at: now } } },
    { session },
  );
  if (res.matchedCount === 0) throw new CommerceError("version_conflict");
  await audit(db, session, input.actor, "shipment.transition", s, { status: s.status }, { status: input.to, ...(reason ? { reason } : {}) }, now);
  return { ...s, ...set, checkpoints: [...s.checkpoints, { code: input.to, source: "staff", at: now }] };
}

/** Staff fulfilment step: hand over (ships the order, commits stock once), delivered, failed, returned, cancel. */
export async function transitionShipment(db: Db, input: ShipmentStepInput): Promise<ShipmentDoc> {
  return inTransaction(db.client, async (session) => {
    const s = await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: input.shipmentId }, { session });
    if (!s) throw new CommerceError("not_found");
    if (s.status === input.to && s.version === input.expectedVersion + 1) return s; // replay of the same step
    if (s.version !== input.expectedVersion) throw new CommerceError("version_conflict");
    return applyShipmentStep(db, session, input, s);
  });
}

export type CourierApplyOutcome = "applied" | "stale";

/**
 * Applies a courier status read from the courier's API (never a webhook body on its own). Moves
 * `courierStatus` forward only. A final "delivered" on a handed-over shipment also delivers the order;
 * every other report is shown to staff, who decide (a courier "cancelled" is not proof the parcel
 * is back at the store, so it never triggers a return or a restock).
 */
export async function applyCourierStatus(db: Db, input: { shipmentId: ObjectId; raw: string; provider: CourierKey; now?: Date }): Promise<CourierApplyOutcome> {
  const now = input.now ?? new Date();
  const code = normaliseCourierStatus(input.raw);
  return inTransaction(db.client, async (session) => {
    const shipments = db.collection<ShipmentDoc>(SHIPMENTS);
    const s = await shipments.findOne({ _id: input.shipmentId }, { session });
    if (!s || s.courier !== input.provider) throw new CommerceError("not_found");
    const syncOk = { lastSync: { at: now, ok: true } };
    if (!courierStatusAdvances(s.courierStatus, code)) {
      await shipments.updateOne({ _id: s._id }, { $set: syncOk }, { session });
      return "stale";
    }
    const version = s.version + 1;
    const res = await shipments.updateOne(
      { _id: s._id, version: s.version },
      { $set: { courierStatus: { code, raw: input.raw.slice(0, 60), rank: COURIER_STATUS_RANK[code], at: now }, version, updatedAt: now, ...syncOk }, $push: { checkpoints: { code: `courier:${code}`, source: "courier", at: now } } },
      { session },
    );
    if (res.matchedCount === 0) throw new CommerceError("version_conflict");
    if (code === "delivered" && s.status === "handed_over") {
      const fresh = (await shipments.findOne({ _id: s._id }, { session }))!;
      await applyShipmentStep(db, session, { shipmentId: s._id, expectedVersion: fresh.version, to: "delivered", actor: { type: "courier", id: input.provider }, now }, fresh);
    }
    return "applied";
  });
}

/** Records a failed status read so staff see it (the outbox row carries the retry). */
export async function recordSyncFailure(db: Db, shipmentId: ObjectId, error: string, now: Date = new Date()) {
  await db.collection<ShipmentDoc>(SHIPMENTS).updateOne({ _id: shipmentId }, { $set: { lastSync: { at: now, ok: false, error: error.slice(0, 300) } } });
}

export interface RtoInspectInput {
  shipmentId: ObjectId;
  lineId: string;
  outcome: "restock" | "write_off";
  note?: string | undefined;
  actor: StaffActor;
  now?: Date;
}

/**
 * Records the inspection of one line of a parcel that came back (order returned_to_origin) and moves
 * stock: restock puts the committed quantity back on hand; write-off is a ledger entry only (onHand
 * was already reduced at commit). One outcome per line, once (ledger key rto:<order>:<line>:<kind>).
 */
export async function inspectReturnedLine(db: Db, input: RtoInspectInput): Promise<ShipmentDoc> {
  const now = input.now ?? new Date();
  return inTransaction(db.client, async (session) => {
    const shipments = db.collection<ShipmentDoc>(SHIPMENTS);
    const s = await shipments.findOne({ _id: input.shipmentId }, { session });
    if (!s) throw new CommerceError("not_found");
    if (s.status !== "returned") throw new CommerceError("transition_not_allowed");
    const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: s.orderId }, { session, projection: { status: 1, lines: 1 } });
    if (!order || order.status !== "returned_to_origin") throw new CommerceError("transition_not_allowed");
    if (!order.lines.some((l) => l.lineId === input.lineId)) throw new CommerceError("not_found");
    if ((s.rtoInspection ?? []).some((r) => r.lineId === input.lineId)) throw new CommerceError("already_inspected");
    const reservation = await db.collection<ReservationDoc>(RESERVATIONS).findOne({ orderId: s.orderId, lineId: input.lineId }, { session });
    if (!reservation || reservation.status !== "committed") throw new CommerceError("line_not_shipped");
    const qty = reservation.qty;
    const note = input.note?.trim() || undefined;
    const res = await shipments.updateOne(
      { _id: s._id, version: s.version, "rtoInspection.lineId": { $ne: input.lineId } },
      { $push: { rtoInspection: { lineId: input.lineId, outcome: input.outcome, qty, ...(note ? { note } : {}), by: actorRef(input.actor), at: now } }, $set: { version: s.version + 1, updatedAt: now } },
      { session },
    );
    if (res.matchedCount === 0) throw new CommerceError("version_conflict");
    await moveReturnedStock(db, session, { variantId: reservation.variantId, qty, outcome: input.outcome, refType: "rto", refId: String(s.orderId), lineRef: input.lineId, actor: input.actor, reason: note, now });
    await audit(db, session, input.actor, "shipment.rto_inspect", s, {}, { lineId: input.lineId, outcome: input.outcome, qty }, now);
    return (await shipments.findOne({ _id: s._id }, { session }))!;
  });
}

/** Restock (onHand and available up) or write-off (ledger only) for goods that came back. */
export async function moveReturnedStock(
  db: Db,
  session: ClientSession,
  m: { variantId: ObjectId; qty: number; outcome: "restock" | "write_off"; refType: "rto" | "return"; refId: string; lineRef: string; actor: { type: "staff" | "system"; id: string }; reason?: string | undefined; now: Date },
) {
  const stock = db.collection<StockDoc>(STOCK);
  const after =
    m.outcome === "restock"
      ? await stock.findOneAndUpdate({ variantId: m.variantId }, { $inc: { onHand: m.qty, available: m.qty, version: 1 }, $set: { updatedAt: m.now } }, { session, returnDocument: "after" })
      : await stock.findOne({ variantId: m.variantId }, { session });
  if (!after) throw new CommerceError("stock_inconsistent", { variantId: String(m.variantId) });
  const ledger: Omit<InventoryLedgerDoc, "_id"> = {
    variantId: m.variantId,
    kind: m.outcome,
    qty: m.qty,
    onHandAfter: after.onHand,
    reservedAfter: after.reserved,
    actor: { type: m.actor.type, id: m.actor.id },
    ...(m.reason ? { reason: m.reason.slice(0, 300) } : {}),
    refType: m.refType,
    refId: m.refId,
    lineRef: m.lineRef,
    idempotencyKey: `${m.refType}:${m.refId}:${m.lineRef}:${m.outcome}`,
    createdAt: m.now,
  };
  try {
    await db.collection(INVENTORY_LEDGER).insertOne(ledger, { session });
  } catch (error) {
    if (isDuplicateKey(error)) throw new CommerceError("already_inspected");
    throw error;
  }
}

/** The order's shipments, newest first (admin and the owning customer's order page). */
export async function shipmentsForOrder(db: Db, orderId: ObjectId): Promise<ShipmentDoc[]> {
  return db.collection<ShipmentDoc>(SHIPMENTS).find({ orderId }).sort({ createdAt: -1 }).limit(20).toArray();
}
