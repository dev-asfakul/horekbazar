// Notifications (B9 part 2; SCHEMA.md → pushSubscriptions, campaigns, emailLog; domain-rules §1, §13).
// Push opt-in is per browser; order updates and offers are separate topics, and the offers topic is
// off unless the customer ticks it (consent recorded with its time and source). Campaigns go only to
// subscriptions with the offers topic on. The e-mail log keeps a masked address and a keyed hash for
// search, never the address itself. Relative `.ts` imports keep this module runnable by CLI scripts.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";
import { localizedText } from "../catalogue/schema.ts";

export const PUSH_SUBSCRIPTIONS = "pushSubscriptions";
export const CAMPAIGNS = "campaigns";
export const EMAIL_LOG = "emailLog";

/** Outbox job type for one push message to one subscription (lib/adapters/jobs/handlers.ts). */
export const PUSH_JOB = "push.send";

/** Most browsers a customer keeps notifications on for; older ones are replaced first. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;

/** A same-site path such as "/c/rice" or "/en/new" (never another origin, never "//host"). */
export const zInternalPath = () =>
  z
    .string()
    .trim()
    .max(300)
    .regex(/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/, "a path on this site, starting with /");

const base64url = (max: number) => z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).max(max);

export const pushTopicsSchema = z.object({ orders: z.boolean(), marketing: z.boolean() }).strict();

export const pushSubscriptionSchema = z
  .object({
    _id: zObjectId(),
    userId: z.string().min(1).max(100).optional(),
    /** The push service URL; https only (RFC 8030). */
    endpoint: z.string().url().max(1000).regex(/^https:\/\//),
    keys: z.object({ p256dh: base64url(200), auth: base64url(50) }).strict(),
    topics: pushTopicsSchema,
    /** When the offers topic was last switched on, and from where; absent while it is off. */
    consentAt: zDate().optional(),
    consentSource: z.enum(["account"]).optional(),
    locale: z.enum(["bn", "en"]),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type PushSubscriptionDoc = z.infer<typeof pushSubscriptionSchema>;

export const campaignSchema = z
  .object({
    _id: zObjectId(),
    title: localizedText(60),
    body: localizedText(160),
    url: zInternalPath(),
    /** Always the offers topic only (domain-rules §1: marketing needs its own opt-in). */
    audience: z.literal("marketing_opt_in"),
    /** scheduled is reserved in SCHEMA.md; this phase sends immediately. */
    status: z.enum(["draft", "scheduled", "sent", "failed"]),
    /**
     * Messages queued when the campaign was sent (one per subscription with the offers topic on).
     * Delivery results are read from the campaign's outbox rows (campaignDelivery), not counted here,
     * so a retried message is never counted twice.
     */
    recipients: zInt().min(0).optional(),
    sentAt: zDate().optional(),
    sentBy: z.string().max(100).optional(),
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type CampaignDoc = z.infer<typeof campaignSchema>;

export const emailLogSchema = z
  .object({
    _id: zObjectId(),
    /** The outbox row's idempotency key: one log entry per e-mail, updated on each attempt. */
    outboxKey: z.string().min(1).max(300),
    /** HMAC-SHA256 of the lower-cased address (search only). */
    toHash: z.string().regex(/^[a-f0-9]{64}$/),
    /** For display, e.g. "r***@example.com". */
    toMasked: z.string().max(200),
    template: z.string().min(1).max(60),
    providerId: z.string().max(200).optional(),
    status: z.enum(["queued", "sent", "failed"]),
    error: z.string().max(300).optional(),
    attempts: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type EmailLogDoc = z.infer<typeof emailLogSchema>;
