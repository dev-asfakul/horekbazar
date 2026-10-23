// Notifications service (B9 part 2; domain-rules §1, §13; SCHEMA.md → pushSubscriptions, campaigns,
// emailLog). Push messages always leave through the outbox (one row per message), so a send is
// retried with backoff and never lost or duplicated by a slow push service:
// - order updates: queued in the order's own transition transaction, only to the customer's
//   browsers with the order-updates topic on;
// - campaigns: sent once (version check), only to subscriptions with the offers topic on, which is
//   off unless the customer ticked it;
// - a subscription the push service reports gone (404/410) is deleted.
// Relative `.ts` imports keep this module runnable by the Node 24 CLI scripts.
import { createHmac } from "node:crypto";
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import type { Actor } from "../catalogue/common.ts";
import { inTransaction, toObjectId } from "../catalogue/common.ts";
import type { LocalizedText } from "../catalogue/schema.ts";
import { orderStatusText } from "../identity/emails.ts";
import { recordAudit } from "../platform/audit.ts";
import { enqueueOutbox, OUTBOX } from "../platform/outbox.ts";
import type { OutboxDoc } from "../platform/schema.ts";
import { CommerceError } from "../pricing/cart.ts";
import { pushConfig, PushRejectedError, sendPush, type PushConfig, type PushMessageData } from "../../adapters/push/webpush.ts";
import {
  CAMPAIGNS,
  EMAIL_LOG,
  MAX_SUBSCRIPTIONS_PER_USER,
  PUSH_JOB,
  PUSH_SUBSCRIPTIONS,
  isPushServiceEndpoint,
  pushSubscriptionSchema,
  type CampaignDoc,
  type EmailLogDoc,
  type PushSubscriptionDoc,
} from "./schema.ts";

type Locale = "bn" | "en";
const pick = (t: LocalizedText, locale: Locale) => (locale === "en" ? (t.en ?? t.bn) : t.bn);
const localePath = (locale: Locale, path: string) => (locale === "bn" ? path : path === "/" ? "/en" : `/en${path}`);

// ── Subscriptions ─────────────────────────────────────────────────────────────────────────

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  topics: { orders: boolean; marketing: boolean };
  locale: Locale;
}

/**
 * Saves this browser's subscription for the signed-in customer (one document per endpoint). The
 * offers topic records its consent time when it is switched on and drops it when switched off. A
 * browser that changed hands (another account signs in) moves to the new account.
 */
export async function savePushSubscription(db: Db, userId: string, input: SubscriptionInput, now = new Date()) {
  const subs = db.collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS);
  const before = await subs.findOne({ endpoint: input.endpoint });
  const marketingOn = input.topics.marketing;
  const consent = marketingOn ? (before?.topics.marketing && before.userId === userId && before.consentAt ? { consentAt: before.consentAt, consentSource: "account" as const } : { consentAt: now, consentSource: "account" as const }) : {};
  const doc: PushSubscriptionDoc = {
    _id: before?._id ?? new ObjectId(),
    userId,
    endpoint: input.endpoint,
    keys: input.keys,
    topics: { orders: input.topics.orders, marketing: marketingOn },
    ...consent,
    locale: input.locale,
    createdAt: before?.createdAt ?? now,
    updatedAt: now,
  };
  const parsed = pushSubscriptionSchema.safeParse(doc);
  if (!parsed.success || !isPushServiceEndpoint(input.endpoint)) throw new CommerceError("invalid_subscription");
  await subs.replaceOne({ endpoint: input.endpoint }, parsed.data, { upsert: true });
  // Keep the newest few browsers per account.
  const extra = await subs.find({ userId }, { projection: { _id: 1 } }).sort({ updatedAt: -1 }).skip(MAX_SUBSCRIPTIONS_PER_USER).toArray();
  if (extra.length) await subs.deleteMany({ _id: { $in: extra.map((s) => s._id) } });
  return parsed.data;
}

/** Removes one browser's subscription, only if it belongs to this customer. */
export async function removePushSubscription(db: Db, userId: string, endpoint: string) {
  const r = await db.collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS).deleteOne({ userId, endpoint });
  return r.deletedCount === 1;
}

/** Turns notifications off on every browser of this customer. */
export async function removeAllPushSubscriptions(db: Db, userId: string) {
  return (await db.collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS).deleteMany({ userId })).deletedCount;
}

export async function customerSubscriptions(db: Db, userId: string) {
  return db
    .collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS)
    .find({ userId }, { projection: { endpoint: 1, topics: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .toArray();
}

/** Subscriptions a campaign would reach right now. */
export const marketingAudience = (db: Db) => db.collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS).countDocuments({ "topics.marketing": true });

// ── Order updates ─────────────────────────────────────────────────────────────────────────

/**
 * Queues an order-status push to each of the customer's browsers with the order-updates topic on,
 * inside the order transition's transaction (seq = the order's new version, so a replayed
 * transition never queues twice). Nothing is queued when push is not configured.
 */
export async function enqueueOrderPush(
  db: Db,
  session: ClientSession,
  order: { _id: ObjectId; userId?: string | null; orderNumber: string },
  status: string,
  version: number,
  now: Date,
  env: Record<string, string | undefined> = process.env,
) {
  if (!pushConfig(env) || !order.userId) return 0;
  const subs = await db
    .collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS)
    .find({ userId: order.userId, "topics.orders": true }, { session, projection: { _id: 1, locale: 1 } })
    .limit(MAX_SUBSCRIPTIONS_PER_USER)
    .toArray();
  for (const sub of subs) {
    const locale = sub.locale;
    const message: PushMessageData = {
      title: locale === "bn" ? `অর্ডার ${order.orderNumber}` : `Order ${order.orderNumber}`,
      body: orderStatusText(status, locale),
      url: localePath(locale, `/account/orders/${encodeURIComponent(order.orderNumber)}`),
      tag: `order-${order.orderNumber}`,
    };
    await enqueueOutbox(db, { type: PUSH_JOB, aggregateId: `order-${String(order._id)}-${String(sub._id)}`, seq: version, payload: { subscriptionId: String(sub._id), userId: order.userId, ...message } }, { session, now });
  }
  return subs.length;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────────────────

export interface CampaignInput {
  title: LocalizedText;
  body: LocalizedText;
  url: string;
}

export const listCampaigns = (db: Db) => db.collection<CampaignDoc>(CAMPAIGNS).find({}).sort({ createdAt: -1 }).limit(50).toArray();

export async function createCampaign(db: Db, actor: Actor, input: CampaignInput, now = new Date()) {
  const doc: CampaignDoc = { _id: new ObjectId(), title: input.title, body: input.body, url: input.url, audience: "marketing_opt_in", status: "draft", version: 1, createdAt: now, updatedAt: now };
  await db.collection<CampaignDoc>(CAMPAIGNS).insertOne(doc);
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "campaign.created", target: { type: "campaign", id: String(doc._id) }, after: { title: doc.title.bn, url: doc.url }, ip: actor.ip ?? null }, { now });
  return doc._id;
}

/** Deletes a draft (a sent campaign stays as the record of what was sent). */
export async function deleteCampaign(db: Db, actor: Actor, id: string, expectedVersion: number, now = new Date()) {
  const r = await db.collection<CampaignDoc>(CAMPAIGNS).findOneAndDelete({ _id: toObjectId(id), status: "draft", version: expectedVersion });
  if (!r) throw new CommerceError("version_conflict");
  await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "campaign.deleted", target: { type: "campaign", id }, before: { title: r.title.bn }, ip: actor.ip ?? null }, { now });
}

/** Most messages one campaign queues (a single-store template; larger lists need batching). */
export const CAMPAIGN_MAX_RECIPIENTS = 5000;

/**
 * Sends a draft once: in one transaction the campaign moves draft → sent (version check, so a double
 * click or a second tab cannot send it twice) and one outbox row is queued per subscription with the
 * offers topic on, in that subscription's language.
 */
export async function sendCampaign(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, env: Record<string, string | undefined> = process.env, now = new Date()) {
  if (!pushConfig(env)) throw new CommerceError("push_not_configured");
  const _id = toObjectId(id);
  return inTransaction(client, async (session) => {
    const campaigns = db.collection<CampaignDoc>(CAMPAIGNS);
    const campaign = await campaigns.findOne({ _id }, { session });
    if (!campaign || campaign.status !== "draft" || campaign.version !== expectedVersion) throw new CommerceError("version_conflict");
    const audience = await db
      .collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS)
      .find({ "topics.marketing": true }, { session, projection: { _id: 1, locale: 1 } })
      .sort({ _id: 1 })
      .limit(CAMPAIGN_MAX_RECIPIENTS)
      .toArray();
    const r = await campaigns.updateOne(
      { _id, status: "draft", version: expectedVersion },
      { $set: { status: "sent", recipients: audience.length, sentAt: now, sentBy: actor.id, updatedAt: now }, $inc: { version: 1 } },
      { session },
    );
    if (r.modifiedCount !== 1) throw new CommerceError("version_conflict");
    let i = 0;
    for (const sub of audience) {
      const message: PushMessageData = { title: pick(campaign.title, sub.locale), body: pick(campaign.body, sub.locale), url: localePath(sub.locale, campaign.url), tag: `campaign-${id}` };
      await enqueueOutbox(db, { type: PUSH_JOB, aggregateId: `campaign-${id}`, seq: i++, payload: { subscriptionId: String(sub._id), campaignId: id, ...message } }, { session, now });
    }
    await recordAudit(db, { actor: { id: actor.id, role: actor.role }, action: "campaign.sent", target: { type: "campaign", id }, after: { recipients: audience.length }, ip: actor.ip ?? null }, { session, now });
    return audience.length;
  });
}

/** Outbox outcomes where nothing was sent: browser gone or removed, offers turned off, host refused. */
const NOT_SENT_REFS = ["gone", "subscription_removed", "topic_off", "subscription_moved", "endpoint_refused"];

/** Delivery so far, read from the campaign's outbox rows (prefix match on the unique key index). */
export async function campaignDelivery(db: Db, id: string) {
  const prefix = `${PUSH_JOB}:campaign-${id}:`;
  const rows = await db
    .collection<OutboxDoc>(OUTBOX)
    .aggregate<{ _id: { status: string; gone: boolean }; n: number }>([
      { $match: { idempotencyKey: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` } } },
      { $group: { _id: { status: "$status", gone: { $in: ["$providerRef", NOT_SENT_REFS] } }, n: { $sum: 1 } } },
    ])
    .toArray();
  const out = { accepted: 0, removed: 0, waiting: 0, failed: 0 };
  for (const r of rows) {
    if (r._id.status === "done") out[r._id.gone ? "removed" : "accepted"] += r.n;
    else if (r._id.status === "dead") out.failed += r.n;
    else out.waiting += r.n;
  }
  return out;
}

// ── Push job (outbox handler) ─────────────────────────────────────────────────────────────

const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Sends one queued push message. Done only when the push service accepted it; a subscription that
 * is gone is deleted and the row finishes with providerRef "gone"; a removed subscription finishes
 * with "subscription_removed"; anything else is thrown so the outbox retries, then dead-letters.
 * The customer's choices are checked again at send time, so a message queued earlier is not sent
 * ("topic_off") once they turned that topic off, and an order update is not sent ("subscription_moved")
 * to a browser that now belongs to another account.
 */
export async function runPushJob(db: Db, job: Pick<OutboxDoc, "payload">, options: { config?: PushConfig | null; fetchImpl?: typeof fetch } = {}): Promise<{ providerRef: string }> {
  const config = options.config === undefined ? pushConfig() : options.config;
  if (!config) throw new Error("push is not configured (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)");
  const id = text(job.payload.subscriptionId, 24);
  if (!ObjectId.isValid(id)) throw new Error("push job: bad subscription id");
  const subs = db.collection<PushSubscriptionDoc>(PUSH_SUBSCRIPTIONS);
  const sub = await subs.findOne({ _id: new ObjectId(id) });
  if (!sub) return { providerRef: "subscription_removed" };
  const isCampaign = typeof job.payload.campaignId === "string";
  if (isCampaign ? !sub.topics.marketing : !sub.topics.orders) return { providerRef: "topic_off" };
  if (!isCampaign && (typeof job.payload.userId !== "string" || sub.userId !== job.payload.userId)) return { providerRef: "subscription_moved" };
  // Rows saved before the host check existed, or edited in the database, are never sent anywhere else.
  if (!isPushServiceEndpoint(sub.endpoint)) return { providerRef: "endpoint_refused" };
  const url = text(job.payload.url, 300);
  const message: PushMessageData = { title: text(job.payload.title, 80), body: text(job.payload.body, 200), url: /^\/(?!\/)/.test(url) ? url : "/", ...(typeof job.payload.tag === "string" ? { tag: text(job.payload.tag, 64) } : {}) };
  try {
    const result = await sendPush(config, sub, message, options.fetchImpl ? { fetchImpl: options.fetchImpl } : {});
    if (result.outcome === "gone") {
      await subs.deleteOne({ _id: sub._id, endpoint: sub.endpoint });
      return { providerRef: "gone" };
    }
    return { providerRef: `accepted-${result.status}` };
  } catch (error) {
    // Never include the endpoint (it is a capability URL) in the stored error.
    if (error instanceof PushRejectedError) throw new Error(`push rejected with ${error.status}`);
    throw new Error(`push failed: ${error instanceof Error ? error.name : "unknown"}`);
  }
}

// ── E-mail log ────────────────────────────────────────────────────────────────────────────

export function maskEmail(address: string): string {
  const [local = "", domain = ""] = address.trim().toLowerCase().split("@");
  return `${local.slice(0, 1)}***@${domain}`.slice(0, 200);
}

/** Keyed hash so the log can be searched by address without storing it (AUTH_SECRET as the key). */
export function emailHash(address: string, env: Record<string, string | undefined> = process.env): string {
  return createHmac("sha256", `email-log:${env.AUTH_SECRET ?? ""}`).update(address.trim().toLowerCase()).digest("hex");
}

/** Records one delivery attempt of an outbox e-mail (one entry per e-mail, updated per attempt). */
export async function recordEmailAttempt(
  db: Db,
  input: { outboxKey: string; to: string; template: string; status: "sent" | "failed"; providerId?: string; error?: string },
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
) {
  const set: Partial<EmailLogDoc> = { status: input.status, updatedAt: now };
  if (input.providerId) set.providerId = input.providerId.slice(0, 200);
  // Provider messages can quote the address; it is never stored in clear.
  if (input.error) set.error = input.error.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]").slice(0, 300);
  await db.collection<EmailLogDoc>(EMAIL_LOG).updateOne(
    { outboxKey: input.outboxKey },
    {
      $set: set,
      ...(input.status === "sent" ? { $unset: { error: "" } } : {}),
      $inc: { attempts: 1 },
      $setOnInsert: { _id: new ObjectId(), toHash: emailHash(input.to, env), toMasked: maskEmail(input.to), template: input.template, createdAt: now },
    },
    { upsert: true },
  );
}

export async function recentEmails(db: Db, filter: { email?: string } = {}, env: Record<string, string | undefined> = process.env) {
  const q = filter.email ? { toHash: emailHash(filter.email, env) } : {};
  return db.collection<EmailLogDoc>(EMAIL_LOG).find(q).sort({ updatedAt: -1 }).limit(50).toArray();
}
