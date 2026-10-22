// Fulfilment module schemas (B8; SCHEMA.md → shipments, courierEvents, returns; domain-rules §3,
// §4.1, §6, §7). Zod is the source of the committed validators.
//
// A shipment keeps two states apart:
// - `status` is the store's own fulfilment state. Staff (or a verified courier "delivered") move it
//   through SHIPMENT_TRANSITIONS, in the same transaction as the order step it implies.
// - `courierStatus` is what the courier last reported, read from the courier's status API. It only
//   moves forward (COURIER_STATUS_RANK) and never changes stock on its own.
// `checkpoints` is the record the customer sees: only steps that really happened, each with its source.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const SHIPMENTS = "shipments";
export const COURIER_EVENTS = "courierEvents";
export const RETURNS = "returns";

/** Couriers the template knows. `manual` is always available; the others need credentials. */
export const COURIER_KEYS = ["manual", "steadfast", "pathao", "redx"] as const;
export type CourierKey = (typeof COURIER_KEYS)[number];

export const SHIPMENT_STATUSES = ["draft", "booked", "handed_over", "delivered", "delivery_failed", "returned", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];
/** Statuses that still need work; at most one open shipment per order (partial unique index on `open`). */
export const OPEN_SHIPMENT: readonly ShipmentStatus[] = ["draft", "booked", "handed_over", "delivery_failed"];

/** Normalised courier-reported statuses (Steadfast's delivery_status values map onto these). */
export const COURIER_STATUSES = ["in_review", "pending", "hold", "delivered_approval_pending", "partial_delivered_approval_pending", "cancelled_approval_pending", "unknown_approval_pending", "delivered", "partial_delivered", "cancelled", "unknown"] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const BOOKING_STATES = ["requested", "accepted", "failed"] as const;
export const CHECKPOINT_SOURCES = ["staff", "courier", "system"] as const;
export const RTO_OUTCOMES = ["restock", "write_off"] as const;

const ref = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._\-/]+$/);
const httpsUrl = z.string().max(500).regex(/^https:\/\/[^\s]+$/);
const actorRef = z.object({ type: z.enum(["staff", "system", "courier", "customer"]), id: z.string().min(1).max(100) }).strict();

export const shipmentCheckpointSchema = z
  .object({
    /** A shipment status, or a courier-reported status prefixed `courier:`. */
    code: z.string().min(1).max(60),
    source: z.enum(CHECKPOINT_SOURCES),
    note: z.string().trim().max(300).optional(),
    at: zDate(),
  })
  .strict();
export type ShipmentCheckpoint = z.infer<typeof shipmentCheckpointSchema>;

export const shipmentSchema = z
  .object({
    _id: zObjectId(),
    orderId: zObjectId(),
    orderNumber: z.string().min(1).max(40),
    courier: z.enum(COURIER_KEYS),
    /** Manual shipments: the carrier's name as staff typed it (shown to the customer). */
    carrierName: z.string().trim().min(1).max(80).optional(),
    /** The courier's consignment id. Unique per courier (sparse). Required before hand-over. */
    consignmentId: ref.optional(),
    /** The courier's public tracking code, when it differs from the consignment id. */
    trackingCode: ref.optional(),
    /** Only a link staff entered or the courier returned. Never built from a guessed pattern. */
    trackingUrl: httpsUrl.optional(),
    /** Our reference sent to the courier (unique per courier account): orderNumber-n. */
    invoice: z.string().regex(/^[A-Za-z0-9-]{3,60}$/),
    /** Cash to collect, minor units. */
    codAmount: zInt().min(0),
    status: z.enum(SHIPMENT_STATUSES),
    /** true while status is in OPEN_SHIPMENT; carries the one-open-shipment-per-order index. */
    open: z.boolean(),
    booking: z
      .object({
        state: z.enum(BOOKING_STATES),
        requestedAt: zDate(),
        settledAt: zDate().optional(),
        error: z.string().max(300).optional(),
      })
      .strict()
      .optional(),
    courierStatus: z
      .object({
        code: z.enum(COURIER_STATUSES),
        raw: z.string().max(60),
        rank: zInt().min(0).max(10),
        at: zDate(),
      })
      .strict()
      .optional(),
    lastSync: z.object({ at: zDate(), ok: z.boolean(), error: z.string().max(300).optional() }).strict().optional(),
    checkpoints: z.array(shipmentCheckpointSchema).max(100),
    /** Per-line result after a returned parcel is inspected (order is returned_to_origin). */
    rtoInspection: z
      .array(
        z
          .object({
            lineId: z.string().regex(/^[a-f0-9]{24}$/),
            outcome: z.enum(RTO_OUTCOMES),
            qty: zInt().min(1).max(99),
            note: z.string().trim().max(300).optional(),
            by: actorRef,
            at: zDate(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    statusReason: z.string().trim().max(500).optional(),
    handedOverAt: zDate().optional(),
    closedAt: zDate().optional(),
    createdBy: actorRef,
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type ShipmentDoc = z.infer<typeof shipmentSchema>;

export const COURIER_EVENT_OUTCOMES = ["received", "applied", "stale", "unmatched", "verify_failed", "outside_window"] as const;

export const courierEventSchema = z
  .object({
    _id: zObjectId(),
    provider: z.enum(COURIER_KEYS),
    /** Hash of the delivered payload's identifying fields: a repeated delivery is the same event. */
    eventId: z.string().regex(/^[a-f0-9]{64}$/),
    consignmentId: ref,
    shipmentId: zObjectId().optional(),
    /** Status the payload claimed (unverified) and the status the courier API confirmed. */
    claimedStatus: z.string().max(60).optional(),
    verifiedStatus: z.enum(COURIER_STATUSES).optional(),
    outcome: z.enum(COURIER_EVENT_OUTCOMES),
    occurredAt: zDate().optional(),
    receivedAt: zDate(),
  })
  .strict();
export type CourierEventDoc = z.infer<typeof courierEventSchema>;

export const RETURN_STATUSES = ["requested", "approved", "rejected", "received", "inspected", "restocked", "written_off", "refunded", "credited", "closed"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];
export const REFUND_METHODS = ["bkash", "nagad", "bank", "store_reward"] as const;

export const returnLineSchema = z
  .object({
    lineId: z.string().regex(/^[a-f0-9]{24}$/),
    variantId: zObjectId(),
    qty: zInt().min(1).max(99),
    outcome: z.enum(RTO_OUTCOMES).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const returnSchema = z
  .object({
    _id: zObjectId(),
    orderId: zObjectId(),
    orderNumber: z.string().min(1).max(40),
    userId: z.string().min(1).max(100),
    lines: z.array(returnLineSchema).min(1).max(50),
    reason: z.string().trim().min(1).max(500),
    status: z.enum(RETURN_STATUSES),
    statusReason: z.string().trim().max(500).optional(),
    inspection: z.object({ note: z.string().trim().max(500).optional(), by: actorRef, at: zDate() }).strict().optional(),
    refund: z
      .object({ method: z.enum(REFUND_METHODS), amount: zInt().min(0), reference: z.string().trim().max(100).optional(), by: actorRef, at: zDate() })
      .strict()
      .optional(),
    history: z
      .array(
        z
          .object({
            from: z.union([z.enum(RETURN_STATUSES), z.literal("new")]),
            to: z.enum(RETURN_STATUSES),
            by: actorRef,
            note: z.string().trim().max(500).optional(),
            at: zDate(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    version: zInt().min(1),
    requestedAt: zDate(),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type ReturnDoc = z.infer<typeof returnSchema>;

/** Outbox job types (lib/adapters/jobs/handlers.ts). */
export const COURIER_BOOK_JOB = "courier.book";
export const COURIER_SYNC_JOB = "courier.sync";
