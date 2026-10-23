// B10 part b on a disposable replica set, with the real validators and indexes (runMigrations):
// fresh proof of identity, single-use owner-only export links (also under concurrency), idempotent
// deletion requests (also under concurrency), withdrawal, and an export that holds only the
// customer's own data and no credentials, tokens, push keys or staff identities.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { collections } from "@/lib/db/collections";
import { runMigrations } from "@/lib/db/migrate";
import { AUDIT_LOG } from "@/lib/modules/platform/audit";
import {
  buildExport,
  cancelDeletion,
  claimExport,
  EXPORT_WINDOW_MS,
  FRESH_SIGN_IN_MS,
  openDeletionRequest,
  prepareExport,
  PRIVACY_REQUESTS,
  reauthenticate,
  requestDeletion,
} from "@/lib/modules/identity/privacy";
import { pendingDeletions } from "@/lib/modules/identity/customers";
import { freshDb } from "./helpers";

let db: Db;
let cleanup: () => Promise<void>;
const alice = new ObjectId();
const bob = new ObjectId();
const google = new ObjectId();
const A = String(alice);
const B = String(bob);

beforeAll(async () => {
  ({ db, cleanup } = await freshDb());
  // Only this collection's validator and indexes: the fixtures below are minimal on purpose.
  await runMigrations(db, { collections: collections.filter((c) => c.name === PRIVACY_REQUESTS), adapterCollections: [], migrations: [] });
  const now = new Date();
  await db.collection("user").insertMany([
    { _id: alice, name: "আলিয়া", email: "alice@example.test", emailVerified: true, phone: "+8801711000001", createdAt: now, updatedAt: now },
    { _id: bob, name: "Bob", email: "bob@example.test", emailVerified: true, createdAt: now, updatedAt: now },
    { _id: google, name: "G", email: "g@example.test", emailVerified: true, createdAt: now, updatedAt: now },
  ]);
  await db.collection("account").insertMany([
    { userId: alice, providerId: "credential", accountId: A, password: await hashPassword("alice-correct-password"), createdAt: now, updatedAt: now },
    { userId: bob, providerId: "credential", accountId: B, password: await hashPassword("bob-correct-password"), createdAt: now, updatedAt: now },
    { userId: google, providerId: "google", accountId: "g-1", accessToken: "google-access-token-secret", createdAt: now, updatedAt: now },
  ]);
  await db.collection("session").insertOne({ userId: alice, token: "alice-session-token-secret", createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 86400_000), userAgent: "UA" });
  await db.collection("pushSubscriptions").insertOne({ userId: A, endpoint: "https://push.example.test/x", keys: { p256dh: "p256dh-key-secret", auth: "auth-key-secret" }, topics: { orders: true, marketing: false }, locale: "bn", createdAt: now, updatedAt: now });
  await db.collection("conversations").insertOne({ _id: new ObjectId(), userId: A, subject: "প্রশ্ন", customerName: "আলিয়া", status: "open", lastFrom: "staff", createdAt: now, updatedAt: now });
  const conv = await db.collection("conversations").findOne({ userId: A });
  await db.collection("messages").insertMany([
    { conversationId: conv!._id, from: "customer", authorId: A, body: "হ্যালো", createdAt: now },
    { conversationId: conv!._id, from: "staff", authorId: "staff-user-id-secret", body: "উত্তর", createdAt: now },
  ]);
  await db.collection("reviews").insertOne({ userId: A, body: "ভালো", reply: { body: "ধন্যবাদ", by: "staff-user-id-secret", at: now }, createdAt: now });
  await db.collection("reviews").insertOne({ userId: B, body: "bob's review", createdAt: now });
}, 60_000);

afterAll(async () => {
  await cleanup?.();
});

const verify = (args: { hash: string; password: string }) => verifyPassword(args);

describe("fresh proof of identity", () => {
  it("password accounts need the right password", async () => {
    const at = new Date(Date.now() - 24 * 3600_000);
    expect(await reauthenticate(db, { userId: A, password: "alice-correct-password", sessionCreatedAt: at }, verify)).toBe("ok");
    expect(await reauthenticate(db, { userId: A, password: "wrong", sessionCreatedAt: at }, verify)).toBe("wrong_password");
    expect(await reauthenticate(db, { userId: A, password: "", sessionCreatedAt: new Date() }, verify)).toBe("password_required");
    // Another customer's password is wrong for this account.
    expect(await reauthenticate(db, { userId: A, password: "bob-correct-password", sessionCreatedAt: at }, verify)).toBe("wrong_password");
  });
  it("accounts without a password need a sign-in within 15 minutes", async () => {
    const now = new Date();
    expect(await reauthenticate(db, { userId: String(google), password: "", sessionCreatedAt: new Date(now.getTime() - FRESH_SIGN_IN_MS + 1000), now }, verify)).toBe("ok");
    expect(await reauthenticate(db, { userId: String(google), password: "anything", sessionCreatedAt: new Date(now.getTime() - FRESH_SIGN_IN_MS - 1000), now }, verify)).toBe("sign_in_again");
  });
});

describe("export links", () => {
  it("work once, for their owner, before they expire", async () => {
    const { token } = await prepareExport(db, A);
    expect(await claimExport(db, B, token)).toBe(false);
    expect(await claimExport(db, A, "not-a-uuid")).toBe(false);
    expect(await claimExport(db, A, token)).toBe(true);
    expect(await claimExport(db, A, token)).toBe(false);
    const late = await prepareExport(db, A);
    expect(await claimExport(db, A, late.token, { now: new Date(Date.now() + EXPORT_WINDOW_MS + 1000) })).toBe(false);
  });
  it("two concurrent downloads of one link: exactly one succeeds", async () => {
    const { token } = await prepareExport(db, A);
    const results = await Promise.all(Array.from({ length: 6 }, () => claimExport(db, A, token)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("tokens are never stored after use and never returned by reads", async () => {
    const used = await db.collection(PRIVACY_REQUESTS).find({ userId: A, status: "completed" }).toArray();
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((r) => r.token === undefined)).toBe(true);
  });
});

describe("the export", () => {
  it("holds the customer's own data only, without credentials, tokens, push keys or staff ids", async () => {
    const data = await buildExport(db, A);
    const json = JSON.stringify(data);
    expect(data?.account).toMatchObject({ email: "alice@example.test", phone: "+8801711000001", signInMethods: ["credential"] });
    expect(data?.messages).toHaveLength(2);
    expect(data?.reviews).toHaveLength(1);
    expect(data?.browserNotifications).toEqual([expect.objectContaining({ topics: { orders: true, marketing: false } })]);
    for (const secret of ["$argon", "scrypt", "alice-session-token-secret", "p256dh-key-secret", "auth-key-secret", "staff-user-id-secret", "bob", "google-access-token-secret"]) {
      expect(json).not.toContain(secret);
    }
    expect(json).not.toMatch(/"password"|"token"|"keys"|"userId"|"authorId"/);
  });
  it("an unknown account exports nothing", async () => {
    expect(await buildExport(db, String(new ObjectId()))).toBeNull();
  });
});

describe("deletion requests", () => {
  it("are idempotent, also when sent concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => requestDeletion(db, B)));
    expect(results.filter((r) => r.outcome === "received")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "already_received")).toHaveLength(4);
    expect(await db.collection(PRIVACY_REQUESTS).countDocuments({ userId: B, kind: "deletion", status: "received" })).toBe(1);
  });
  it("show to the store, can be withdrawn by their owner only, and a new one can follow", async () => {
    expect((await pendingDeletions(db)).map((d) => d.email)).toEqual(["bob@example.test"]);
    expect(await cancelDeletion(db, A)).toBe(false);
    expect(await cancelDeletion(db, B)).toBe(true);
    expect(await openDeletionRequest(db, B)).toBeNull();
    expect(await pendingDeletions(db)).toEqual([]);
    expect((await requestDeletion(db, B)).outcome).toBe("received");
  });
  it("never deletes anything themselves", async () => {
    expect(await db.collection("user").countDocuments({ _id: bob })).toBe(1);
    expect(await db.collection("reviews").countDocuments({ userId: B })).toBe(1);
  });
  it("are audited without personal data", async () => {
    expect(await cancelDeletion(db, B)).toBe(true);
    const rows = await db.collection(AUDIT_LOG).find({ action: /^privacy\./ }).toArray();
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(["privacy.export_prepared", "privacy.export_downloaded", "privacy.deletion_requested", "privacy.deletion_cancelled"]));
    expect(JSON.stringify(rows)).not.toMatch(/example\.test|\+880/);
  });
  it("the validator refuses a malformed request", async () => {
    await expect(db.collection(PRIVACY_REQUESTS).insertOne({ userId: A, kind: "erase_everything", status: "received", createdAt: new Date(), updatedAt: new Date() })).rejects.toThrow();
  });
});
