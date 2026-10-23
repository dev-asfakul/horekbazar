// Transactional outbox (domain-rules §13). Side effects are written as `outbox` rows in the same
// transaction as the business change, then drained by a worker or the authenticated HTTP drain.
// Claims are atomic (`findOneAndUpdate`) and leased; an expired lease is reclaimable, so a crashed
// worker's job runs again. A row is `done` only when its handler reports the provider accepted it.
import type { ClientSession, Db, ObjectId } from "mongodb";
import type { JobRunResult, OutboxDoc } from "./schema.ts";

export const OUTBOX = "outbox";
export const JOBS = "jobs";
export const DRAIN_JOB_NAME = "outbox-drain";
export const DEFAULT_MAX_ATTEMPTS = 8;
export const DEFAULT_LEASE_MS = 60_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 60 * 60_000;

export interface EnqueueInput {
  type: string;
  aggregateId: string;
  seq: number;
  payload: Record<string, unknown>;
  availableAt?: Date;
}

export const outboxKey = (type: string, aggregateId: string, seq: number) => `${type}:${aggregateId}:${seq}`;

/**
 * Adds a row unless its deterministic key already exists. An upsert (not an insert) so a duplicate
 * inside a transaction is a no-op instead of a duplicate-key error that would abort the transaction.
 */
export async function enqueueOutbox(db: Db, input: EnqueueInput, options: { session?: ClientSession; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const idempotencyKey = outboxKey(input.type, input.aggregateId, input.seq);
  const result = await db.collection<OutboxDoc>(OUTBOX).updateOne(
    { idempotencyKey },
    {
      $setOnInsert: {
        type: input.type,
        payload: input.payload,
        idempotencyKey,
        status: "pending",
        attempts: 0,
        availableAt: input.availableAt ?? now,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, ...(options.session ? { session: options.session } : {}) },
  );
  return { idempotencyKey, enqueued: result.upsertedCount === 1 };
}

/** Exponential backoff with jitter: 30 s · 2^(attempt−1), capped at 1 h, scaled by a random 50–100 %. */
export function backoffMs(attempt: number, random: number = Math.random()): number {
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_CAP_MS);
  return Math.round(exp * (0.5 + 0.5 * Math.min(Math.max(random, 0), 1)));
}

/** Atomically claims the oldest due row (pending/failed and due, or processing with an expired lease). */
export async function claimNext(db: Db, options: { workerId: string; leaseMs?: number; now?: Date }) {
  const now = options.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS));
  return db.collection<OutboxDoc>(OUTBOX).findOneAndUpdate(
    {
      $or: [
        { status: { $in: ["pending", "failed"] }, availableAt: { $lte: now } },
        { status: "processing", leaseUntil: { $lte: now } },
      ],
    },
    { $set: { status: "processing", leaseUntil, leaseOwner: options.workerId, updatedAt: now }, $inc: { attempts: 1 } },
    { sort: { availableAt: 1, _id: 1 }, returnDocument: "after" },
  );
}

/** Marks a claimed row done. False if the lease was lost (another worker reclaimed it). */
export async function completeJob(db: Db, id: ObjectId, workerId: string, options: { providerRef?: string; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const set: Partial<OutboxDoc> = { status: "done", updatedAt: now };
  if (options.providerRef) set.providerRef = options.providerRef.slice(0, 200);
  const result = await db
    .collection<OutboxDoc>(OUTBOX)
    .updateOne({ _id: id, status: "processing", leaseOwner: workerId }, { $set: set, $unset: { leaseUntil: "", leaseOwner: "", lastError: "" } });
  return result.modifiedCount === 1;
}

/** Strips anything credential-shaped from an error before it is stored or shown in admin. */
export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/\/\/[^/\s@]+@/g, "//***@")
    .replace(/(bearer|token|key|secret|password)([=: ]+)\S+/gi, "$1$2***")
    .slice(0, 500);
}

/** Schedules a retry with backoff, or moves the row to `dead` after `maxAttempts`. */
export async function failJob(
  db: Db,
  job: Pick<OutboxDoc, "_id" | "attempts">,
  workerId: string,
  error: unknown,
  options: { maxAttempts?: number; now?: Date; random?: number } = {},
) {
  const now = options.now ?? new Date();
  const dead = job.attempts >= (options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const set: Partial<OutboxDoc> = { status: dead ? "dead" : "failed", lastError: sanitizeError(error), updatedAt: now };
  if (!dead) set.availableAt = new Date(now.getTime() + backoffMs(job.attempts, options.random));
  const result = await db
    .collection<OutboxDoc>(OUTBOX)
    .updateOne({ _id: job._id, status: "processing", leaseOwner: workerId }, { $set: set, $unset: { leaseUntil: "", leaseOwner: "" } });
  return { dead, recorded: result.modifiedCount === 1 };
}

/** `ctx.db` lets a handler record the provider's answer (B8 courier booking writes the consignment id). */
export type OutboxHandler = (job: OutboxDoc, ctx: { db: Db }) => Promise<{ providerRef?: string }>;

/**
 * Runs one specific row immediately (for example a verification e-mail the shopper is waiting for).
 * It uses the same atomic claim, lease and retry bookkeeping as the drain, so a failure here simply
 * leaves the row for the next drain. Returns "done" only when the handler reported provider acceptance.
 */
export async function runOutboxJobNow(
  db: Db,
  idempotencyKey: string,
  handlers: Record<string, OutboxHandler>,
  options: { workerId: string; leaseMs?: number; now?: Date } = { workerId: "inline" },
): Promise<"done" | "retrying" | "dead" | "not_claimed"> {
  const now = options.now ?? new Date();
  const leaseUntil = new Date(now.getTime() + (options.leaseMs ?? DEFAULT_LEASE_MS));
  const job = await db.collection<OutboxDoc>(OUTBOX).findOneAndUpdate(
    { idempotencyKey, status: { $in: ["pending", "failed"] }, availableAt: { $lte: now } },
    { $set: { status: "processing", leaseUntil, leaseOwner: options.workerId, updatedAt: now }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!job) return "not_claimed";
  const handler = Object.hasOwn(handlers, job.type) ? handlers[job.type] : undefined;
  try {
    if (!handler) throw new Error(`no handler registered for ${job.type}`);
    const outcome = await handler(job, { db });
    await completeJob(db, job._id, options.workerId, outcome.providerRef ? { providerRef: outcome.providerRef } : {});
    return "done";
  } catch (error) {
    const failed = await failJob(db, job, options.workerId, error);
    return failed.dead ? "dead" : "retrying";
  }
}

export interface DrainOptions {
  workerId: string;
  trigger: JobRunResult["trigger"];
  /** Stop claiming new rows after this long (the HTTP drain is bounded). */
  budgetMs: number;
  maxJobs?: number;
  leaseMs?: number;
  maxAttempts?: number;
}

export async function drainOutbox(db: Db, handlers: Record<string, OutboxHandler>, options: DrainOptions): Promise<JobRunResult> {
  const started = Date.now();
  const result: JobRunResult = { ok: true, trigger: options.trigger, claimed: 0, done: 0, retried: 0, dead: 0, durationMs: 0 };
  const maxJobs = options.maxJobs ?? 100;
  try {
    while (result.claimed < maxJobs && Date.now() - started < options.budgetMs) {
      const job = await claimNext(db, { workerId: options.workerId, ...(options.leaseMs ? { leaseMs: options.leaseMs } : {}) });
      if (!job) break;
      result.claimed++;
      const handler = Object.hasOwn(handlers, job.type) ? handlers[job.type] : undefined;
      try {
        if (!handler) throw new Error(`no handler registered for ${job.type}`);
        const outcome = await handler(job, { db });
        if (await completeJob(db, job._id, options.workerId, outcome.providerRef ? { providerRef: outcome.providerRef } : {})) result.done++;
      } catch (error) {
        const failed = await failJob(db, job, options.workerId, error, options.maxAttempts ? { maxAttempts: options.maxAttempts } : {});
        if (failed.dead) result.dead++;
        else result.retried++;
      }
    }
  } catch (error) {
    result.ok = false;
    result.error = sanitizeError(error);
  }
  result.durationMs = Date.now() - started;
  await recordJobRun(db, DRAIN_JOB_NAME, result);
  return result;
}

/** HTTP drains (C-01): one at a time, and at most one accepted per interval (replay damping). */
export const DRAIN_MIN_INTERVAL_MS = 30_000;
/** Longer than the route's maxDuration (60 s), so a drain killed mid-run frees the slot afterwards. */
export const DRAIN_LOCK_MS = 75_000;

export type DrainSlot = { acquired: true } | { acquired: false; reason: "locked" | "interval" };

/**
 * Takes the HTTP drain slot in one atomic update: only when no unexpired lock is held *and* the last
 * accepted drain is at least `minIntervalMs` old, so concurrent or replayed requests cannot both pass.
 * The first ever call inserts the record; a concurrent insert loses on the unique `name` index and
 * counts as skipped. A refused call only increments a skip counter.
 */
export async function acquireDrainSlot(
  db: Db,
  options: { owner: string; now?: Date; minIntervalMs?: number; lockMs?: number },
): Promise<DrainSlot> {
  const now = options.now ?? new Date();
  const jobs = db.collection(JOBS);
  const minInterval = options.minIntervalMs ?? DRAIN_MIN_INTERVAL_MS;
  const free = {
    name: DRAIN_JOB_NAME,
    $and: [
      { $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lte: now } }] },
      { $or: [{ lastAcceptedAt: { $exists: false } }, { lastAcceptedAt: { $lte: new Date(now.getTime() - minInterval) } }] },
    ],
  };
  try {
    const taken = await jobs.findOneAndUpdate(
      free,
      { $set: { name: DRAIN_JOB_NAME, lockUntil: new Date(now.getTime() + (options.lockMs ?? DRAIN_LOCK_MS)), lockOwner: options.owner, lastAcceptedAt: now }, $inc: { accepted: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    if (taken?.lockOwner === options.owner) return { acquired: true };
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const current = await jobs.findOne({ name: DRAIN_JOB_NAME }, { projection: { lockUntil: 1 } });
  const reason = current?.lockUntil instanceof Date && current.lockUntil > now ? "locked" : "interval";
  await jobs.updateOne(
    { name: DRAIN_JOB_NAME },
    { $inc: { [reason === "locked" ? "skippedLocked" : "skippedInterval"]: 1 }, $set: { lastSkippedAt: now, lastSkipReason: reason } },
  );
  return { acquired: false, reason };
}

/** Frees the slot taken by `owner` (no effect if it expired and someone else holds it now). */
export async function releaseDrainSlot(db: Db, owner: string) {
  await db.collection(JOBS).updateOne({ name: DRAIN_JOB_NAME, lockOwner: owner }, { $unset: { lockUntil: "", lockOwner: "" } });
}

export async function recordJobRun(db: Db, name: string, result: JobRunResult, now: Date = new Date()) {
  await db
    .collection(JOBS)
    .updateOne({ name }, { $set: { name, lastRunAt: now, lastResult: result, ...(result.ok ? { lastSuccessAt: now } : {}) } }, { upsert: true });
}

export interface OutboxHealth {
  pending: number;
  processing: number;
  dead: number;
  oldestPendingAgeMs: number | null;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  lastResult: JobRunResult | null;
  /** C-01 HTTP drain slot: accepted drains and refused (overlapping or too soon) calls. */
  accepted: number;
  skippedLocked: number;
  skippedInterval: number;
  lastSkippedAt: Date | null;
}

export async function outboxHealth(db: Db, now: Date = new Date()): Promise<OutboxHealth> {
  const outbox = db.collection<OutboxDoc>(OUTBOX);
  const [pending, processing, dead, oldest, job] = await Promise.all([
    outbox.countDocuments({ status: { $in: ["pending", "failed"] } }),
    outbox.countDocuments({ status: "processing" }),
    outbox.countDocuments({ status: "dead" }),
    outbox.findOne({ status: { $in: ["pending", "failed"] } }, { sort: { createdAt: 1 }, projection: { createdAt: 1 } }),
    db.collection(JOBS).findOne({ name: DRAIN_JOB_NAME }),
  ]);
  return {
    pending,
    processing,
    dead,
    oldestPendingAgeMs: oldest ? now.getTime() - oldest.createdAt.getTime() : null,
    lastRunAt: (job?.lastRunAt as Date | undefined) ?? null,
    lastSuccessAt: (job?.lastSuccessAt as Date | undefined) ?? null,
    lastResult: (job?.lastResult as JobRunResult | undefined) ?? null,
    accepted: (job?.accepted as number | undefined) ?? 0,
    skippedLocked: (job?.skippedLocked as number | undefined) ?? 0,
    skippedInterval: (job?.skippedInterval as number | undefined) ?? 0,
    lastSkippedAt: (job?.lastSkippedAt as Date | undefined) ?? null,
  };
}
