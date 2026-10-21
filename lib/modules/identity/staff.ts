// Staff administration and first-owner bootstrap (domain-rules §1; D23). The caller has already
// checked `decideAccess(actor, "staff.manage", { mutation: true })`; these functions re-validate the
// business rules (last Owner, verified target, existing role) and write an audit entry for each change.
import { timingSafeEqual, createHash } from "node:crypto";
import type { Db } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { OWNER_ROLE_KEY } from "./capabilities.ts";
import { idFilter, type Principal } from "./principal.ts";
import { AUTH_COLLECTIONS, INSTALLATION, STAFF_ROLES, type InstallationDoc } from "./schema.ts";
import { queueEmail } from "./mail.ts";

export type StaffError =
  | "user_not_found"
  | "user_not_verified"
  | "role_not_found"
  | "last_owner"
  | "self_target"
  | "not_staff";

export class StaffRuleError extends Error {
  readonly code: StaffError;
  constructor(code: StaffError) {
    super(code);
    this.code = code;
    this.name = "StaffRuleError";
  }
}

const users = (db: Db) => db.collection(AUTH_COLLECTIONS.user);

export async function ownerExists(db: Db): Promise<boolean> {
  const [installation, owner] = await Promise.all([
    db.collection<InstallationDoc>(INSTALLATION).findOne({ _id: "installation" }),
    users(db).findOne({ staffRoleKey: OWNER_ROLE_KEY }, { projection: { _id: 1 } }),
  ]);
  return Boolean(installation || owner);
}

/** Deletes every session of a user, optionally keeping one (the caller's current session). */
export async function revokeSessions(db: Db, userId: string, keepToken?: string) {
  const filter: Record<string, unknown> = { userId: idFilter(userId) };
  if (keepToken) filter.token = { $ne: keepToken };
  const r = await db.collection(AUTH_COLLECTIONS.session).deleteMany(filter);
  return r.deletedCount;
}

/** A fresh code check: opens step-up for 10 minutes and marks the session as second-factor verified. */
export async function markStepUp(db: Db, sessionToken: string, now = new Date()) {
  await db.collection(AUTH_COLLECTIONS.session).updateOne({ token: sessionToken }, { $set: { stepUpAt: now, secondFactorAt: now } });
}

/** The session passed a second factor at sign-in (no step-up window). */
export async function markSecondFactor(db: Db, sessionToken: string, now = new Date()) {
  await db.collection(AUTH_COLLECTIONS.session).updateOne({ token: sessionToken }, { $set: { secondFactorAt: now } });
}

const actorOf = (p: Principal) => ({ id: p.user.id, role: p.user.staffRoleKey ?? "none" });

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  roleKey: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
}

export async function listStaff(db: Db): Promise<StaffMember[]> {
  const docs = await users(db)
    .find({ staffRoleKey: { $type: "string" } }, { projection: { name: 1, email: 1, staffRoleKey: 1, twoFactorEnabled: 1, emailVerified: 1 }, sort: { email: 1 }, limit: 500 })
    .toArray();
  return docs.map((d) => ({
    id: String(d._id),
    name: String(d.name ?? ""),
    email: String(d.email),
    roleKey: String(d.staffRoleKey),
    twoFactorEnabled: d.twoFactorEnabled === true,
    emailVerified: d.emailVerified === true,
  }));
}

/**
 * Changes (or removes, with roleKey null) a user's staff role inside a transaction. Demoting the last
 * Owner is refused; the installation document's counter makes concurrent Owner changes conflict, so two
 * Owners cannot demote each other at the same time. Every session of the target is revoked.
 */
export async function setStaffRole(
  db: Db,
  client: import("mongodb").MongoClient,
  actor: Principal,
  input: { userId?: string; email?: string; roleKey: string | null; ip?: string | null },
) {
  const target = input.userId
    ? await users(db).findOne({ _id: idFilter(input.userId) as never })
    : await users(db).findOne({ email: String(input.email ?? "").trim().toLowerCase() });
  if (!target) throw new StaffRuleError("user_not_found");
  if (target.emailVerified !== true) throw new StaffRuleError("user_not_verified");
  const targetId = String(target._id);
  const before = typeof target.staffRoleKey === "string" ? target.staffRoleKey : null;
  if (input.roleKey === null && before === null) throw new StaffRuleError("not_staff");
  let roleName: string | null = null;
  if (input.roleKey !== null) {
    const role = await db.collection(STAFF_ROLES).findOne({ key: input.roleKey });
    if (!role) throw new StaffRuleError("role_not_found");
    roleName = (target.locale === "en" ? role.name?.en : role.name?.bn) ?? role.name?.bn ?? input.roleKey;
  }
  if (before === input.roleKey) return { changed: false };

  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      if (before === OWNER_ROLE_KEY) {
        await db.collection<InstallationDoc>(INSTALLATION).updateOne({ _id: "installation" }, { $inc: { ownerChangeSeq: 1 } }, { session });
        const owners = await users(db).countDocuments({ staffRoleKey: OWNER_ROLE_KEY, emailVerified: true }, { session });
        if (owners <= 1) throw new StaffRuleError("last_owner");
      }
      await users(db).updateOne(
        { _id: target._id },
        input.roleKey === null ? { $unset: { staffRoleKey: "" }, $set: { updatedAt: new Date() } } : { $set: { staffRoleKey: input.roleKey, updatedAt: new Date() } },
        { session },
      );
      await recordAudit(
        db,
        { actor: actorOf(actor), action: input.roleKey === null ? "staff.removed" : "staff.role_set", target: { type: "user", id: targetId }, before: { role: before }, after: { role: input.roleKey }, ip: input.ip ?? null },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  await revokeSessions(db, targetId);
  if (input.roleKey !== null) {
    await queueEmail(db, {
      template: "staff-role-changed",
      to: String(target.email),
      locale: target.locale === "en" ? "en" : "bn",
      name: String(target.name ?? ""),
      role: roleName ?? input.roleKey,
    }, { aggregateId: `role-${targetId}` }).catch(() => "queued");
  }
  return { changed: true };
}

/** Clears another staff member's 2FA (lost device). They must enrol again before using admin. */
export async function resetStaffTwoFactor(db: Db, actor: Principal, userId: string, ip?: string | null) {
  if (userId === actor.user.id) throw new StaffRuleError("self_target");
  const target = await users(db).findOne({ _id: idFilter(userId) as never });
  if (!target) throw new StaffRuleError("user_not_found");
  if (typeof target.staffRoleKey !== "string") throw new StaffRuleError("not_staff");
  await db.collection(AUTH_COLLECTIONS.twoFactor).deleteMany({ userId: idFilter(userId) });
  await users(db).updateOne({ _id: target._id }, { $set: { twoFactorEnabled: false, updatedAt: new Date() } });
  await revokeSessions(db, userId);
  await recordAudit(db, { actor: actorOf(actor), action: "staff.two_factor_reset", target: { type: "user", id: userId }, ip: ip ?? null });
}

// ── First-owner bootstrap (D23) ──────────────────────────────────────────────────────────────

export type SetupBlocker = "database" | "auth_secret" | "email" | "setup_token" | "already_claimed";

/** Constant-time comparison of the deployer-held setup token. */
export function setupTokenMatches(expected: string | undefined, given: string): boolean {
  if (!expected || expected.length < 16) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

/**
 * Reserves the single installation document for a new Owner. Exactly one concurrent caller wins
 * (unique _id). The winner creates the account; if that fails the reservation is released.
 */
export async function claimInstallation(db: Db, reservation: string, now = new Date()): Promise<boolean> {
  try {
    await db.collection<InstallationDoc>(INSTALLATION).insertOne({ _id: "installation", ownerUserId: reservation, ownerClaimedAt: now, verification: "email" });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

export async function releaseInstallation(db: Db, reservation: string) {
  await db.collection<InstallationDoc>(INSTALLATION).deleteOne({ _id: "installation", ownerUserId: reservation });
}

export async function completeInstallation(db: Db, reservation: string, userId: string, ip?: string | null) {
  await db.collection<InstallationDoc>(INSTALLATION).updateOne({ _id: "installation", ownerUserId: reservation }, { $set: { ownerUserId: userId } });
  await users(db).updateOne({ _id: idFilter(userId) as never }, { $set: { staffRoleKey: OWNER_ROLE_KEY } });
  await recordAudit(db, { actor: { id: "setup", role: "system" }, action: "identity.owner_claimed", target: { type: "user", id: userId }, after: { role: OWNER_ROLE_KEY, verification: "email" }, ip: ip ?? null });
}

// ── Owner recovery (server command only: npm run admin:recover-owner) ────────────────────────

/**
 * For an Owner who lost their authenticator and backup codes. Needs database access (the deployer),
 * so it is never reachable from the web. Clears 2FA and signs the Owner out everywhere; the password
 * is not touched (use "forgot password" for that). The Owner must enrol 2FA again at next sign-in.
 */
export async function recoverOwner(db: Db, email: string): Promise<{ userId: string } | { error: "user_not_found" | "not_owner" }> {
  const target = await users(db).findOne({ email: email.trim().toLowerCase() });
  if (!target) return { error: "user_not_found" };
  if (target.staffRoleKey !== OWNER_ROLE_KEY) return { error: "not_owner" };
  const userId = String(target._id);
  await db.collection(AUTH_COLLECTIONS.twoFactor).deleteMany({ userId: idFilter(userId) });
  await users(db).updateOne({ _id: target._id }, { $set: { twoFactorEnabled: false, updatedAt: new Date() } });
  await revokeSessions(db, userId);
  await recordAudit(db, { actor: { id: "cli", role: "system" }, action: "identity.owner_recovered", target: { type: "user", id: userId }, ip: null });
  return { userId };
}
