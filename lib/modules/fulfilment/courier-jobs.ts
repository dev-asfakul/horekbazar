// Courier outbox handlers (B8; domain-rules §13). Idempotent: a booking job does nothing once the
// shipment's booking is settled, and a sync job only ever moves the courier status forward. A job
// completes only when the courier answered; a refusal the courier will repeat (validation, a
// duplicate invoice, missing credentials) is recorded on the shipment as a failed booking and the
// job ends, so staff see it at once instead of after eight retries. Network and 5xx errors retry.
import { ObjectId, type Db } from "mongodb";
import { inTransaction, isDuplicateKey } from "../catalogue/common.ts";
import type { OutboxDoc } from "../platform/schema.ts";
import { ORDERS, type OrderDoc } from "../orders/schema.ts";
import { CourierRequestError, steadfastBookingProblems, steadfastConfig, steadfastCreateOrder, steadfastStatusByConsignment, type SteadfastBookingInput } from "../../adapters/courier/steadfast.ts";
import { COURIER_STATUS_RANK, normaliseCourierStatus } from "./courier-status.ts";
import { applyCourierStatus, recordSyncFailure } from "./shipments.ts";
import { SHIPMENTS, type ShipmentDoc } from "./schema.ts";

type Env = Record<string, string | undefined>;

function shipmentIdOf(job: OutboxDoc): ObjectId {
  const id = job.payload.shipmentId;
  if (typeof id !== "string" || !ObjectId.isValid(id)) throw new Error("courier job: missing shipment id");
  return new ObjectId(id);
}

/** E.164 +8801XXXXXXXXX → the 11-digit local form couriers expect. */
export const localBdPhone = (e164: string) => (e164.startsWith("+880") ? `0${e164.slice(4)}` : e164);

export function steadfastBookingInput(order: Pick<OrderDoc, "address" | "totals">, invoice: string, note?: string): SteadfastBookingInput {
  const a = order.address;
  const address = [a.line, a.area, a.district, a.landmark].filter(Boolean).join(", ");
  return { invoice, recipientName: a.name, recipientPhone: localBdPhone(a.phone), recipientAddress: address, codAmount: order.totals.grandTotal / 100, ...(note ? { note } : {}) };
}

async function settleBookingFailure(db: Db, s: ShipmentDoc, error: string, now: Date) {
  await db.collection<ShipmentDoc>(SHIPMENTS).updateOne(
    { _id: s._id, status: "draft", "booking.state": "requested" },
    { $set: { booking: { state: "failed", requestedAt: s.booking!.requestedAt, settledAt: now, error: error.slice(0, 300) }, updatedAt: now }, $inc: { version: 1 }, $push: { checkpoints: { code: "booking_failed", source: "system", note: error.slice(0, 300), at: now } } },
  );
}

export async function runCourierBooking(db: Db, job: OutboxDoc, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<{ providerRef?: string }> {
  const now = new Date();
  const shipments = db.collection<ShipmentDoc>(SHIPMENTS);
  const s = await shipments.findOne({ _id: shipmentIdOf(job) });
  if (!s) throw new Error("courier job: shipment not found");
  // Already settled (accepted, refused, cancelled or entered by hand): nothing to do.
  if (s.status !== "draft" || s.booking?.state !== "requested") return { providerRef: s.consignmentId ?? "settled" };
  if (s.courier !== "steadfast") {
    await settleBookingFailure(db, s, `${s.courier} booking is not available in this build`, now);
    return { providerRef: "refused" };
  }
  const config = steadfastConfig(env);
  if (!config) {
    await settleBookingFailure(db, s, "Steadfast is not configured on this deployment (STEADFAST_API_KEY, STEADFAST_SECRET_KEY)", now);
    return { providerRef: "not_configured" };
  }
  const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: s.orderId }, { projection: { address: 1, totals: 1 } });
  if (!order) throw new Error("courier job: order not found");
  const input = steadfastBookingInput(order, s.invoice, typeof job.payload.note === "string" ? job.payload.note : undefined);
  const problems = steadfastBookingProblems(input);
  if (problems.length > 0) {
    await settleBookingFailure(db, s, `The address does not fit Steadfast's limits (${problems.join(", ")}). Book in the Steadfast portal and enter the consignment id.`, now);
    return { providerRef: "refused" };
  }
  let booking;
  try {
    booking = await steadfastCreateOrder(config, input, fetchImpl);
  } catch (error) {
    if (error instanceof CourierRequestError && !error.retryable) {
      await settleBookingFailure(db, s, `Steadfast refused the booking: ${error.message}. If it shows in the Steadfast portal, enter its consignment id by hand.`, now);
      return { providerRef: "refused" };
    }
    await shipments.updateOne({ _id: s._id, "booking.state": "requested" }, { $set: { "booking.error": String(error instanceof Error ? error.message : error).slice(0, 300), updatedAt: now } });
    throw error; // retried by the outbox with backoff
  }
  const code = normaliseCourierStatus(booking.status);
  try {
    await inTransaction(db.client, async (session) => {
      const res = await shipments.updateOne(
        { _id: s._id, status: "draft", "booking.state": "requested" },
        {
          $set: {
            status: "booked",
            consignmentId: booking.consignmentId,
            ...(booking.trackingCode ? { trackingCode: booking.trackingCode } : {}),
            booking: { state: "accepted", requestedAt: s.booking!.requestedAt, settledAt: now },
            courierStatus: { code, raw: booking.status.slice(0, 60), rank: COURIER_STATUS_RANK[code], at: now },
            updatedAt: now,
          },
          $inc: { version: 1 },
          $push: { checkpoints: { code: "booked", source: "courier", at: now } },
        },
        { session },
      );
      if (res.matchedCount === 0) throw new Error("courier job: shipment changed while booking");
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      await settleBookingFailure(db, s, `Steadfast returned consignment ${booking.consignmentId}, which another shipment already uses`, now);
      return { providerRef: "duplicate" };
    }
    throw error;
  }
  return { providerRef: booking.consignmentId };
}

export async function runCourierSync(db: Db, job: OutboxDoc, env: Env = process.env, fetchImpl: typeof fetch = fetch): Promise<{ providerRef?: string }> {
  const now = new Date();
  const s = await db.collection<ShipmentDoc>(SHIPMENTS).findOne({ _id: shipmentIdOf(job) });
  if (!s) throw new Error("courier job: shipment not found");
  if (s.courier !== "steadfast" || !s.consignmentId) return { providerRef: "nothing_to_sync" };
  const config = steadfastConfig(env);
  if (!config) {
    await recordSyncFailure(db, s._id, "Steadfast is not configured on this deployment", now);
    return { providerRef: "not_configured" };
  }
  let raw: string;
  try {
    raw = await steadfastStatusByConsignment(config, s.consignmentId, fetchImpl);
  } catch (error) {
    await recordSyncFailure(db, s._id, String(error instanceof Error ? error.message : error), now);
    if (error instanceof CourierRequestError && !error.retryable) return { providerRef: "refused" };
    throw error;
  }
  const outcome = await applyCourierStatus(db, { shipmentId: s._id, raw, provider: "steadfast", now });
  return { providerRef: `${normaliseCourierStatus(raw)}:${outcome}` };
}
