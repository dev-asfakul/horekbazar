// B9 part 2 notifications on a disposable replica set: browser subscriptions (one per endpoint,
// offers consent recorded separately, at most 10 per account), order-update pushes queued inside the
// order transition only when push is configured and only to the orders topic, campaigns sent once
// and only to the offers topic, gone subscriptions pruned, and the order e-mail log.
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { EMAIL_JOB, outboxHandlers } from "@/lib/adapters/jobs/handlers";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import {
  campaignDelivery,
  createCampaign,
  customerSubscriptions,
  deleteCampaign,
  emailHash,
  listCampaigns,
  marketingAudience,
  recentEmails,
  recordEmailAttempt,
  removeAllPushSubscriptions,
  removePushSubscription,
  runPushJob,
  savePushSubscription,
  sendCampaign,
} from "@/lib/modules/notifications/notifications";
import { CAMPAIGNS, EMAIL_LOG, PUSH_JOB, PUSH_SUBSCRIPTIONS } from "@/lib/modules/notifications/schema";
import { createAddress } from "@/lib/modules/orders/addresses";
import { EMAIL_TEMPLATES } from "@/lib/modules/identity/emails";
import { placeOrder } from "@/lib/modules/orders/checkout";
import { transitionOrder } from "@/lib/modules/orders/transitions";
import { OUTBOX, completeJob, type OutboxHandler } from "@/lib/modules/platform/outbox";
import type { OutboxDoc } from "@/lib/modules/platform/schema";
import { addToCart, CommerceError } from "@/lib/modules/pricing/cart";
import { quoteLines } from "@/lib/modules/pricing/quote";
import { SETTINGS, SETTINGS_ID } from "@/lib/modules/settings/schema";
import { getSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: null };
const staff = { type: "staff" as const, id: "staff-1", role: "owner", ip: null };
const tag = randomUUID().slice(0, 6);
let cat: string;

function vapidEnv() {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  return { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d!, VAPID_SUBJECT: "mailto:ops@example.test" };
}
const VAPID = vapidEnv();
const config = { publicKey: VAPID.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: VAPID.VAPID_PRIVATE_KEY, subject: VAPID.VAPID_SUBJECT };

/** A real browser key pair, so the library can encrypt to it. */
function browser(locale: "bn" | "en" = "bn", topics = { orders: true, marketing: false }) {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const p256dh = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, "base64url"), Buffer.from(jwk.y!, "base64url")]).toString("base64url");
  return { endpoint: `https://push.example.test/${randomUUID()}`, keys: { p256dh, auth: Buffer.from(randomUUID().slice(0, 16)).toString("base64url") }, topics, locale };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof CommerceError ? e.code : String(e);
  }
};

const pushRows = (prefix: string) => db.collection<OutboxDoc>(OUTBOX).find({ type: PUSH_JOB, idempotencyKey: { $regex: `^${PUSH_JOB.replace(".", "\\.")}:${prefix}` } }).toArray();

const saved: Record<string, string | undefined> = {};
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (!(k in saved)) saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    delete saved[k];
  }
});

async function placeFor(userId: string) {
  const id = String(await createProduct(db, client, actor, { slug: `n-${tag}-${randomUUID().slice(0, 4)}`, name: { bn: "প্রোডাক্ট", en: "Item" }, primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  const v = String(await createVariant(db, client, actor, id, { sku: `N-${randomUUID().slice(0, 8).toUpperCase()}`, title: { bn: "প্যাক" }, options: [], price: { amountMinor: 10000, currency: "BDT" }, position: 0 }));
  await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: 5 }] });
  await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  await addToCart(db, { userId }, v, 1);
  const addressId = String(await createAddress(db, userId, { label: "home", name: "রহিম", phone: "01712-345678", zoneId: "dhaka", district: "ঢাকা", area: "মিরপুর", line: "বাসা ১২, রোড ৩" }));
  const cart = (await db.collection("carts").findOne({ userId, status: "active" }))!;
  const quote = await quoteLines(db, cart.lines, { userId, couponCode: cart.couponCode, zoneId: "dhaka" });
  const { orderId } = await placeOrder(db, client, { userId, customer: { name: "রহিম উদ্দিন", email: `${userId}@example.com` }, addressId, expectedTotal: quote.priced.total, idempotencyKey: randomUUID(), locale: "bn" });
  return new ObjectId(orderId);
}

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  cat = String(await createCategory(db, client, actor, { slug: `ntf-${tag}`, parentId: null, name: { bn: "খাবার" }, position: 1 }));
  await setCategoryStatus(db, client, actor, cat, (await getCategory(db, cat))!.version, "published");
  await upsertDeliveryZone(db, actor, (await getSettings(db)).version, { id: "dhaka", name: { bn: "ঢাকা" }, fee: { amountMinor: 6000, currency: "BDT" }, estimate: { bn: "১-২ দিন" }, areas: [], enabled: true });
  await db.collection(SETTINGS).updateOne({ _id: SETTINGS_ID } as never, { $set: { "features.checkout": true } });
});
afterAll(async () => cleanup());

describe("push subscriptions (B9 part 2, §1)", () => {
  it("one document per endpoint; offers consent is recorded when ticked and dropped when unticked", async () => {
    const user = `u-${randomUUID()}`;
    const b = browser("en", { orders: true, marketing: false });
    const first = await savePushSubscription(db, user, b, new Date("2026-10-01T00:00:00Z"));
    expect(first.consentAt).toBeUndefined();
    const on = await savePushSubscription(db, user, { ...b, topics: { orders: true, marketing: true } }, new Date("2026-10-02T00:00:00Z"));
    expect(on.consentAt?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(on.consentSource).toBe("account");
    // Saving again keeps the original consent time.
    const again = await savePushSubscription(db, user, { ...b, topics: { orders: false, marketing: true } }, new Date("2026-10-03T00:00:00Z"));
    expect(again.consentAt?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(String(again._id)).toBe(String(first._id));
    const off = await savePushSubscription(db, user, { ...b, topics: { orders: true, marketing: false } });
    expect(off.consentAt).toBeUndefined();
    expect(await db.collection(PUSH_SUBSCRIPTIONS).countDocuments({ endpoint: b.endpoint })).toBe(1);
    // A browser that changes hands moves to the new account and needs fresh consent.
    await savePushSubscription(db, user, { ...b, topics: { orders: true, marketing: true } });
    const other = `u-${randomUUID()}`;
    const moved = await savePushSubscription(db, other, { ...b, topics: { orders: true, marketing: true } }, new Date("2026-10-05T00:00:00Z"));
    expect(moved.userId).toBe(other);
    expect(moved.consentAt?.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(await customerSubscriptions(db, user)).toHaveLength(0);
  });

  it("keeps the newest 10 browsers per account; removal is limited to the owner", async () => {
    const user = `u-${randomUUID()}`;
    const endpoints: string[] = [];
    for (let i = 0; i < 12; i++) {
      const b = browser();
      endpoints.push(b.endpoint);
      await savePushSubscription(db, user, b, new Date(Date.UTC(2026, 9, 1, 0, i)));
    }
    const mine = await customerSubscriptions(db, user);
    expect(mine).toHaveLength(10);
    expect(mine.map((s) => s.endpoint)).not.toContain(endpoints[0]);
    expect(mine.map((s) => s.endpoint)).not.toContain(endpoints[1]);
    expect(await removePushSubscription(db, "u-stranger", endpoints[11]!)).toBe(false);
    expect(await removePushSubscription(db, user, endpoints[11]!)).toBe(true);
    expect(await removeAllPushSubscriptions(db, user)).toBe(9);
  });

  it("the validator rejects a non-https endpoint", async () => {
    await expect(savePushSubscription(db, `u-${randomUUID()}`, { ...browser(), endpoint: "http://push.example.test/x" })).rejects.toBeInstanceOf(CommerceError);
  });
});

describe("order-update pushes", () => {
  it("are queued in the transition only when push is configured, once per browser with the orders topic", async () => {
    const user = `u-${randomUUID()}`;
    await savePushSubscription(db, user, browser("bn", { orders: true, marketing: false }));
    await savePushSubscription(db, user, browser("en", { orders: true, marketing: true }));
    await savePushSubscription(db, user, browser("bn", { orders: false, marketing: true }));
    const id = await placeFor(user);
    setEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined });
    let v = (await transitionOrder(db, client, { orderId: id, expectedVersion: 1, to: "confirmed", actor: staff })).version;
    expect(await pushRows(`order-${String(id)}-`)).toHaveLength(0); // push not configured
    setEnv(VAPID);
    v = (await transitionOrder(db, client, { orderId: id, expectedVersion: v, to: "processing", actor: staff })).version;
    expect(await pushRows(`order-${String(id)}-`)).toHaveLength(0); // customers are not told about "processing"
    await transitionOrder(db, client, { orderId: id, expectedVersion: v, to: "cancelled_by_store", actor: staff, reason: "Out of stock" });
    const rows = await pushRows(`order-${String(id)}-`);
    expect(rows).toHaveLength(2); // the two browsers with order updates on, not the offers-only one
    expect(new Set(rows.map((r) => r.payload.subscriptionId)).size).toBe(2);
    expect(rows.map((r) => r.payload.title).sort()).toEqual([expect.stringMatching(/^Order /), expect.stringMatching(/^অর্ডার /)].sort());
    for (const r of rows) {
      expect(String(r.payload.url)).toMatch(/^(\/en)?\/account\/orders\//);
      expect(r.payload).not.toHaveProperty("endpoint");
    }
  });
});

describe("campaigns", () => {
  it("are sent once, only to browsers that ticked offers, each in its own language", async () => {
    const before = await marketingAudience(db);
    const a = browser("bn", { orders: true, marketing: true });
    const b = browser("en", { orders: false, marketing: true });
    await savePushSubscription(db, `u-${randomUUID()}`, a);
    await savePushSubscription(db, `u-${randomUUID()}`, b);
    await savePushSubscription(db, `u-${randomUUID()}`, browser("bn", { orders: true, marketing: false }));
    expect(await marketingAudience(db)).toBe(before + 2);
    const id = String(await createCampaign(db, actor, { title: { bn: "অফার", en: "Offer" }, body: { bn: "চাল ১০% কম", en: "Rice 10% off" }, url: "/c/rice" }));
    expect(await code(sendCampaign(db, client, actor, id, 1, {}))).toBe("push_not_configured");
    const n = await sendCampaign(db, client, actor, id, 1, VAPID);
    expect(n).toBe(before + 2);
    expect(await code(sendCampaign(db, client, actor, id, 1, VAPID))).toBe("version_conflict");
    expect(await code(sendCampaign(db, client, actor, id, 2, VAPID))).toBe("version_conflict");
    const rows = await pushRows(`campaign-${id}:`);
    expect(rows).toHaveLength(n);
    const subs = await db.collection(PUSH_SUBSCRIPTIONS).find({ endpoint: { $in: [a.endpoint, b.endpoint] } }).toArray();
    const bySub = new Map(rows.map((r) => [r.payload.subscriptionId, r.payload]));
    expect(bySub.get(String(subs.find((s) => s.endpoint === a.endpoint)!._id))).toMatchObject({ title: "অফার", url: "/c/rice" });
    expect(bySub.get(String(subs.find((s) => s.endpoint === b.endpoint)!._id))).toMatchObject({ title: "Offer", url: "/en/c/rice" });
    const c = (await listCampaigns(db)).find((x) => String(x._id) === id)!;
    expect(c).toMatchObject({ status: "sent", recipients: n, sentBy: "staff-1", version: 2 });
    expect(await campaignDelivery(db, id)).toEqual({ accepted: 0, removed: 0, waiting: n, failed: 0 });
    // A sent campaign cannot be deleted; a draft can, with its version.
    expect(await code(deleteCampaign(db, actor, id, 2))).toBe("version_conflict");
    const draft = String(await createCampaign(db, actor, { title: { bn: "খসড়া" }, body: { bn: "বার্তা" }, url: "/" }));
    expect(await code(deleteCampaign(db, actor, draft, 2))).toBe("version_conflict");
    await deleteCampaign(db, actor, draft, 1);
    expect(await db.collection(CAMPAIGNS).countDocuments({ _id: new ObjectId(draft) })).toBe(0);
    expect(await db.collection("auditLog").countDocuments({ "target.type": "campaign", "target.id": { $in: [id, draft] } })).toBe(4);
  });
});

describe("push job", () => {
  const fetchWith = (status: number) => (async () => new Response(null, { status })) as unknown as typeof fetch;

  it("sends, prunes a gone subscription, and finishes rows whose subscription was removed", async () => {
    const user = `u-${randomUUID()}`;
    const saved1 = await savePushSubscription(db, user, browser());
    const payload = { subscriptionId: String(saved1._id), title: "t", body: "b", url: "/account" };
    await expect(runPushJob(db, { payload }, { config, fetchImpl: fetchWith(201) })).resolves.toEqual({ providerRef: "accepted-201" });
    await expect(runPushJob(db, { payload }, { config, fetchImpl: fetchWith(500) })).rejects.toThrow("push rejected with 500");
    await expect(runPushJob(db, { payload }, { config: null })).rejects.toThrow(/not configured/);
    await expect(runPushJob(db, { payload }, { config, fetchImpl: fetchWith(410) })).resolves.toEqual({ providerRef: "gone" });
    expect(await db.collection(PUSH_SUBSCRIPTIONS).countDocuments({ _id: saved1._id })).toBe(0);
    await expect(runPushJob(db, { payload }, { config, fetchImpl: fetchWith(201) })).resolves.toEqual({ providerRef: "subscription_removed" });
  });

  it("delivery counts read the campaign's finished rows", async () => {
    await savePushSubscription(db, `u-${randomUUID()}`, browser("bn", { orders: false, marketing: true }));
    const id = String(await createCampaign(db, actor, { title: { bn: "অফার" }, body: { bn: "বার্তা" }, url: "/" }));
    const n = await sendCampaign(db, client, actor, id, 1, VAPID);
    const rows = await pushRows(`campaign-${id}:`);
    const handler: OutboxHandler = async () => ({ providerRef: "gone" });
    // Finish one as gone and one as accepted, as the drain would.
    await db.collection<OutboxDoc>(OUTBOX).updateMany({ _id: { $in: rows.slice(0, 2).map((r) => r._id) } }, { $set: { status: "processing", leaseOwner: "w" } });
    await completeJob(db, rows[0]!._id, "w", await handler(rows[0]!, { db }));
    await completeJob(db, rows[1]!._id, "w", { providerRef: "accepted-201" });
    expect(await campaignDelivery(db, id)).toEqual({ accepted: 1, removed: 1, waiting: n - 2, failed: 0 });
  });
});

describe("order e-mail log", () => {
  it("one entry per outbox e-mail, attempts counted, address never stored in clear", async () => {
    const env = { AUTH_SECRET: "s".repeat(40) };
    const key = `email.send:test-${randomUUID()}:1`;
    await recordEmailAttempt(db, { outboxKey: key, to: "Karim@Example.com", template: "order-placed", status: "failed", error: "Rejected karim@example.com: mailbox full" }, env);
    await recordEmailAttempt(db, { outboxKey: key, to: "Karim@Example.com", template: "order-placed", status: "sent", providerId: "re_123" }, env);
    const doc = (await db.collection(EMAIL_LOG).findOne({ outboxKey: key }))!;
    expect(doc).toMatchObject({ status: "sent", attempts: 2, providerId: "re_123", toMasked: "k***@example.com", toHash: emailHash("karim@example.com", env) });
    expect(doc).not.toHaveProperty("error");
    expect(JSON.stringify(doc).toLowerCase()).not.toContain("karim@");
    const failedKey = `email.send:test-${randomUUID()}:1`;
    await recordEmailAttempt(db, { outboxKey: failedKey, to: "x@example.com", template: "order-placed", status: "failed", error: "Rejected x@example.com" }, env);
    expect((await db.collection(EMAIL_LOG).findOne({ outboxKey: failedKey }))!.error).toBe("Rejected [address]");
    expect((await recentEmails(db, { email: "KARIM@example.com" }, env)).map((e) => e.outboxKey)).toEqual([key]);
  });

  it("the e-mail outbox handler logs each attempt, and an unconfigured provider is logged as failed", async () => {
    setEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined });
    const idempotencyKey = `${EMAIL_JOB}:log-${randomUUID()}:1`;
    const job = { _id: new ObjectId(), type: EMAIL_JOB, idempotencyKey, payload: { template: EMAIL_TEMPLATES[0], to: "nasima@example.com", locale: "bn", url: "https://shop.example.test/x" } } as unknown as OutboxDoc;
    await expect(outboxHandlers[EMAIL_JOB]!(job, { db })).rejects.toThrow(/not configured/);
    await expect(outboxHandlers[EMAIL_JOB]!(job, { db })).rejects.toThrow(/not configured/);
    expect(await db.collection(EMAIL_LOG).findOne({ outboxKey: idempotencyKey })).toMatchObject({ status: "failed", attempts: 2, toMasked: "n***@example.com", template: EMAIL_TEMPLATES[0] });
  });
});
