// Courier webhooks (B8; domain-rules §7, §13). A webhook is treated as a signal, never as proof:
// - the route authenticates it (Bearer COURIER_WEBHOOK_SECRET, constant-time; Steadfast does not
//   sign its callbacks), then this stores it once, keyed by a hash of its identifying fields, so a
//   repeated delivery is recorded as a duplicate and does nothing;
// - the status is then read from the courier's own API (a sync job), and only that verified status
//   is applied, forward-only. A replayed or forged body therefore cannot move a shipment backwards
//   or to a state the courier does not report.
import { createHash } from "node:crypto";
import { ObjectId, type Db } from "mongodb";
import { isDuplicateKey } from "../catalogue/common.ts";
import { enqueueOutbox, runOutboxJobNow } from "../platform/outbox.ts";
import { COURIER_EVENTS, COURIER_SYNC_JOB, SHIPMENTS, type CourierEventDoc, type CourierKey, type ShipmentDoc } from "./schema.ts";
import { TRACKING_REF } from "./shipments.ts";

export const MAX_WEBHOOK_BYTES = 16 * 1024;

export interface ParsedCourierEvent {
  consignmentId: string;
  claimedStatus?: string;
  occurredAt?: Date;
  eventId: string;
}

/** Reads the fields we use from a Steadfast callback. Unknown fields are ignored and never stored. */
export function parseSteadfastEvent(body: unknown): ParsedCourierEvent | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const cid = typeof b.consignment_id === "number" ? String(b.consignment_id) : typeof b.consignment_id === "string" ? b.consignment_id.trim() : "";
  if (!TRACKING_REF.test(cid)) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "");
  const status = str(b.status, 60);
  const updated = str(b.updated_at, 40);
  // Steadfast sends local times without a zone ("2025-03-02 12:45:30"); read them as Asia/Dhaka.
  const local = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(updated);
  const parsed = updated ? new Date(local ? `${updated.replace(" ", "T")}+06:00` : updated) : null;
  const eventId = createHash("sha256")
    .update(JSON.stringify(["steadfast", cid, str(b.notification_type, 40), status, updated, str(b.tracking_message, 300)]))
    .digest("hex");
  return { consignmentId: cid, eventId, ...(status ? { claimedStatus: status } : {}), ...(parsed && !Number.isNaN(parsed.getTime()) ? { occurredAt: parsed } : {}) };
}

export type WebhookResult = { outcome: "duplicate" | "unmatched" | "applied" | "stale" | "verify_failed" | "outside_window" };

/** Timestamp tolerance: a callback about a change older than this, or from the future, is not acted on. */
export const WEBHOOK_MAX_AGE_MS = 72 * 3600_000;
export const WEBHOOK_MAX_SKEW_MS = 10 * 60_000;
export const outsideWindow = (occurredAt: Date | undefined, now: Date) => occurredAt !== undefined && (now.getTime() - occurredAt.getTime() > WEBHOOK_MAX_AGE_MS || occurredAt.getTime() - now.getTime() > WEBHOOK_MAX_SKEW_MS);

export async function receiveCourierEvent(db: Db, provider: CourierKey, event: ParsedCourierEvent, now: Date = new Date()): Promise<WebhookResult> {
  const events = db.collection<CourierEventDoc>(COURIER_EVENTS);
  const shipment = await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ courier: provider, consignmentId: event.consignmentId }, { projection: { _id: 1, version: 1 } });
  const doc: CourierEventDoc = {
    _id: new ObjectId(),
    provider,
    eventId: event.eventId,
    consignmentId: event.consignmentId,
    ...(shipment ? { shipmentId: shipment._id } : {}),
    ...(event.claimedStatus ? { claimedStatus: event.claimedStatus } : {}),
    outcome: outsideWindow(event.occurredAt, now) ? "outside_window" : shipment ? "received" : "unmatched",
    ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
    receivedAt: now,
  };
  try {
    await events.insertOne(doc);
  } catch (error) {
    if (isDuplicateKey(error)) return { outcome: "duplicate" };
    throw error;
  }
  if (doc.outcome === "outside_window") return { outcome: "outside_window" };
  if (!shipment) return { outcome: "unmatched" };
  // One sync job per distinct event; the job reads the courier's API and applies forward-only.
  const seq = Number.parseInt(event.eventId.slice(0, 12), 16);
  const { idempotencyKey } = await enqueueOutbox(db, { type: COURIER_SYNC_JOB, aggregateId: `shipment-${String(shipment._id)}`, seq, payload: { shipmentId: String(shipment._id) } }, { now });
  const { outboxHandlers } = await import("../../adapters/jobs/handlers.ts");
  const run = await runOutboxJobNow(db, idempotencyKey, outboxHandlers, { workerId: `webhook-${provider}` });
  const after = await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: shipment._id }, { projection: { version: 1, courierStatus: 1, lastSync: 1 } });
  const outcome: WebhookResult["outcome"] = run !== "done" || after?.lastSync?.ok === false ? "verify_failed" : after && after.version > shipment.version ? "applied" : "stale";
  await events.updateOne({ _id: doc._id }, { $set: { outcome, ...(after?.courierStatus && outcome !== "verify_failed" ? { verifiedStatus: after.courierStatus.code } : {}) } });
  return { outcome };
}

/** Staff "Refresh status": the same verified read, on demand. */
export async function requestCourierSync(db: Db, shipmentId: ObjectId, now: Date = new Date()): Promise<"done" | "retrying" | "dead" | "not_claimed"> {
  const { idempotencyKey } = await enqueueOutbox(db, { type: COURIER_SYNC_JOB, aggregateId: `shipment-${String(shipmentId)}`, seq: Math.floor(now.getTime() / 1000), payload: { shipmentId: String(shipmentId) } }, { now });
  const { outboxHandlers } = await import("../../adapters/jobs/handlers.ts");
  return runOutboxJobNow(db, idempotencyKey, outboxHandlers, { workerId: `refresh-${String(shipmentId)}` });
}
