// Privacy requests (B10 part b; SCHEMA.md → privacyRequests; domain-rules §1 "privacy requests").
// A signed-in customer can (1) download a copy of their own data and (2) ask the store to delete their
// account. Both need a fresh proof of identity (password, or a sign-in within the last 15 minutes for
// accounts without a password). Every request is recorded here and in the audit log.
//
// What this does NOT do: it never erases anything by itself. Orders, returns and refunds are the
// store's financial record, and how long they must be kept is an owner/legal decision [L] that has
// not been made. A deletion request is recorded as "received" for the store to handle; the page says
// exactly that and promises nothing more. Relative `.ts` imports keep this module usable by scripts.
import { randomUUID } from "node:crypto";
import { ObjectId, type Db, type Document } from "mongodb";
import { z } from "zod";
import { zDate, zObjectId } from "../../db/bson-zod.ts";
import { isDuplicateKey } from "../catalogue/common.ts";
import { ADDRESSES, ORDERS } from "../orders/schema.ts";
import { RETURNS } from "../fulfilment/schema.ts";
import { REVIEWS } from "../reviews/schema.ts";
import { CONVERSATIONS, MESSAGES } from "../messaging/schema.ts";
import { REWARD_LEDGER } from "../rewards/schema.ts";
import { CARTS, COUPON_REDEMPTIONS } from "../pricing/schema.ts";
import { PUSH_SUBSCRIPTIONS } from "../notifications/schema.ts";
import { recordAudit } from "../platform/audit.ts";
import { AUTH_COLLECTIONS } from "./schema.ts";

export const PRIVACY_REQUESTS = "privacyRequests";
/** A prepared export can be downloaded once, within this window. */
export const EXPORT_WINDOW_MS = 10 * 60_000;
/** Accounts without a password prove identity by having signed in this recently (Better Auth freshAge). */
export const FRESH_SIGN_IN_MS = 15 * 60_000;
export const EXPORT_FORMAT_VERSION = 1;

export const privacyRequestSchema = z
  .object({
    _id: zObjectId(),
    userId: z.string().min(1).max(100),
    kind: z.enum(["export", "deletion"]),
    /**
     * export: ready (link issued) → completed (downloaded once). An unused link simply expires.
     * deletion: received → cancelled (by the customer). Completing a deletion waits for the
     * owner's retention rules [L]; no code path sets it yet.
     */
    status: z.enum(["ready", "completed", "received", "cancelled"]),
    /** Single-use download handle for exports (random, never the database id). */
    token: z.string().uuid().optional(),
    expiresAt: zDate().optional(),
    completedAt: zDate().optional(),
    cancelledAt: zDate().optional(),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type PrivacyRequestDoc = z.infer<typeof privacyRequestSchema>;

export type ReauthResult = "ok" | "wrong_password" | "password_required" | "sign_in_again";

/**
 * Fresh proof of identity for a privacy request. With a password on the account, the password must
 * match. Without one (Google-only), the session must have been created within FRESH_SIGN_IN_MS.
 * `verify` is Better Auth's password check (ctx.password.verify), injected so tests need no auth.
 */
export async function reauthenticate(
  db: Db,
  input: { userId: string; password: string; sessionCreatedAt: Date; now?: Date },
  verify: (args: { hash: string; password: string }) => Promise<boolean>,
): Promise<ReauthResult> {
  const ids: unknown[] = [input.userId];
  if (ObjectId.isValid(input.userId)) ids.push(new ObjectId(input.userId));
  const account = await db.collection(AUTH_COLLECTIONS.account).findOne({ userId: { $in: ids }, providerId: "credential" }, { projection: { password: 1 } });
  const hash = typeof account?.password === "string" ? account.password : null;
  if (hash) {
    if (!input.password) return "password_required";
    return (await verify({ hash, password: input.password.slice(0, 200) })) ? "ok" : "wrong_password";
  }
  const now = (input.now ?? new Date()).getTime();
  return now - input.sessionCreatedAt.getTime() <= FRESH_SIGN_IN_MS ? "ok" : "sign_in_again";
}

const requests = (db: Db) => db.collection<PrivacyRequestDoc>(PRIVACY_REQUESTS);
const customerActor = (userId: string) => ({ id: userId, role: "customer" });

/** Issues a single-use export link for this customer. Older unused links are left to expire. */
export async function prepareExport(db: Db, userId: string, options: { ip?: string | null; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const doc: PrivacyRequestDoc = {
    _id: new ObjectId(),
    userId,
    kind: "export",
    status: "ready",
    token: randomUUID(),
    expiresAt: new Date(now.getTime() + EXPORT_WINDOW_MS),
    createdAt: now,
    updatedAt: now,
  };
  await requests(db).insertOne(doc);
  await recordAudit(db, { actor: customerActor(userId), action: "privacy.export_prepared", target: { type: "user", id: userId }, ip: options.ip ?? null }, { now });
  return { token: doc.token!, expiresAt: doc.expiresAt! };
}

/**
 * Claims an export link: only its owner, only once, only before it expires. Atomic, so two
 * concurrent downloads of the same link cannot both succeed.
 */
export async function claimExport(db: Db, userId: string, token: string, options: { ip?: string | null; now?: Date } = {}): Promise<boolean> {
  if (!z.string().uuid().safeParse(token).success) return false;
  const now = options.now ?? new Date();
  const claimed = await requests(db).findOneAndUpdate(
    { userId, kind: "export", status: "ready", token, expiresAt: { $gt: now } },
    { $set: { status: "completed", completedAt: now, updatedAt: now }, $unset: { token: "" } },
  );
  if (!claimed) return false;
  await recordAudit(db, { actor: customerActor(userId), action: "privacy.export_downloaded", target: { type: "user", id: userId }, ip: options.ip ?? null }, { now });
  return true;
}

export type DeletionResult = { outcome: "received" } | { outcome: "already_received" };

/**
 * Records a deletion request. A second request while one is open is the same request (idempotent).
 * An upsert, so repeats stay single even before `db:migrate` has created the unique partial index;
 * that index is what makes concurrent first requests single (a losing upsert gets a duplicate key).
 */
export async function requestDeletion(db: Db, userId: string, options: { ip?: string | null; now?: Date } = {}): Promise<DeletionResult> {
  const now = options.now ?? new Date();
  try {
    const res = await requests(db).updateOne(
      { userId, kind: "deletion", status: "received" },
      { $setOnInsert: { _id: new ObjectId(), createdAt: now, updatedAt: now } },
      { upsert: true },
    );
    if (res.upsertedCount === 0) return { outcome: "already_received" };
  } catch (error) {
    if (isDuplicateKey(error)) return { outcome: "already_received" };
    throw error;
  }
  await recordAudit(db, { actor: customerActor(userId), action: "privacy.deletion_requested", target: { type: "user", id: userId }, ip: options.ip ?? null }, { now });
  return { outcome: "received" };
}

/** The customer withdraws their open deletion request. False when there was none. */
export async function cancelDeletion(db: Db, userId: string, options: { ip?: string | null; now?: Date } = {}): Promise<boolean> {
  const now = options.now ?? new Date();
  const res = await requests(db).updateOne({ userId, kind: "deletion", status: "received" }, { $set: { status: "cancelled", cancelledAt: now, updatedAt: now } });
  if (res.modifiedCount !== 1) return false;
  await recordAudit(db, { actor: customerActor(userId), action: "privacy.deletion_cancelled", target: { type: "user", id: userId }, ip: options.ip ?? null }, { now });
  return true;
}

export async function customerPrivacyRequests(db: Db, userId: string) {
  return requests(db).find({ userId }, { projection: { token: 0 } }).sort({ createdAt: -1 }).limit(20).toArray();
}

export async function openDeletionRequest(db: Db, userId: string) {
  return requests(db).findOne({ userId, kind: "deletion", status: "received" }, { projection: { token: 0 } });
}

/** Open deletion requests, oldest first, for the store (customers.read). */
export async function openDeletionRequests(db: Db, limit = 50) {
  return requests(db).find({ kind: "deletion", status: "received" }, { projection: { token: 0 } }).sort({ createdAt: 1 }).limit(limit).toArray();
}

// ---- export assembly -------------------------------------------------------------------------

/**
 * Fields never exported, at any depth: credentials and tokens, push keys, internal concurrency and
 * idempotency keys, and staff identities (who on the staff did something is the store's record, not
 * the customer's data; the action itself is kept).
 */
const DROP = new Set(["password", "token", "secret", "backupCodes", "keys", "accessToken", "refreshToken", "idToken", "checkoutKey", "clientKey", "version", "by", "authorId", "actor", "inspection", "userId"]);

/** Plain JSON: ObjectIds and dates as strings, denied keys removed. */
export function exportValue(value: unknown): unknown {
  if (value instanceof ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(exportValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROP.has(k) || v === undefined) continue;
      out[k === "_id" ? "id" : k] = exportValue(v);
    }
    return out;
  }
  return value;
}

/** Everything the store holds that belongs to this customer, as plain JSON. Ownership by userId only. */
export async function buildExport(db: Db, userId: string, now = new Date()) {
  const ids: unknown[] = [userId];
  if (ObjectId.isValid(userId)) ids.push(new ObjectId(userId));
  const own = (name: string, sort: Document = { createdAt: 1 }) => db.collection(name).find({ userId }).sort(sort).limit(5000).toArray();
  const user = await db.collection(AUTH_COLLECTIONS.user).findOne(
    { _id: { $in: ids } as never },
    { projection: { name: 1, email: 1, emailVerified: 1, phone: 1, locale: 1, image: 1, twoFactorEnabled: 1, createdAt: 1, updatedAt: 1 } },
  );
  if (!user) return null;
  const [accounts, sessions, addresses, orders, returns, reviews, conversations, rewards, coupons, carts, push, privacy] = await Promise.all([
    db.collection(AUTH_COLLECTIONS.account).find({ userId: { $in: ids } }, { projection: { _id: 0, providerId: 1, createdAt: 1, updatedAt: 1 } }).toArray(),
    db.collection(AUTH_COLLECTIONS.session).find({ userId: { $in: ids } }, { projection: { _id: 0, createdAt: 1, updatedAt: 1, expiresAt: 1, userAgent: 1, ipAddress: 1 } }).toArray(),
    own(ADDRESSES),
    own(ORDERS, { placedAt: 1 }),
    own(RETURNS),
    own(REVIEWS),
    own(CONVERSATIONS),
    own(REWARD_LEDGER),
    own(COUPON_REDEMPTIONS),
    own(CARTS),
    db.collection(PUSH_SUBSCRIPTIONS).find({ userId }, { projection: { _id: 0, topics: 1, consentAt: 1, consentSource: 1, locale: 1, createdAt: 1, updatedAt: 1 } }).toArray(),
    db.collection(PRIVACY_REQUESTS).find({ userId }, { projection: { token: 0 } }).sort({ createdAt: 1 }).toArray(),
  ]);
  const messages = conversations.length
    ? await db
        .collection(MESSAGES)
        .find({ conversationId: { $in: conversations.map((c) => c._id) } })
        .sort({ createdAt: 1 })
        .limit(10_000)
        .toArray()
    : [];
  return {
    format: "horekbazar-account-export",
    version: EXPORT_FORMAT_VERSION,
    generatedAt: now.toISOString(),
    account: exportValue({ ...user, signInMethods: accounts.map((a) => a.providerId) }),
    sessions: exportValue(sessions),
    addresses: exportValue(addresses),
    orders: exportValue(orders),
    returns: exportValue(returns),
    reviews: exportValue(reviews),
    conversations: exportValue(conversations),
    messages: exportValue(messages),
    rewards: exportValue(rewards),
    couponRedemptions: exportValue(coupons),
    carts: exportValue(carts),
    browserNotifications: exportValue(push),
    privacyRequests: exportValue(privacy),
  };
}
