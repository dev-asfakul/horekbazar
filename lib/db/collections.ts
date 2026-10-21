// Collection registry: one entry per persisted collection, with its Zod schema, indexes and the
// rules its validator cannot express (enforced in the service layer instead). Modules add their
// collections here as their phase lands (B3 identity, B4 catalogue and settings, …).
import type { IndexDescription } from "mongodb";
import type { z } from "zod";
import { auditLogSchema, jobsSchema, migrationsSchema, outboxSchema } from "../modules/platform/schema.ts";

export interface CollectionSpec {
  name: string;
  module: string;
  schema: z.ZodType;
  indexes: IndexDescription[];
  /** Rules JSON Schema cannot express; the named service enforces them. Listed in the generator output. */
  serviceEnforced: string[];
}

export const collections: CollectionSpec[] = [
  {
    name: "outbox",
    module: "platform",
    schema: outboxSchema,
    indexes: [
      { key: { idempotencyKey: 1 }, name: "idempotencyKey_unique", unique: true },
      { key: { status: 1, availableAt: 1 }, name: "status_availableAt" },
    ],
    serviceEnforced: ["leaseUntil and leaseOwner are set only while status is processing (outbox.ts)"],
  },
  {
    name: "auditLog",
    module: "platform",
    schema: auditLogSchema,
    indexes: [
      { key: { at: -1 }, name: "at_desc" },
      { key: { "target.type": 1, "target.id": 1 }, name: "target" },
    ],
    serviceEnforced: ["before/after are redacted diffs and ip is truncated before insert (audit.ts)"],
  },
  {
    name: "jobs",
    module: "platform",
    schema: jobsSchema,
    indexes: [{ key: { name: 1 }, name: "name_unique", unique: true }],
    serviceEnforced: [],
  },
  {
    name: "migrations",
    module: "platform",
    schema: migrationsSchema,
    indexes: [],
    serviceEnforced: [],
  },
];
