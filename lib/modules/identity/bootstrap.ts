// First Owner from deployment credentials (owner decision 2026-10-22: "the admin email and password
// will be stored in environment credentials"). Same path as /admin/setup: one installation claim
// (unique _id), Better Auth sign-up (its scrypt hash; the password is never logged or stored
// elsewhere), the Owner role, an audit entry. The deployer controls the environment, so the address
// counts as verified (as D23 option b: a server-side command run by the deployer, audited).
// 2FA is still enforced at the Owner's first staff sign-in.
//
// An existing Owner is never replaced. With `syncPassword` (explicit flag on the command) the
// password of the Owner whose email matches OWNER_EMAIL is set to OWNER_PASSWORD and every session
// is signed out; anything else is refused.
import { randomBytes } from "node:crypto";
import type { Db, MongoClient } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { createAuth, PASSWORD_MAX, PASSWORD_MIN } from "./auth.ts";
import { OWNER_ROLE_KEY } from "./capabilities.ts";
import { AUTH_COLLECTIONS } from "./schema.ts";
import { claimInstallation, completeInstallation, ownerExists, releaseInstallation, revokeSessions } from "./staff.ts";

export type BootstrapResult =
  | { result: "created"; userId: string }
  | { result: "exists" }
  | { result: "password_synced"; userId: string }
  | { result: "skipped"; reason: "not_configured" }
  | { result: "refused"; reason: "invalid_email" | "weak_password" | "email_taken" | "other_owner" | "not_owner" };

/** Reads OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME, AUTH_SECRET, NEXT_PUBLIC_SITE_URL. */
export type BootstrapEnv = Record<string, string | undefined>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bootstrapOwner(db: Db, client: MongoClient, env: BootstrapEnv, options: { syncPassword?: boolean } = {}): Promise<BootstrapResult> {
  const email = env.OWNER_EMAIL?.trim().toLowerCase();
  const password = env.OWNER_PASSWORD;
  if (!email || !password) return { result: "skipped", reason: "not_configured" };
  if (!EMAIL.test(email) || email.length > 254) return { result: "refused", reason: "invalid_email" };
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return { result: "refused", reason: "weak_password" };
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is not set");
  const auth = createAuth({ db, client, secret, baseURL: env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000", production: false });
  const users = db.collection(AUTH_COLLECTIONS.user);

  if (await ownerExists(db)) {
    const owner = await users.findOne({ email });
    if (!options.syncPassword) return { result: "exists" };
    if (!owner) return { result: "refused", reason: "other_owner" };
    if (owner.staffRoleKey !== OWNER_ROLE_KEY) return { result: "refused", reason: "not_owner" };
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(password);
    const userId = String(owner._id);
    await db.collection(AUTH_COLLECTIONS.account).updateOne({ userId: { $in: [userId, owner._id] }, providerId: "credential" }, { $set: { password: hash, updatedAt: new Date() } });
    await revokeSessions(db, userId);
    await recordAudit(db, { actor: { id: "env", role: "system" }, action: "identity.owner_password_synced", target: { type: "user", id: userId }, ip: null });
    return { result: "password_synced", userId };
  }

  if (await users.findOne({ email }, { projection: { _id: 1 } })) return { result: "refused", reason: "email_taken" };
  const reservation = `pending-${randomBytes(12).toString("hex")}`;
  if (!(await claimInstallation(db, reservation))) return { result: "exists" };
  try {
    const created = await auth.api.signUpEmail({ body: { name: env.OWNER_NAME?.trim() || "Owner", email, password, locale: "bn" } });
    await completeInstallation(db, reservation, created.user.id, null);
    await users.updateOne({ email }, { $set: { emailVerified: true, updatedAt: new Date() } });
    await recordAudit(db, { actor: { id: "env", role: "system" }, action: "identity.owner_bootstrapped", target: { type: "user", id: created.user.id }, after: { verification: "deployer_environment" }, ip: null });
    return { result: "created", userId: created.user.id };
  } catch (error) {
    await releaseInstallation(db, reservation);
    throw error;
  }
}
