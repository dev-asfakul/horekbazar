// Collection registry: one entry per persisted collection, with its Zod schema, indexes and the
// rules its validator cannot express (enforced in the service layer instead). Modules add their
// collections here as their phase lands (B3 identity, B4 catalogue and settings, …).
import type { IndexDescription } from "mongodb";
import type { z } from "zod";
import { auditLogSchema, jobsSchema, migrationsSchema, outboxSchema } from "../modules/platform/schema.ts";
import { AUTH_COLLECTIONS, INSTALLATION, installationSchema, STAFF_ROLES, staffRoleSchema } from "../modules/identity/schema.ts";

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
  {
    name: STAFF_ROLES,
    module: "identity",
    schema: staffRoleSchema,
    indexes: [{ key: { key: 1 }, name: "key_unique", unique: true }],
    serviceEnforced: ["built-in roles cannot be deleted; the Owner role always resolves to every capability (identity/roles.ts)"],
  },
  {
    name: INSTALLATION,
    module: "identity",
    schema: installationSchema,
    indexes: [],
    serviceEnforced: ["written once by the first-owner claim; the unique _id serialises concurrent claims (identity/staff.ts)"],
  },
];

/**
 * Collections whose documents a library owns (Better Auth's MongoDB adapter). They get indexes but no
 * HorekBazar validator, because the adapter decides their shape (SCHEMA.md → Identity: "per adapter").
 * The adapter creates no indexes itself, so uniqueness of e-mail and session tokens is enforced here.
 */
export interface AdapterCollectionSpec {
  name: string;
  module: string;
  indexes: IndexDescription[];
}

export const adapterCollections: AdapterCollectionSpec[] = [
  {
    name: AUTH_COLLECTIONS.user,
    module: "identity (Better Auth)",
    indexes: [
      { key: { email: 1 }, name: "email_unique", unique: true },
      { key: { staffRoleKey: 1 }, name: "staffRoleKey", partialFilterExpression: { staffRoleKey: { $type: "string" } } },
    ],
  },
  {
    name: AUTH_COLLECTIONS.session,
    module: "identity (Better Auth)",
    indexes: [
      { key: { token: 1 }, name: "token_unique", unique: true },
      { key: { userId: 1 }, name: "userId" },
      { key: { expiresAt: 1 }, name: "expiresAt_ttl", expireAfterSeconds: 0 },
    ],
  },
  {
    name: AUTH_COLLECTIONS.account,
    module: "identity (Better Auth)",
    indexes: [
      { key: { userId: 1 }, name: "userId" },
      { key: { providerId: 1, accountId: 1 }, name: "provider_account_unique", unique: true },
    ],
  },
  {
    name: AUTH_COLLECTIONS.verification,
    module: "identity (Better Auth)",
    indexes: [
      { key: { identifier: 1 }, name: "identifier" },
      { key: { expiresAt: 1 }, name: "expiresAt_ttl", expireAfterSeconds: 0 },
    ],
  },
  {
    name: AUTH_COLLECTIONS.twoFactor,
    module: "identity (Better Auth)",
    indexes: [{ key: { userId: 1 }, name: "userId_unique", unique: true }],
  },
];
