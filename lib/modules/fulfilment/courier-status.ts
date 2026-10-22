// Courier-reported status: normalisation and the forward-only rule (domain-rules §7: "courier
// events are applied only if they move the shipment forward in a fixed order of statuses"). Pure,
// so the ordering is unit-tested on its own.
import { COURIER_STATUSES, type CourierStatus } from "./schema.ts";

/**
 * Fixed order. Rank 5 is final: once the courier reports delivered, partial delivery or cancelled,
 * nothing later changes it. "unknown" sits with "hold" so a later real status can still replace it.
 */
export const COURIER_STATUS_RANK: Record<CourierStatus, number> = {
  in_review: 1,
  pending: 2,
  hold: 3,
  unknown: 3,
  delivered_approval_pending: 4,
  partial_delivered_approval_pending: 4,
  cancelled_approval_pending: 4,
  unknown_approval_pending: 4,
  delivered: 5,
  partial_delivered: 5,
  cancelled: 5,
};
export const FINAL_COURIER_RANK = 5;

/** Maps a provider's raw status onto the normalised list; anything unrecognised is "unknown". */
export function normaliseCourierStatus(raw: string): CourierStatus {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (COURIER_STATUSES as readonly string[]).includes(key) ? (key as CourierStatus) : "unknown";
}

/** True when `next` may replace `current`: strictly further on, or a sideways move below final. */
export function courierStatusAdvances(current: { code: CourierStatus; rank: number } | undefined, next: CourierStatus): boolean {
  if (!current) return true;
  const rank = COURIER_STATUS_RANK[next];
  if (current.rank >= FINAL_COURIER_RANK) return false;
  if (rank > current.rank) return true;
  return rank === current.rank && next !== current.code;
}
