// Rewards service (B9; domain-rules §5.7). Points are earned only when an order completes, on the
// goods actually paid for (line total minus coupon share, less anything already returned), and are
// reversed in proportion when returned goods are settled. Nothing here runs while `features.rewards`
// is off, which is the default and stays so for a BD production store until legal review.
// Redemption at checkout and the expiry job are not part of this change (see docs/HANDOFF.md).
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { isDuplicateKey, type Actor } from "../catalogue/common.ts";
import { RETURNS, type ReturnDoc } from "../fulfilment/schema.ts";
import type { OrderDoc } from "../orders/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import { CommerceError } from "../pricing/cart.ts";
import type { SettingsDoc } from "../settings/schema.ts";
import { REWARD_LEDGER, rewardEntrySchema, type RewardEntryDoc } from "./schema.ts";

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
  // Inside a transaction a duplicate-key error aborts the whole transaction, so look first. The
  // callers' transactions also write the order or return document, so two concurrent runs conflict
  // there and one retries, finding this entry.
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
  const accrual = await ledger.findOne({ idempotencyKey: `order:${String(r.orderId)}:accrue` }, { session });
  if (!accrual || !accrual.basisMinor) return null;
  let value = 0;
  for (const rl of r.lines) {
    const l = order.lines.find((x) => x.lineId === rl.lineId);
    if (l) value += Math.floor(((l.lineTotal - l.couponShare) * rl.qty) / l.quantity);
  }
  const already = await ledger.aggregate<{ sum: number }>([{ $match: { orderId: r.orderId, kind: "reverse" } }, { $group: { _id: null, sum: { $sum: "$points" } } }], { session }).toArray();
  const remaining = accrual.points + (already[0]?.sum ?? 0);
  const points = Math.min(remaining, Math.ceil((accrual.points * value) / accrual.basisMinor));
  if (points <= 0) return null;
  const { entry } = await insertEntry(db, { userId: r.userId, kind: "reverse", points: -points, orderId: r.orderId, returnId: r._id, actor: { type: "system", id: "return.settled" }, idempotencyKey: `return:${String(r._id)}:reverse`, createdAt: now }, session);
  return entry;
}

/** Current balance (sum of entries, accruals past their expiry date excluded) and the latest entries. */
export async function rewardSummary(db: Db, userId: string, now = new Date(), limit = 50) {
  const ledger = db.collection<RewardEntryDoc>(REWARD_LEDGER);
  const [entries, agg] = await Promise.all([
    ledger.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray(),
    ledger.aggregate<{ sum: number }>([{ $match: { userId, $or: [{ kind: { $ne: "accrue" } }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] } }, { $group: { _id: null, sum: { $sum: "$points" } } }]).toArray(),
  ]);
  return { balance: Math.max(0, agg[0]?.sum ?? 0), entries };
}

/** Staff adjustment (`rewards.write`, Idempotency-Key, reason required, audited). */
export async function adjustRewards(db: Db, actor: Actor, input: { userId: string; points: number; reason: string; idempotencyKey: string }, now = new Date()) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 300) throw new CommerceError("reason_required");
  if (!Number.isInteger(input.points) || input.points === 0 || Math.abs(input.points) > 100_000) throw new CommerceError("invalid_value");
  if (!/^[A-Za-z0-9-]{16,100}$/.test(input.idempotencyKey)) throw new CommerceError("idempotency_key_invalid");
  if (input.points < 0) {
    const { balance } = await rewardSummary(db, input.userId, now, 1);
    if (balance + input.points < 0) throw new CommerceError("rewards_insufficient");
  }
  const key = `adjust:${input.idempotencyKey}`;
  const { entry, created } = await insertEntry(db, { userId: input.userId, kind: "adjust", points: input.points, note: reason, actor: { type: "staff", id: actor.id }, idempotencyKey: key, createdAt: now });
  if (!created && (entry.userId !== input.userId || entry.points !== input.points)) throw new CommerceError("idempotency_key_reused");
  if (created) {
    await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "rewards.adjusted", target: { type: "customer", id: input.userId }, after: { points: input.points, reason }, ip: actor.ip ?? null }, { now });
  }
  return entry;
}
