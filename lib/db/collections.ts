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
import { BANNERS, bannerSchema, COLLECTIONS, collectionSchema, HOME_SECTIONS, homeSectionSchema } from "../modules/merch/schema.ts";

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
