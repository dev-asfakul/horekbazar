// Platform module schemas (domain-rules §2: Platform owns `outbox`, `auditLog`, `jobs`; §13, §14).
// Zod is the single source of truth: TypeScript types are inferred here, and the committed MongoDB
// validators in db/validators/ are generated from these schemas (npm run db:validators).
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const OUTBOX_STATUSES = ["pending", "processing", "done", "failed", "dead"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/** `<type>:<aggregateId>:<seq>` (domain-rules §4.1); deterministic so a retried transaction cannot enqueue twice. */
export const OUTBOX_KEY_PATTERN = "^[a-z][a-z0-9_.]*:[A-Za-z0-9_-]+:[0-9]+$";

export const outboxSchema = z
  .object({
    _id: zObjectId(),
    type: z.string().regex(/^[a-z][a-z0-9_.]*$/).max(64),
    payload: z.record(z.string(), z.unknown()),
    idempotencyKey: z.string().regex(new RegExp(OUTBOX_KEY_PATTERN)).max(200),
    status: z.enum(OUTBOX_STATUSES),
    attempts: zInt().min(0),
    availableAt: zDate(),
    leaseUntil: zDate().optional(),
    leaseOwner: z.string().max(100).optional(),
    lastError: z.string().max(2000).optional(),
    providerRef: z.string().max(200).optional(),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type OutboxDoc = z.infer<typeof outboxSchema>;

export const auditLogSchema = z
  .object({
    _id: zObjectId(),
    actor: z.object({ id: z.string().min(1).max(100), role: z.string().min(1).max(50) }).strict(),
    action: z.string().regex(/^[a-z][a-z0-9_.]*$/).max(100),
    target: z.object({ type: z.string().min(1).max(50), id: z.string().min(1).max(200) }).strict(),
    before: z.record(z.string(), z.unknown()).optional(),
    after: z.record(z.string(), z.unknown()).optional(),
    /** Truncated: IPv4 /24, IPv6 /48 (lib/modules/platform/audit.ts). */
    ip: z.string().max(64).optional(),
    at: zDate(),
  })
  .strict();
export type AuditLogDoc = z.infer<typeof auditLogSchema>;

export const jobRunResultSchema = z
  .object({
    ok: z.boolean(),
    trigger: z.enum(["worker", "http"]),
    claimed: zInt().min(0),
    done: zInt().min(0),
    retried: zInt().min(0),
    dead: zInt().min(0),
    durationMs: zInt().min(0),
    error: z.string().max(500).optional(),
  })
  .strict();
export type JobRunResult = z.infer<typeof jobRunResultSchema>;

export const jobsSchema = z
  .object({
    _id: zObjectId(),
    name: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(64),
    /** Optional since C-01: the drain slot (below) can be taken before the first run has finished. */
    lastRunAt: zDate().optional(),
    lastResult: jobRunResultSchema.optional(),
    /** Proposed addition to SCHEMA.md `jobs`: health needs the last *successful* drain (domain-rules §13 monitoring). */
    lastSuccessAt: zDate().optional(),
    // C-01 HTTP drain slot (outbox.ts acquireDrainSlot): one drain at a time, at most one accepted per
    // interval. Operational metadata and counts only.
    lockUntil: zDate().optional(),
    lockOwner: z.string().min(1).max(100).optional(),
    lastAcceptedAt: zDate().optional(),
    accepted: zInt().min(0).optional(),
    skippedLocked: zInt().min(0).optional(),
    skippedInterval: zInt().min(0).optional(),
    lastSkippedAt: zDate().optional(),
    lastSkipReason: z.enum(["locked", "interval"]).optional(),
  })
  .strict();
export type JobsDoc = z.infer<typeof jobsSchema>;

/** Applied migrations (proposed addition to SCHEMA.md: makes `npm run db:migrate` idempotent and auditable). */
export const migrationsSchema = z
  .object({
    _id: z.string().regex(/^[0-9]{4}-[a-z0-9-]+$/),
    appliedAt: zDate(),
  })
  .strict();
export type MigrationDoc = z.infer<typeof migrationsSchema>;
