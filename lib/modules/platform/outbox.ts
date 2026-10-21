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

export type OutboxHandler = (job: OutboxDoc) => Promise<{ providerRef?: string }>;

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
        const outcome = await handler(job);
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
  };
}
