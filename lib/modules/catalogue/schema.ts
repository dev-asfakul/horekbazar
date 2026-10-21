// Catalogue module schemas (domain-rules §2: Catalogue owns categories, products, variants; Inventory
// owns stock and inventoryLedger, §4). Zod is the single source of truth: types are inferred here and
// the committed MongoDB validators in db/validators/ are generated from these schemas (§14).
// Relative `.ts` imports keep this module runnable by the Node 24 CLI scripts (db:migrate, db:seed).
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";

export const CATEGORIES = "categories";
export const PRODUCTS = "products";
export const VARIANTS = "variants";
export const STOCK = "stock";
export const INVENTORY_LEDGER = "inventoryLedger";

/** Maximum category depth: a top-level category has depth 1 (SCHEMA.md → Category depth). */
export const MAX_CATEGORY_DEPTH = 3;

/** Stable Latin slug (domain-rules §10): lower case, digits and single hyphens. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKU = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export const zSlug = () => z.string().min(2).max(80).regex(SLUG);

/** Localised text: Bengali required, English optional (SCHEMA.md "LT"). */
export const localizedText = (max = 200) =>
  z.object({ bn: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max).optional() }).strict();
export type LocalizedText = z.infer<ReturnType<typeof localizedText>>;

export const money = () => z.object({ amountMinor: zInt().min(0), currency: z.literal("BDT") }).strict();
export type Money = z.infer<ReturnType<typeof money>>;

export const seoSchema = z.object({ title: localizedText(70).optional(), description: localizedText(170).optional() }).strict();

export const CATALOGUE_STATUSES = ["draft", "published", "archived"] as const;
export type CatalogueStatus = (typeof CATALOGUE_STATUSES)[number];

/**
 * Generated sample data (owner change to D11, 2026-10-22): records loaded by `npm run db:seed` from
 * catalogue/horekbazar/ into a development database carry `sample: true`. The admin marks them, and
 * a sample record can be published only in a database whose name ends in `_dev`.
 */
const sample = z.literal(true).optional();

export const categorySchema = z
  .object({
    _id: zObjectId(),
    slug: zSlug(),
    parentId: zObjectId().nullable(),
    name: localizedText(80),
    description: localizedText(500).optional(),
    position: zInt().min(0).max(100000),
    seo: seoSchema.optional(),
    status: z.enum(CATALOGUE_STATUSES),
    /** Set the first time the category is published; the slug is frozen from then on (domain-rules §10). */
    publishedAt: zDate().optional(),
    sample,
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type CategoryDoc = z.infer<typeof categorySchema>;

export const productAttributeSchema = z
  .object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(40), label: localizedText(60), value: localizedText(200) })
  .strict();

export const productMediaSchema = z
  .object({
    /** Cloudinary public id (B4 signed upload). */
    publicId: z.string().regex(/^[A-Za-z0-9_\-/]+$/).max(200),
    alt: localizedText(200),
    /** Where the right to use the image comes from (DESIGN.md → Imagery: rights recorded). */
    rights: z.string().trim().min(1).max(300),
    width: zInt().min(1).optional(),
    height: zInt().min(1).optional(),
  })
  .strict();

export const productSchema = z
  .object({
    _id: zObjectId(),
    slug: zSlug(),
    name: localizedText(120),
    shortDescription: localizedText(300).optional(),
    description: localizedText(5000).optional(),
    primaryCategoryId: zObjectId(),
    categoryIds: z.array(zObjectId()).min(1).max(10),
    attributes: z.array(productAttributeSchema).max(30),
    media: z.array(productMediaSchema).max(12),
    status: z.enum(CATALOGUE_STATUSES),
    seo: seoSchema.optional(),
    publishedAt: zDate().optional(),
    sample,
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type ProductDoc = z.infer<typeof productSchema>;

export const NET_UNITS = ["g", "kg", "ml", "l", "pc"] as const;

export const variantSchema = z
  .object({
    _id: zObjectId(),
    productId: zObjectId(),
    sku: z.string().min(2).max(64).regex(SKU),
    /** Chip and cart-line label, e.g. { bn: "৫ কেজি", en: "5 kg" }. */
    title: localizedText(60),
    options: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]*$/).max(30), value: localizedText(60) }).strict()).max(5),
    /** `verified` is false until staff confirm the pack; the LabelTile shows only verified quantities. */
    netQuantity: z.object({ value: z.number().positive().max(100000), unit: z.enum(NET_UNITS), verified: z.boolean() }).strict().optional(),
    price: money(),
    compareAt: money().optional(),
    barcode: z.string().regex(/^[0-9A-Za-z-]+$/).max(40).optional(),
    weightGrams: zInt().min(1).max(1_000_000).optional(),
    position: zInt().min(0).max(1000),
    status: z.enum(["active", "archived"]),
    sample,
    version: zInt().min(1),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type VariantDoc = z.infer<typeof variantSchema>;

export const stockSchema = z
  .object({
    _id: zObjectId(),
    variantId: zObjectId(),
    onHand: zInt().min(0),
    reserved: zInt().min(0),
    /** Stored `onHand − reserved`, updated in the same write (domain-rules §4); never below zero. */
    available: zInt().min(0),
    lowStockThreshold: zInt().min(0),
    version: zInt().min(1),
    updatedAt: zDate(),
  })
  .strict();
export type StockDoc = z.infer<typeof stockSchema>;

export const LEDGER_KINDS = ["receive", "adjust", "reserve", "release", "commit", "restock", "write_off"] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Canonical `<namespace>:<entityId>:<lineRef>:<kind>` (domain-rules §4.1). */
export const LEDGER_KEY_PATTERN = "^(order|return|rto|stock):[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:(receive|adjust|reserve|release|commit|restock|write_off)$";

export const inventoryLedgerSchema = z
  .object({
    _id: zObjectId(),
    variantId: zObjectId(),
    kind: z.enum(LEDGER_KINDS),
    /** Signed change to onHand (receive and restock > 0; adjust may be negative). */
    qty: zInt(),
    onHandAfter: zInt().min(0),
    reservedAfter: zInt().min(0),
    actor: z.object({ type: z.enum(["staff", "system"]), id: z.string().min(1).max(100) }).strict(),
    reason: z.string().trim().min(1).max(300).optional(),
    refType: z.enum(["order", "rto", "return", "stock"]),
    refId: z.string().regex(/^[A-Za-z0-9_-]+$/).max(100),
    lineRef: z.string().regex(/^[A-Za-z0-9_-]+$/).max(100),
    idempotencyKey: z.string().regex(new RegExp(LEDGER_KEY_PATTERN)).max(300),
    createdAt: zDate(),
  })
  .strict();
export type InventoryLedgerDoc = z.infer<typeof inventoryLedgerSchema>;
