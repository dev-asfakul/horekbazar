// Rewards ledger schema (B9; SCHEMA.md → rewardLedger, domain-rules §5.7). Append-only: a customer's
// balance is always the sum of their entries, and every entry has a unique idempotency key so a
// retried accrual, reversal or adjustment can never be counted twice.
//   accrue  (+) order completed: order:<orderId>:accrue
//   reverse (−) returned goods settled: return:<returnId>:reverse
//   adjust  (±) staff correction with a reason: adjust:<Idempotency-Key>
//   redeem / expire are reserved for checkout redemption and the expiry job (not written in B9, see
//   HANDOFF). Expiry is derived from `expiresAt` when the balance is read; `expire` entries are
//   ignored by that calculation so a future expiry job cannot take the same points twice.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const REWARD_LEDGER = "rewardLedger";
export const REWARD_KINDS = ["accrue", "redeem", "reverse", "adjust", "expire"] as const;

export const rewardEntrySchema = z
  .object({
    _id: zObjectId(),
    userId: z.string().min(1).max(100),
    kind: z.enum(REWARD_KINDS),
    /** Signed whole points; accrue > 0, reverse/redeem/expire < 0, adjust ≠ 0. */
    points: zInt().min(-1_000_000).max(1_000_000),
    orderId: zObjectId().optional(),
    returnId: zObjectId().optional(),
    /** Accrual basis in paisa (goods paid for after coupon), used to reverse in proportion. */
    basisMinor: zInt().min(0).optional(),
    /** Accrued points stop counting after this date (stated to the customer). */
    expiresAt: zDate().optional(),
    note: z.string().trim().min(1).max(300).optional(),
    actor: z.object({ type: z.enum(["system", "staff"]), id: z.string().min(1).max(100) }).strict(),
    idempotencyKey: z.string().min(1).max(200),
    createdAt: zDate(),
  })
  .strict();
export type RewardEntryDoc = z.infer<typeof rewardEntrySchema>;

/**
 * One serialisation document per customer (same pattern as `catalogueLocks`). Every ledger write
 * for a customer increments `seq` inside its transaction, so an order completing while one of its
 * returns settles, or two staff adjustments at once, write the same document: one transaction is
 * retried and sees the other's entry. Holds no balance; the ledger stays the only source of truth.
 */
export const REWARD_LOCKS = "rewardLocks";
export const rewardLockSchema = z
  .object({
    _id: z.string().min(1).max(100),
    seq: zInt().min(1),
    updatedAt: zDate(),
  })
  .strict();
export type RewardLockDoc = z.infer<typeof rewardLockSchema>;
