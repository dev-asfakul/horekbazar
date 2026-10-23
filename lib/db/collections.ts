// Collection registry: one entry per persisted collection, with its Zod schema, indexes and the
// rules its validator cannot express (enforced in the service layer instead). Modules add their
// collections here as their phase lands (B3 identity, B4 catalogue and settings, …).
import type { IndexDescription } from "mongodb";
import type { z } from "zod";
import { auditLogSchema, jobsSchema, migrationsSchema, outboxSchema } from "../modules/platform/schema.ts";
import { AUTH_COLLECTIONS, INSTALLATION, installationSchema, STAFF_ROLES, staffRoleSchema } from "../modules/identity/schema.ts";
import {
  CATEGORIES,
  categorySchema,
  INVENTORY_LEDGER,
  inventoryLedgerSchema,
  PRODUCTS,
  productSchema,
  STOCK,
  stockSchema,
  VARIANTS,
  variantSchema,
} from "../modules/catalogue/schema.ts";
import { CATALOGUE_LOCKS, catalogueLockSchema } from "../modules/catalogue/locks.ts";
import { SETTINGS, settingsSchema } from "../modules/settings/schema.ts";
import {
  ADDRESSES,
  addressSchema,
  IDEMPOTENCY_KEYS,
  idempotencyKeySchema,
  ORDER_EVENTS,
  orderEventSchema,
  ORDERS,
  orderSchema,
  RESERVATIONS,
  reservationSchema,
} from "../modules/orders/schema.ts";
import {
  CARTS,
  cartSchema,
  COUPON_CUSTOMER_USAGE,
  COUPON_REDEMPTIONS,
  couponCustomerUsageSchema,
  couponRedemptionSchema,
  COUPONS,
  couponSchema,
  PROMOTIONS,
  promotionSchema,
} from "../modules/pricing/schema.ts";
import { COURIER_EVENTS, courierEventSchema, RETURNS, returnSchema, SHIPMENTS, shipmentSchema } from "../modules/fulfilment/schema.ts";
import { BANNERS, bannerSchema, COLLECTIONS, collectionSchema, HOME_SECTIONS, homeSectionSchema } from "../modules/merch/schema.ts";
import { REVIEWS, reviewSchema } from "../modules/reviews/schema.ts";
import { REWARD_LEDGER, REWARD_LOCKS, rewardEntrySchema, rewardLockSchema } from "../modules/rewards/schema.ts";
import { CONVERSATIONS, conversationSchema, MESSAGES, messageSchema } from "../modules/messaging/schema.ts";
import { AI_DRAFTS, aiDraftSchema } from "../modules/ai/schema.ts";
import { CAMPAIGNS, campaignSchema, EMAIL_LOG, emailLogSchema, PUSH_SUBSCRIPTIONS, pushSubscriptionSchema } from "../modules/notifications/schema.ts";

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
  {
    name: CATEGORIES,
    module: "catalogue",
    schema: categorySchema,
    indexes: [
      { key: { slug: 1 }, name: "slug_unique", unique: true },
      { key: { parentId: 1, position: 1 }, name: "parent_position" },
      { key: { status: 1 }, name: "status" },
    ],
    serviceEnforced: [
      "depth ≤ 3 on create and move, no cycles, structural changes serialised by catalogueLocks (catalogue/categories.ts)",
      "slug frozen once published; publish needs a published parent; archive needs no live children or products",
    ],
  },
  {
    name: PRODUCTS,
    module: "catalogue",
    schema: productSchema,
    indexes: [
      { key: { slug: 1 }, name: "slug_unique", unique: true },
      { key: { categoryIds: 1, status: 1 }, name: "categoryIds_status" },
      { key: { primaryCategoryId: 1 }, name: "primaryCategoryId" },
      { key: { status: 1, updatedAt: -1 }, name: "status_updatedAt" },
      { key: { status: 1, publishedAt: -1 }, name: "status_publishedAt" },
      // B5 storefront search. Language "none": no stemming or stop words, so Banglish, Bengali and
      // English words all match as written (BUILD-PLAN B5: "MongoDB text index, default_language none").
      {
        key: { "name.en": "text", "name.bn": "text", "shortDescription.en": "text", "shortDescription.bn": "text" },
        name: "storefront_text",
        default_language: "none",
        weights: { "name.en": 10, "name.bn": 10, "shortDescription.en": 2, "shortDescription.bn": 2 },
      },
    ],
    serviceEnforced: [
      "primary category is a leaf and in categoryIds; publish needs a published category and a priced active variant (catalogue/products.ts)",
      "slug frozen once published; sample records publish only in a _dev database; version compare-and-set on every edit",
    ],
  },
  {
    name: VARIANTS,
    module: "catalogue",
    schema: variantSchema,
    indexes: [
      { key: { sku: 1 }, name: "sku_unique", unique: true },
      { key: { productId: 1, position: 1 }, name: "productId_position" },
    ],
    serviceEnforced: ["compareAt > price; SKU frozen once stock has moved; a published product keeps one priced active variant (catalogue/products.ts)"],
  },
  {
    name: STOCK,
    module: "inventory",
    schema: stockSchema,
    indexes: [{ key: { variantId: 1 }, name: "variantId_unique", unique: true }],
    serviceEnforced: ["available = onHand − reserved, written in the same update; negative moves are guarded updates (catalogue/inventory.ts)"],
  },
  {
    name: INVENTORY_LEDGER,
    module: "inventory",
    schema: inventoryLedgerSchema,
    indexes: [
      { key: { idempotencyKey: 1 }, name: "idempotencyKey_unique", unique: true },
      { key: { variantId: 1, createdAt: -1 }, name: "variantId_createdAt" },
    ],
    serviceEnforced: ["append-only; one row per movement with the canonical key; written in the stock transaction (catalogue/inventory.ts)"],
  },
  {
    name: CATALOGUE_LOCKS,
    module: "catalogue",
    schema: catalogueLockSchema,
    indexes: [],
    serviceEnforced: ["incremented inside every structural category transaction (catalogue/categories.ts)"],
  },
  {
    name: SETTINGS,
    module: "settings",
    schema: settingsSchema,
    indexes: [],
    serviceEnforced: ["single document; version compare-and-set; accent ≥ 4.5:1 against white and the page background (settings/settings.ts)"],
  },
  {
    name: COLLECTIONS,
    module: "merch",
    schema: collectionSchema,
    indexes: [
      { key: { slug: 1 }, name: "slug_unique", unique: true },
      { key: { productIds: 1 }, name: "productIds" },
    ],
    serviceEnforced: ["products exist; slug frozen while published; not unpublished or deleted while a section uses it (merch/merch.ts)"],
  },
  {
    name: HOME_SECTIONS,
    module: "merch",
    schema: homeSectionSchema,
    indexes: [{ key: { order: 1 }, name: "order" }],
    serviceEnforced: ["references exist; published only when what it shows is published; visibleTo after visibleFrom (merch/merch.ts)"],
  },
  {
    name: BANNERS,
    module: "merch",
    schema: bannerSchema,
    indexes: [{ key: { placement: 1, status: 1 }, name: "placement_status" }],
    serviceEnforced: ["internal href only; not hidden or deleted while a published section uses it (merch/merch.ts)"],
  },
  // B6 pricing and cart (domain-rules §5, §4.1).
  {
    name: PROMOTIONS,
    module: "pricing",
    schema: promotionSchema,
    indexes: [{ key: { status: 1, startsAt: 1, endsAt: 1 }, name: "status_window" }],
    serviceEnforced: ["a flash sale has a real end time after its start; sold ≤ cap through a guarded $inc at placement (pricing/admin.ts, orders/checkout.ts)"],
  },
  {
    name: COUPONS,
    module: "pricing",
    schema: couponSchema,
    indexes: [{ key: { code: 1 }, name: "code_unique", unique: true }],
    serviceEnforced: ["used < usageLimit through a guarded $inc inside the placement transaction; percent value 1–100 (pricing/admin.ts, orders/checkout.ts)"],
  },
  {
    name: COUPON_REDEMPTIONS,
    module: "pricing",
    schema: couponRedemptionSchema,
    indexes: [
      { key: { orderId: 1 }, name: "orderId_unique", unique: true },
      { key: { couponId: 1, status: 1 }, name: "couponId_status" },
    ],
    serviceEnforced: ["held → consumed | released by compare-and-set only (orders/transitions.ts)"],
  },
  {
    name: COUPON_CUSTOMER_USAGE,
    module: "pricing",
    schema: couponCustomerUsageSchema,
    indexes: [{ key: { couponId: 1, userId: 1 }, name: "couponId_userId_unique", unique: true }],
    serviceEnforced: ["count < perCustomerLimit through a guarded $inc (orders/checkout.ts)"],
  },
  {
    name: CARTS,
    module: "pricing",
    schema: cartSchema,
    indexes: [
      { key: { userId: 1 }, name: "userId_active_unique", unique: true, partialFilterExpression: { status: "active", userId: { $exists: true } } },
      { key: { deviceId: 1 }, name: "deviceId_active_unique", unique: true, partialFilterExpression: { status: "active", deviceId: { $exists: true } } },
      // Device carts nobody came back to are removed after 60 days; customer carts are kept.
      { key: { updatedAt: 1 }, name: "device_cart_ttl", expireAfterSeconds: 60 * 24 * 3600, partialFilterExpression: { deviceId: { $exists: true } } },
    ],
    serviceEnforced: ["exactly one of userId/deviceId; every change is a compare-and-set on version (pricing/cart.ts)"],
  },
  // B7 addresses, orders and placement (domain-rules §3, §4.1).
  {
    name: ADDRESSES,
    module: "orders",
    schema: addressSchema,
    indexes: [{ key: { userId: 1, isDefault: -1, updatedAt: -1 }, name: "userId_default" }],
    serviceEnforced: ["at most 10 per customer, exactly one default; zoneId is an enabled store zone (orders/addresses.ts)"],
  },
  {
    name: ORDERS,
    module: "orders",
    schema: orderSchema,
    indexes: [
      { key: { orderNumber: 1 }, name: "orderNumber_unique", unique: true },
      { key: { userId: 1, checkoutKey: 1 }, name: "userId_checkoutKey_unique", unique: true },
      { key: { userId: 1, placedAt: -1 }, name: "userId_placedAt" },
      { key: { status: 1, placedAt: -1 }, name: "status_placedAt" },
    ],
    serviceEnforced: ["status changes only through transitionOrder (compare-and-set on version, §3 table); totals equal the server quote at placement (orders/checkout.ts)"],
  },
  {
    name: RESERVATIONS,
    module: "orders",
    schema: reservationSchema,
    indexes: [
      { key: { orderId: 1, lineId: 1 }, name: "orderId_lineId_unique", unique: true },
      { key: { variantId: 1, status: 1 }, name: "variantId_status" },
    ],
    serviceEnforced: ["active → committed | released by compare-and-set only (orders/transitions.ts)"],
  },
  {
    name: ORDER_EVENTS,
    module: "orders",
    schema: orderEventSchema,
    indexes: [{ key: { orderId: 1, seq: 1 }, name: "orderId_seq_unique", unique: true }],
    serviceEnforced: ["seq = the order's new version, written in the transition's transaction"],
  },
  {
    name: SHIPMENTS,
    module: "fulfilment",
    schema: shipmentSchema,
    indexes: [
      { key: { orderId: 1 }, name: "orderId_open_unique", unique: true, partialFilterExpression: { open: true } },
      { key: { orderId: 1, createdAt: -1 }, name: "orderId_createdAt" },
      { key: { courier: 1, consignmentId: 1 }, name: "courier_consignment_unique", unique: true, partialFilterExpression: { consignmentId: { $exists: true } } },
      { key: { status: 1, updatedAt: -1 }, name: "status_updatedAt" },
    ],
    serviceEnforced: [
      "status moves only through SHIPMENT_TRANSITIONS by compare-and-set on version, with the implied order step in the same transaction (fulfilment/shipments.ts)",
      "open = status is draft | booked | handed_over | delivery_failed",
      "courierStatus only moves forward (COURIER_STATUS_RANK) and is set only from the courier's status API",
    ],
  },
  {
    name: COURIER_EVENTS,
    module: "fulfilment",
    schema: courierEventSchema,
    indexes: [
      { key: { provider: 1, eventId: 1 }, name: "provider_eventId_unique", unique: true },
      { key: { consignmentId: 1, receivedAt: -1 }, name: "consignmentId_receivedAt" },
    ],
    serviceEnforced: ["eventId = sha256 of the callback's identifying fields; unknown body fields are never stored (fulfilment/webhooks.ts)"],
  },
  {
    name: RETURNS,
    module: "fulfilment",
    schema: returnSchema,
    indexes: [
      { key: { orderId: 1, createdAt: -1 }, name: "orderId_createdAt" },
      { key: { userId: 1, createdAt: -1 }, name: "userId_createdAt" },
      { key: { status: 1, updatedAt: -1 }, name: "status_updatedAt" },
    ],
    serviceEnforced: ["status moves only through RETURN_TRANSITIONS by compare-and-set on version; stock moves only from inspected (fulfilment/returns.ts)"],
  },
  // ── B9: engagement ──────────────────────────────────────────────────────────────────────
  {
    name: REVIEWS,
    module: "reviews",
    schema: reviewSchema,
    indexes: [
      // domain-rules §5.7: one review per order line (a product bought again on a later order can be
      // reviewed again). lineId is unique only within its order, so the key is the pair.
      { key: { orderId: 1, lineId: 1 }, name: "orderId_lineId_unique", unique: true },
      { key: { userId: 1, createdAt: -1 }, name: "userId_createdAt" },
      { key: { productId: 1, status: 1, createdAt: -1 }, name: "productId_status_createdAt" },
      { key: { status: 1, createdAt: -1 }, name: "status_createdAt" },
    ],
    serviceEnforced: ["only a delivered line of the author's own delivered/completed order; no edits or resubmission once written; published only by reviews.moderate with compare-and-set on version (reviews/reviews.ts)"],
  },
  {
    name: REWARD_LEDGER,
    module: "rewards",
    schema: rewardEntrySchema,
    indexes: [
      { key: { idempotencyKey: 1 }, name: "idempotencyKey_unique", unique: true },
      { key: { userId: 1, createdAt: -1 }, name: "userId_createdAt" },
      { key: { orderId: 1, kind: 1 }, name: "orderId_kind", partialFilterExpression: { orderId: { $exists: true } } },
    ],
    serviceEnforced: ["append-only; sign of points matches kind; balance derived from entries (availablePoints); written only while features.rewards is on, under the customer's rewardLocks document (rewards/rewards.ts)"],
  },
  {
    name: REWARD_LOCKS,
    module: "rewards",
    schema: rewardLockSchema,
    indexes: [],
    serviceEnforced: ["one per customer; seq incremented by every ledger write transaction (rewards/rewards.ts lockAccount)"],
  },
  {
    name: CONVERSATIONS,
    module: "messaging",
    schema: conversationSchema,
    indexes: [
      { key: { userId: 1, lastMessageAt: -1 }, name: "userId_lastMessageAt" },
      { key: { status: 1, lastMessageAt: -1 }, name: "status_lastMessageAt" },
    ],
    serviceEnforced: ["customers only see their own; orderId only for the customer's own order; at most 500 messages (messaging/messaging.ts)"],
  },
  {
    name: MESSAGES,
    module: "messaging",
    schema: messageSchema,
    indexes: [
      { key: { conversationId: 1, createdAt: 1 }, name: "conversationId_createdAt" },
      { key: { authorId: 1, clientKey: 1 }, name: "authorId_clientKey_unique", unique: true },
    ],
    serviceEnforced: ["plain text; posted with its conversation counters in one transaction (messaging/messaging.ts)"],
  },
  {
    name: IDEMPOTENCY_KEYS,
    module: "orders",
    schema: idempotencyKeySchema,
    indexes: [
      { key: { scope: 1, principalId: 1, key: 1 }, name: "scope_principal_key_unique", unique: true },
      { key: { expiresAt: 1 }, name: "expiresAt_ttl", expireAfterSeconds: 0 },
    ],
    serviceEnforced: ["the same key with a different request fingerprint is refused (IDEMPOTENCY_KEY_REUSED)"],
  },
  {
    name: PUSH_SUBSCRIPTIONS,
    module: "notifications",
    schema: pushSubscriptionSchema,
    indexes: [
      { key: { endpoint: 1 }, name: "endpoint_unique", unique: true },
      { key: { userId: 1, updatedAt: -1 }, name: "userId_updatedAt" },
      { key: { "topics.marketing": 1 }, name: "topics_marketing" },
    ],
    serviceEnforced: ["offers topic off unless ticked, consent time recorded; at most 10 per customer; removed when the push service answers 404/410 (notifications/notifications.ts)"],
  },
  {
    name: CAMPAIGNS,
    module: "notifications",
    schema: campaignSchema,
    indexes: [{ key: { status: 1, createdAt: -1 }, name: "status_createdAt" }],
    serviceEnforced: ["sent once (draft → sent with a version check) only to subscriptions with the offers topic on (notifications/notifications.ts)"],
  },
  {
    name: EMAIL_LOG,
    module: "notifications",
    schema: emailLogSchema,
    // Retention is an owner/legal decision (SCHEMA.md [L]); no TTL until it is made.
    indexes: [
      { key: { outboxKey: 1 }, name: "outboxKey_unique", unique: true },
      { key: { toHash: 1, updatedAt: -1 }, name: "toHash_updatedAt" },
      { key: { updatedAt: -1 }, name: "updatedAt_desc" },
    ],
    serviceEnforced: ["address stored only masked and as a keyed hash; provider errors have addresses removed (notifications/notifications.ts)"],
  },
  {
    name: AI_DRAFTS,
    module: "ai",
    schema: aiDraftSchema,
    indexes: [{ key: { targetType: 1, targetId: 1, status: 1 }, name: "targetType_targetId_status" }],
    serviceEnforced: ["a field reaches the product only when an editor applies it, with the product version check; applying never changes status (ai/drafts.ts)"],
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
