// Customer returns (B8; domain-rules §3 "Returns", §4.1; SCHEMA.md → returns). The customer asks
// within the return window after delivery; staff approve or reject, record receipt, inspect each
// line (restock or write off), apply the stock result, and record the refund made outside the app.
// Stock moves only in the settle step and only from `inspected`: a request, an approval or a
// courier event never restocks anything. Every step is compare-and-set on `version` in a transaction
// with a history row and (for staff) an audit row.
import { ObjectId, type Db } from "mongodb";
import { inTransaction } from "../catalogue/common.ts";
import { recordAudit } from "../platform/audit.ts";
import { reverseForReturn } from "../rewards/rewards.ts";
import { CommerceError } from "../pricing/cart.ts";
import { ORDER_EVENTS, ORDERS, type OrderDoc, type OrderEventDoc } from "../orders/schema.ts";
import { SETTINGS, SETTINGS_ID, type SettingsDoc } from "../settings/schema.ts";
import { RETURNS, type ReturnDoc, type ReturnStatus } from "./schema.ts";
import { moveReturnedStock, type StaffActor } from "./shipments.ts";

export const DEFAULT_RETURN_WINDOW_DAYS = 7;

export const RETURN_TRANSITIONS: Record<ReturnStatus, readonly ReturnStatus[]> = {
  requested: ["approved", "rejected"],
  approved: ["received", "closed"],
  received: ["inspected"],
  inspected: ["restocked", "written_off"],
  restocked: ["refunded", "closed"],
  written_off: ["refunded", "closed"],
  refunded: [],
  credited: [],
  rejected: [],
  closed: [],
};
/** Returns that still count against a line's returnable quantity. */
const COUNTING: readonly ReturnStatus[] = ["requested", "approved", "received", "inspected", "restocked", "written_off", "refunded", "credited", "closed"];
const NEEDS_NOTE: readonly ReturnStatus[] = ["rejected", "closed"];
/** Staff steps taken with a plain button (inspect, settle and refund have their own inputs). */
export const SIMPLE_STEPS: readonly ReturnStatus[] = ["approved", "rejected", "received", "closed"];

const settingsWindow = (s: SettingsDoc | null) => s?.orders?.returnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS;

/** When the order was delivered (its latest `delivered` event), or null. */
export async function deliveredAt(db: Db, orderId: ObjectId): Promise<Date | null> {
  const e = await db.collection<OrderEventDoc>(ORDER_EVENTS).find({ orderId, to: "delivered" }).sort({ seq: -1 }).limit(1).next();
  return e?.createdAt ?? null;
}

export interface ReturnEligibility {
  open: boolean;
  /** Why not, when closed: not_delivered | window_closed | returns_off. */
  reason?: "not_delivered" | "window_closed" | "returns_off";
  closesAt?: Date;
  /** lineId → quantity still returnable. */
  remaining: Record<string, number>;
}

export async function returnEligibility(db: Db, order: Pick<OrderDoc, "_id" | "status" | "lines">, now: Date = new Date()): Promise<ReturnEligibility> {
  const remaining: Record<string, number> = {};
  if (order.status !== "delivered") return { open: false, reason: "not_delivered", remaining };
  const days = settingsWindow(await db.collection<SettingsDoc>(SETTINGS).findOne({ _id: SETTINGS_ID }));
  if (days === 0) return { open: false, reason: "returns_off", remaining };
  const at = await deliveredAt(db, order._id);
  if (!at) return { open: false, reason: "not_delivered", remaining };
  const closesAt = new Date(at.getTime() + days * 24 * 3600_000);
  const taken = new Map<string, number>();
  for (const r of await db.collection<ReturnDoc>(RETURNS).find({ orderId: order._id, status: { $in: [...COUNTING] } }, { projection: { lines: 1 } }).toArray()) {
    for (const l of r.lines) taken.set(l.lineId, (taken.get(l.lineId) ?? 0) + l.qty);
  }
  for (const l of order.lines) if (l.status === "delivered") remaining[l.lineId] = Math.max(0, l.quantity - (taken.get(l.lineId) ?? 0));
  if (now > closesAt) return { open: false, reason: "window_closed", closesAt, remaining };
  return { open: true, closesAt, remaining };
}

export interface RequestReturnInput {
  userId: string;
  orderNumber: string;
  lines: { lineId: string; qty: number }[];
  reason: string;
  now?: Date;
}

export async function requestReturn(db: Db, input: RequestReturnInput): Promise<ReturnDoc> {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (!reason) throw new CommerceError("reason_required");
  const lines = input.lines.filter((l) => l.qty > 0);
  if (lines.length === 0) throw new CommerceError("return_lines_required");
  return inTransaction(db.client, async (session) => {
    const order = await db.collection<OrderDoc>(ORDERS).findOne({ orderNumber: input.orderNumber, userId: input.userId }, { session });
    if (!order) throw new CommerceError("not_found");
    const eligibility = await returnEligibility(db, order, now);
    if (!eligibility.open) throw new CommerceError(eligibility.reason === "window_closed" ? "window_closed" : "not_returnable");
    const seen = new Set<string>();
    const docLines: ReturnDoc["lines"] = [];
    for (const l of lines) {
      const line = order.lines.find((x) => x.lineId === l.lineId);
      if (!line || seen.has(l.lineId) || !Number.isInteger(l.qty)) throw new CommerceError("not_returnable");
      if (l.qty > (eligibility.remaining[l.lineId] ?? 0)) throw new CommerceError("return_qty_exceeded", { lineId: l.lineId });
      seen.add(l.lineId);
      docLines.push({ lineId: l.lineId, variantId: line.variantId, qty: l.qty });
    }
    const doc: ReturnDoc = {
      _id: new ObjectId(),
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: input.userId,
      lines: docLines,
      reason: reason.slice(0, 500),
      status: "requested",
      history: [{ from: "new", to: "requested", by: { type: "customer", id: input.userId }, at: now }],
      version: 1,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection<ReturnDoc>(RETURNS).insertOne(doc, { session });
    return doc;
  });
}

interface StepBase {
  returnId: ObjectId;
  expectedVersion: number;
  actor: StaffActor;
  now?: Date;
}

async function step(db: Db, input: StepBase & { to: ReturnStatus; note?: string | undefined }, extra: (r: ReturnDoc, session: import("mongodb").ClientSession, now: Date) => Promise<Partial<ReturnDoc>> = async () => ({})): Promise<ReturnDoc> {
  const now = input.now ?? new Date();
  const note = input.note?.trim() || undefined;
  return inTransaction(db.client, async (session) => {
    const returns = db.collection<ReturnDoc>(RETURNS);
    const r = await returns.findOne({ _id: input.returnId }, { session });
    if (!r) throw new CommerceError("not_found");
    if (r.status === input.to && r.version === input.expectedVersion + 1) return r; // replay
    if (r.version !== input.expectedVersion) throw new CommerceError("version_conflict");
    if (!RETURN_TRANSITIONS[r.status].includes(input.to)) throw new CommerceError("transition_not_allowed", { from: r.status, to: input.to });
    if (NEEDS_NOTE.includes(input.to) && !note) throw new CommerceError("reason_required");
    const set = { ...(await extra(r, session, now)), status: input.to, version: r.version + 1, updatedAt: now, ...(note ? { statusReason: note } : {}) };
    const res = await returns.updateOne(
      { _id: r._id, version: r.version, status: r.status },
      { $set: set, $push: { history: { from: r.status, to: input.to, by: { type: "staff", id: input.actor.id }, ...(note ? { note } : {}), at: now } } },
      { session },
    );
    if (res.matchedCount === 0) throw new CommerceError("version_conflict");
    await recordAudit(db, { actor: { id: input.actor.id, role: input.actor.role }, action: "return.transition", target: { type: "return", id: `${r.orderNumber}/${String(r._id)}` }, before: { status: r.status }, after: { status: input.to, ...(note ? { note } : {}) }, ip: input.actor.ip ?? null }, { session, now });
    return { ...r, ...set };
  });
}

/** approve, reject (note), received, closed (note). */
export function transitionReturn(db: Db, input: StepBase & { to: ReturnStatus; note?: string | undefined }) {
  if (!SIMPLE_STEPS.includes(input.to)) return Promise.reject(new CommerceError("transition_not_allowed"));
  return step(db, input);
}

/** received → inspected, with a decision for every line. No stock moves yet. */
export function inspectReturn(db: Db, input: StepBase & { outcomes: Record<string, { outcome: "restock" | "write_off"; note?: string | undefined }>; note?: string | undefined }) {
  return step(db, { ...input, to: "inspected", note: undefined }, async (r, _s, now) => {
    const lines = r.lines.map((l) => {
      const o = input.outcomes[l.lineId];
      if (!o) throw new CommerceError("inspection_incomplete", { lineId: l.lineId });
      const note = o.note?.trim() || undefined;
      return { lineId: l.lineId, variantId: l.variantId, qty: l.qty, outcome: o.outcome, ...(note ? { note: note.slice(0, 300) } : {}) };
    });
    const note = input.note?.trim() || undefined;
    return { lines, inspection: { ...(note ? { note: note.slice(0, 500) } : {}), by: { type: "staff", id: input.actor.id }, at: now } };
  });
}

/**
 * inspected → restocked | written_off: applies each line's recorded outcome to stock (ledger keys
 * return:<returnId>:<lineId>:<kind>). The return's status is `restocked` when any line went back on
 * the shelf, otherwise `written_off`; the per-line outcomes are the record.
 */
export async function settleReturn(db: Db, input: StepBase): Promise<ReturnDoc> {
  const current = await db.collection<ReturnDoc>(RETURNS).findOne({ _id: input.returnId }, { projection: { lines: 1, status: 1 } });
  if (!current) throw new CommerceError("not_found");
  if (current.status !== "inspected") throw new CommerceError("transition_not_allowed", { from: current.status, to: "restocked" });
  const to: ReturnStatus = current.lines.some((l) => l.outcome === "restock") ? "restocked" : "written_off";
  return step(db, { ...input, to }, async (r, session, now) => {
    for (const l of r.lines) {
      if (!l.outcome) throw new CommerceError("inspection_incomplete", { lineId: l.lineId });
      await moveReturnedStock(db, session, { variantId: l.variantId, qty: l.qty, outcome: l.outcome, refType: "return", refId: String(r._id), lineRef: l.lineId, actor: { type: "staff", id: input.actor.id }, reason: l.note, now });
    }
    // B9: take back the loyalty points the returned goods earned (only when the order had accrued).
    const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: r.orderId }, { session, projection: { lines: 1 } });
    if (order) await reverseForReturn(db, session, r, order, now);
    return {};
  });
}

/** Most the store can record as refunded for a return: each line's paid share for the returned quantity. */
export function refundCap(order: Pick<OrderDoc, "lines">, r: Pick<ReturnDoc, "lines">): number {
  let cap = 0;
  for (const rl of r.lines) {
    const l = order.lines.find((x) => x.lineId === rl.lineId);
    if (l) cap += Math.floor(((l.lineTotal - l.couponShare) * rl.qty) / l.quantity);
  }
  return cap;
}

/**
 * Records a refund paid outside the app (bKash, Nagad or bank). Store-reward refunds need the B9
 * rewards ledger and are refused until then.
 */
export async function recordRefund(db: Db, input: StepBase & { method: "bkash" | "nagad" | "bank" | "store_reward"; amount: number; reference?: string | undefined }): Promise<ReturnDoc> {
  if (input.method === "store_reward") throw new CommerceError("store_reward_unavailable");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new CommerceError("refund_invalid");
  return step(db, { ...input, to: "refunded" }, async (r, session, now) => {
    const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: r.orderId }, { session, projection: { lines: 1 } });
    if (!order) throw new CommerceError("not_found");
    if (input.amount > refundCap(order, r)) throw new CommerceError("refund_exceeds", { cap: refundCap(order, r) });
    const reference = input.reference?.trim() || undefined;
    return { refund: { method: input.method, amount: input.amount, ...(reference ? { reference: reference.slice(0, 100) } : {}), by: { type: "staff", id: input.actor.id }, at: now } };
  });
}
