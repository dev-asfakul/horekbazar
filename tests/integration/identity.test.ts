// B3 identity against a real replica set: Better Auth registration with e-mail verification through the
// outbox, privilege fields not settable at sign-up, the first-owner claim race, last-owner protection,
// session revocation on role change, TOTP enrolment, step-up, and owner recovery. Never a real database.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createAuth, type Auth } from "@/lib/modules/identity/auth";
import { sessionTokenFromSetCookie } from "@/lib/modules/identity/cookies";
import { decideAccess, loadPrincipal, type Principal } from "@/lib/modules/identity/principal";
import { AUTH_COLLECTIONS, INSTALLATION } from "@/lib/modules/identity/schema";
import { claimInstallation, completeInstallation, listStaff, markSecondFactor, markStepUp, ownerExists, recoverOwner, releaseInstallation, setStaffRole, StaffRuleError } from "@/lib/modules/identity/staff";
import { OUTBOX } from "@/lib/modules/platform/outbox";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let auth: Auth;
let cleanup: () => Promise<void>;
const PASSWORD = "correct horse battery";

beforeAll(async () => {
  delete process.env.RESEND_API_KEY; // e-mails stay in the outbox; the test reads links from there
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  auth = createAuth({ db, client, secret: "t".repeat(40), baseURL: "http://localhost:3000", production: false });
});
afterAll(async () => cleanup());

const users = () => db.collection(AUTH_COLLECTIONS.user);

async function lastEmailUrl(to: string, template: string): Promise<string> {
  const job = await db.collection(OUTBOX).findOne({ "payload.to": to, "payload.template": template }, { sort: { createdAt: -1 } });
  expect(job, `${template} e-mail for ${to}`).not.toBeNull();
  return String(job!.payload.url);
}

function sessionCookie(headers: Headers): string {
  const cookies = headers.getSetCookie().map((c) => c.split(";")[0]!);
  return cookies.join("; ");
}

async function register(email: string, name = "Test"): Promise<string> {
  await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
  const url = new URL(await lastEmailUrl(email, "verify-email"));
  await auth.api.verifyEmail({ query: { token: url.searchParams.get("token")! } });
  const user = await users().findOne({ email });
  return String(user!._id);
}

async function signIn(email: string): Promise<{ cookie: string; token: string }> {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const token = (res.response as { token?: string }).token;
  expect(token, "session token").toBeTruthy();
  return { cookie: sessionCookie(res.headers), token: token! };
}

async function principalOf(token: string): Promise<Principal> {
  const p = await loadPrincipal(db, token);
  expect(p).not.toBeNull();
  return p!;
}

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for the test's "authenticator app".
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secretBase32: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = h[h.length - 1]! & 0xf;
  const code = ((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

describe("registration and sign-in", () => {
  it("requires e-mail verification before sign-in; the link arrives through the outbox", async () => {
    const email = "customer1@example.com";
    await auth.api.signUpEmail({ body: { name: "C", email, password: PASSWORD } });
    const blocked = await auth.api.signInEmail({ body: { email, password: PASSWORD } }).catch((e: unknown) => e);
    expect((blocked as { body?: { code?: string } }).body?.code).toBe("EMAIL_NOT_VERIFIED");
    const url = new URL(await lastEmailUrl(email, "verify-email"));
    expect(url.origin).toBe("http://localhost:3000");
    expect(url.pathname).toBe("/verify-email");
    await auth.api.verifyEmail({ query: { token: url.searchParams.get("token")! } });
    const { token } = await signIn(email);
    const p = await principalOf(token);
    expect(p.user.emailVerified).toBe(true);
    expect(p.role).toBeNull();
    expect(decideAccess(p, "orders.read").result).toBe("denied");
  });

  it("ignores client-sent privilege fields at sign-up (staffRoleKey, phone)", async () => {
    const email = "sneaky@example.com";
    const attempt = await auth.api
      .signUpEmail({ body: { name: "S", email, password: PASSWORD, staffRoleKey: "owner", phone: "01712345678" } as never })
      .catch((e: unknown) => e);
    const user = await users().findOne({ email });
    if (user) {
      expect(user.staffRoleKey).toBeUndefined();
      expect(user.phone).toBeUndefined();
    } else {
      expect(attempt).toBeInstanceOf(Error); // rejected outright is also acceptable
    }
  });

  it("stores passwords hashed, never in plain text", async () => {
    const id = String((await users().findOne({ email: "customer1@example.com" }))!._id);
    const account = await db.collection(AUTH_COLLECTIONS.account).findOne({ providerId: "credential", userId: { $in: [id, (await users().findOne({ email: "customer1@example.com" }))!._id] } });
    expect(account?.password).toBeTruthy();
    expect(String(account!.password)).not.toContain(PASSWORD);
  });
});

describe("first-owner claim (D23)", () => {
  it("exactly one of many concurrent claims wins", async () => {
    expect(await ownerExists(db)).toBe(false);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => claimInstallation(db, `pending-${i}`)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = `pending-${results.indexOf(true)}`;
    await releaseInstallation(db, winner);
    expect(await db.collection(INSTALLATION).countDocuments()).toBe(0);
  });

  it("completes for the registered owner and then refuses further claims", async () => {
    expect(await claimInstallation(db, "pending-owner")).toBe(true);
    const ownerId = await register("owner@example.com", "Owner");
    await completeInstallation(db, "pending-owner", ownerId);
    expect(await ownerExists(db)).toBe(true);
    expect(await claimInstallation(db, "pending-late")).toBe(false);
    expect(await db.collection("auditLog").countDocuments({ action: "identity.owner_claimed" })).toBe(1);
  });
});

describe("owner: 2FA enrolment, step-up and staff management", () => {
  let ownerCookie = "";
  let ownerToken = "";
  let secret = "";

  it("an owner without 2FA can only enrol", async () => {
    ({ cookie: ownerCookie, token: ownerToken } = await signIn("owner@example.com"));
    const p = await principalOf(ownerToken);
    expect(decideAccess(p, "staff.manage").result).toBe("two_factor_enrolment");
  });

  it("enrols TOTP with a code from the authenticator, rotating the session", async () => {
    const enabled = await auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: new Headers({ cookie: ownerCookie }) });
    if (enabled.method !== "totp") throw new Error("expected TOTP enrolment");
    expect(enabled.backupCodes).toHaveLength(10);
    secret = new URL(enabled.totpURI).searchParams.get("secret")!;
    const wrong = await auth.api.verifyTOTP({ body: { code: "000000" === totp(secret) ? "111111" : "000000" }, headers: new Headers({ cookie: ownerCookie }) }).catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(Error);
    const res = await auth.api.verifyTOTP({ body: { code: totp(secret) }, headers: new Headers({ cookie: ownerCookie }), returnHeaders: true });
    // The body still names the old session; the rotated one is in Set-Cookie (see confirmTwoFactorAction).
    const oldToken = ownerToken;
    expect((res.response as { token?: string }).token).toBe(oldToken);
    ownerToken = sessionTokenFromSetCookie(res.headers)!;
    expect(ownerToken).toBeTruthy();
    expect(ownerToken).not.toBe(oldToken);
    expect(await loadPrincipal(db, oldToken)).toBeNull();
    ownerCookie = sessionCookie(res.headers);
    // A session that has not passed the code (as after a Google sign-in) gets only the code check.
    expect(decideAccess(await principalOf(ownerToken), "staff.manage").result).toBe("second_factor");
    await markSecondFactor(db, ownerToken); // what confirmTwoFactorAction / verifyTwoFactorAction record
    const p = await principalOf(ownerToken);
    expect(p.user.twoFactorEnabled).toBe(true);
    expect(decideAccess(p, "staff.manage").result).toBe("allowed");
    expect(decideAccess(p, "staff.manage", { mutation: true }).result).toBe("step_up");
  });

  it("sign-in now asks for the second factor before a session exists", async () => {
    const res = await auth.api.signInEmail({ body: { email: "owner@example.com", password: PASSWORD } });
    expect((res as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    expect((res as { token?: string }).token).toBeUndefined();
  });

  it("step-up opens staff mutations for 10 minutes", async () => {
    await markStepUp(db, ownerToken);
    const p = await principalOf(ownerToken);
    expect(decideAccess(p, "staff.manage", { mutation: true }).result).toBe("allowed");
    expect(decideAccess(p, "staff.manage", { mutation: true, now: new Date(Date.now() + 11 * 60_000) }).result).toBe("step_up");
  });

  it("assigning a role revokes the target's sessions and is audited", async () => {
    const owner = await principalOf(ownerToken);
    const staffId = await register("staff@example.com", "Staff");
    const { token: staffToken } = await signIn("staff@example.com");
    await setStaffRole(db, client, owner, { email: "staff@example.com", roleKey: "catalogue_editor" });
    expect(await loadPrincipal(db, staffToken)).toBeNull();
    const { token: again } = await signIn("staff@example.com");
    const staff = await principalOf(again);
    expect(staff.role?.key).toBe("catalogue_editor");
    expect(decideAccess(staff, "catalogue.write").result).toBe("allowed");
    expect(decideAccess(staff, "staff.manage").result).toBe("denied");
    expect(await db.collection("auditLog").countDocuments({ action: "staff.role_set", "target.id": staffId })).toBe(1);
    expect((await listStaff(db)).map((s) => s.email).sort()).toEqual(["owner@example.com", "staff@example.com"]);
  });

  it("refuses unverified accounts and unknown roles", async () => {
    const owner = await principalOf(ownerToken);
    await auth.api.signUpEmail({ body: { name: "U", email: "unverified@example.com", password: PASSWORD } });
    await expect(setStaffRole(db, client, owner, { email: "unverified@example.com", roleKey: "support_agent" })).rejects.toThrow(StaffRuleError);
    await expect(setStaffRole(db, client, owner, { email: "staff@example.com", roleKey: "no_such_role" })).rejects.toThrow(StaffRuleError);
  });

  it("protects the last owner, including two owners demoting each other at once", async () => {
    const owner = await principalOf(ownerToken);
    const ownerId = owner.user.id;
    await expect(setStaffRole(db, client, owner, { userId: ownerId, roleKey: null })).rejects.toMatchObject({ code: "last_owner" });

    const secondId = (await users().findOne({ email: "staff@example.com" }))!._id;
    await setStaffRole(db, client, owner, { userId: String(secondId), roleKey: "owner" });
    const actorB = { ...owner, user: { ...owner.user, id: String(secondId) } };
    const results = await Promise.allSettled([
      setStaffRole(db, client, owner, { userId: String(secondId), roleKey: null }),
      setStaffRole(db, client, actorB, { userId: ownerId, roleKey: null }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await users().countDocuments({ staffRoleKey: "owner" })).toBe(1);
  });

  it("owner recovery clears 2FA and every session, and is audited", async () => {
    const remaining = (await users().findOne({ staffRoleKey: "owner" }))!;
    expect(await recoverOwner(db, "customer1@example.com")).toEqual({ error: "not_owner" });
    expect(await recoverOwner(db, "nobody@example.com")).toEqual({ error: "user_not_found" });
    const result = await recoverOwner(db, String(remaining.email));
    expect("userId" in result).toBe(true);
    const after = (await users().findOne({ _id: remaining._id }))!;
    expect(after.twoFactorEnabled).toBe(false);
    expect(await db.collection(AUTH_COLLECTIONS.session).countDocuments({ userId: { $in: [String(remaining._id), remaining._id] } })).toBe(0);
    expect(await db.collection("auditLog").countDocuments({ action: "identity.owner_recovered" })).toBe(1);
  });
});
