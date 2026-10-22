// Rewards service (B9; domain-rules §5.7). Points are earned only when an order completes, on the
// goods actually paid for (line total minus coupon share, less anything already returned), and are
// reversed in proportion when returned goods are settled. Nothing here runs while `features.rewards`
// is off, which is the default and stays so for a BD production store until legal review.
// Redemption at checkout and the expiry job are not part of this change (see docs/HANDOFF.md).
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { inTransaction, isDuplicateKey, type Actor } from "../catalogue/common.ts";
import { RETURNS, type ReturnDoc } from "../fulfilment/schema.ts";
import type { OrderDoc } from "../orders/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import { CommerceError } from "../pricing/cart.ts";
import { SETTINGS, SETTINGS_ID, type SettingsDoc } from "../settings/schema.ts";
import { REWARD_LEDGER, REWARD_LOCKS, rewardEntrySchema, type RewardEntryDoc, type RewardLockDoc } from "./schema.ts";

const DAY = 86_400_000;
/** Return states in which the goods are back with the store (inspection recorded and settled). */
const SETTLED: ReturnDoc["status"][] = ["restocked", "written_off", "refunded", "credited"];

type RewardSettings = Pick<SettingsDoc, "features" | "rewards">;
export const rewardsOn = (s: RewardSettings) => s.features.rewards === true && !!s.rewards && s.rewards.pointsPer100Taka > 0;

/** Points for a basis in paisa: whole points only, rounded down (never over-credits). */
export const pointsFor = (basisMinor: number, pointsPer100Taka: number) => Math.floor((basisMinor * pointsPer100Taka) / 10_000);

async function insertEntry(db: Db, entry: Omit<RewardEntryDoc, "_id">, session?: ClientSession) {
  const doc = { _id: new ObjectId(), ...entry };
  const parsed = rewardEntrySchema.safeParse(doc);
  if (!parsed.success) throw new CommerceError("invalid_value");
  // Inside a transaction a duplicate-key error aborts the whole transaction, so look first. Callers
  // hold the customer's reward lock (lockAccount), so a concurrent run conflicts there and retries.
  if (session) {
    const existing = await db.collection<RewardEntryDoc>(REWARD_LEDGER).findOne({ idempotencyKey: entry.idempotencyKey }, { session });
    if (existing) return { entry: existing, created: false };
  }
  try {
    await db.collection<RewardEntryDoc>(REWARD_LEDGER).insertOne(parsed.data, session ? { session } : {});
    return { entry: parsed.data, created: true };
  } catch (error) {
    if (!isDuplicateKey(error) || session) throw error;
    const existing = await db.collection<RewardEntryDoc>(REWARD_LEDGER).findOne({ idempotencyKey: entry.idempotencyKey }, session ? { session } : {});
    return { entry: existing!, created: false };
  }
}

/**
 * Serialises ledger writes for one customer inside the caller's transaction (see REWARD_LOCKS).
 * Must be the first reward read or write in the transaction.
 */
export async function lockAccount(db: Db, session: ClientSession, userId: string, now: Date) {
  await db.collection<RewardLockDoc>(REWARD_LOCKS).updateOne({ _id: userId }, { $inc: { seq: 1 }, $set: { updatedAt: now } }, { upsert: true, session });
}

/** Paid value (paisa) of each order line still kept by the customer after settled returns. */
async function keptBasis(db: Db, order: Pick<OrderDoc, "_id" | "lines">, session?: ClientSession) {
  const returned = new Map<string, number>();
  const rets = await db.collection<ReturnDoc>(RETURNS).find({ orderId: order._id, status: { $in: SETTLED } }, { ...(session ? { session } : {}), projection: { lines: 1 } }).toArray();
  for (const r of rets) for (const l of r.lines) returned.set(l.lineId, (returned.get(l.lineId) ?? 0) + l.qty);
  let basis = 0;
  for (const l of order.lines) {
    if (l.status !== "delivered") continue;
    const kept = Math.max(0, l.quantity - (returned.get(l.lineId) ?? 0));
    basis += Math.floor(((l.lineTotal - l.couponShare) * kept) / l.quantity);
  }
  return basis;
}

/** Called inside the order transition transaction when an order becomes `completed`. Idempotent. */
export async function accrueForOrder(db: Db, session: ClientSession, order: Pick<OrderDoc, "_id" | "userId" | "lines">, settings: RewardSettings, now: Date) {
  if (!rewardsOn(settings)) return null;
  await lockAccount(db, session, order.userId, now);
  const basis = await keptBasis(db, order, session);
  const points = pointsFor(basis, settings.rewards!.pointsPer100Taka);
  if (points <= 0) return null;
  const { entry } = await insertEntry(
    db,
    { userId: order.userId, kind: "accrue", points, orderId: order._id, basisMinor: basis, expiresAt: new Date(now.getTime() + settings.rewards!.expiryDays * DAY), actor: { type: "system", id: "order.completed" }, idempotencyKey: `order:${String(order._id)}:accrue`, createdAt: now },
    session,
  );
  return entry;
}

/**
 * Called inside the return-settlement transaction. Reverses the share of the order's accrual that
 * the returned goods earned. Does nothing when the order has no accrual (not completed, or rewards
 * off at the time). Never takes back more than was accrued for the order.
 */
export async function reverseForReturn(db: Db, session: ClientSession, r: Pick<ReturnDoc, "_id" | "orderId" | "userId" | "lines">, order: Pick<OrderDoc, "lines">, now: Date) {
  const ledger = db.collection<RewardEntryDoc>(REWARD_LEDGER);
  // Lock first, even when nothing is accrued yet: if the order is completing at the same moment,
  // one of the two transactions retries and either reverses the new accrual or is counted in it.
  await lockAccount(db, session, r.userId, now);
  const accrual = await ledger.findOne({ idempotencyKey: `order:${String(r.orderId)}:accrue` }, { session });
  if (!accrual || !accrual.basisMinor) return null;
  let value = 0;
  for (const rl of r.lines) {
    const l = order.lines.find((x) => x.lineId === rl.lineId);
    if (l) value += Math.floor(((l.lineTotal - l.couponShare) * rl.qty) / l.quantity);
  }
  const already = await ledger.aggregate<{ sum: number }>([{ $match: { userId: r.userId, orderId: r.orderId, kind: "reverse" } }, { $group: { _id: null, sum: { $sum: "$points" } } }], { session }).toArray();
  const remaining = accrual.points + (already[0]?.sum ?? 0);
  const points = Math.min(remaining, Math.ceil((accrual.points * value) / accrual.basisMinor));
  if (points <= 0) return null;
  const { entry } = await insertEntry(db, { userId: r.userId, kind: "reverse", points: -points, orderId: r.orderId, returnId: r._id, actor: { type: "system", id: "return.settled" }, idempotencyKey: `return:${String(r._id)}:reverse`, createdAt: now }, session);
  return entry;
}

/**
 * Available points, derived from the ledger (no cached balance). Each accrual counts net of the
 * reversals for its order until its `expiresAt`; after that the accrual and its reversals both stop
 * counting, so a reversal of points that already expired cannot eat into newer points. Staff
 * adjustments always count; `expire` entries are ignored (expiry is derived from the date). Never
 * below zero. `redeem` entries (not written in B9) count as spent.
 */
export function availablePoints(entries: Pick<RewardEntryDoc, "kind" | "points" | "orderId" | "expiresAt">[], now: Date) {
  const reversed = new Map<string, number>();
  for (const e of entries) if (e.kind === "reverse" && e.orderId) reversed.set(String(e.orderId), (reversed.get(String(e.orderId)) ?? 0) + e.points);
  let sum = 0;
  for (const e of entries) {
    if (e.kind === "accrue") {
      if (e.expiresAt && e.expiresAt.getTime() <= now.getTime()) continue;
      sum += Math.max(0, e.points + (e.orderId ? (reversed.get(String(e.orderId)) ?? 0) : 0));
    } else if (e.kind === "adjust" || e.kind === "redeem") sum += e.points;
  }
  return Math.max(0, sum);
}

async function balanceOf(db: Db, userId: string, now: Date, session?: ClientSession) {
  const all = await db.collection<RewardEntryDoc>(REWARD_LEDGER).find({ userId }, { ...(session ? { session } : {}), projection: { kind: 1, points: 1, orderId: 1, expiresAt: 1 } }).toArray();
  return availablePoints(all, now);
}

/** Current available balance (see availablePoints) and the latest entries. */
export async function rewardSummary(db: Db, userId: string, now = new Date(), limit = 50) {
  const [entries, balance] = await Promise.all([db.collection<RewardEntryDoc>(REWARD_LEDGER).find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray(), balanceOf(db, userId, now)]);
  return { balance, entries };
}

/**
 * Staff adjustment (`rewards.write`, Idempotency-Key, reason required, audited). Refused while
 * rewards are off. Runs in a transaction holding the customer's reward lock, so two concurrent
 * deductions cannot both pass the balance check; the audit entry commits with the ledger entry.
 */
export async function adjustRewards(db: Db, client: MongoClient, actor: Actor, input: { userId: string; points: number; reason: string; idempotencyKey: string }, now = new Date()) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 300) throw new CommerceError("reason_required");
  if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > 100_000) throw new CommerceError("invalid_value");
  if (!/^[A-Za-z0-9-]{16,100}$/.test(input.idempotencyKey)) throw new CommerceError("idempotency_key_invalid");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.userId)) throw new CommerceError("not_found");
  const settings = await db.collection<SettingsDoc>(SETTINGS).findOne({ _id: SETTINGS_ID } as never, { projection: { features: 1, rewards: 1 } });
  if (!settings || !rewardsOn(settings)) throw new CommerceError("rewards_off");
  const key = `adjust:${input.idempotencyKey}`;
  return inTransaction(client, async (session) => {
    await lockAccount(db, session, input.userId, now);
    const existing = await db.collection<RewardEntryDoc>(REWARD_LEDGER).findOne({ idempotencyKey: key }, { session });
    if (existing) {
      if (existing.userId !== input.userId || existing.points !== input.points) throw new CommerceError("idempotency_key_reused");
      return existing;
    }
    if (input.points < 0 && (await balanceOf(db, input.userId, now, session)) + input.points < 0) throw new CommerceError("rewards_insufficient");
    const { entry } = await insertEntry(db, { userId: input.userId, kind: "adjust", points: input.points, note: reason, actor: { type: "staff", id: actor.id }, idempotencyKey: key, createdAt: now }, session);
    await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "rewards.adjusted", target: { type: "customer", id: input.userId }, after: { points: input.points, reason }, ip: actor.ip ?? null }, { now, session });
    return entry;
  });
}
