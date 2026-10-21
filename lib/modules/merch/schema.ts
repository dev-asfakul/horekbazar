// Merchandising (SCHEMA.md → collections, homeSections, banners; capability `merch.write`).
// Home sections are a discriminated union on `type` (the six contract types); each type has its
// own `data` shape, so the validator rejects a section whose data does not match its type.
import { z } from "zod";
import { zDate, zInt, zObjectId } from "../../db/bson-zod.ts";
import { localizedText, seoSchema, zSlug } from "../catalogue/schema.ts";

export const COLLECTIONS = "collections";
export const HOME_SECTIONS = "homeSections";
export const BANNERS = "banners";

/** An internal path: starts with one slash, no scheme, no protocol-relative `//`. */
export const INTERNAL_PATH = /^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/;
export const zInternalPath = () => z.string().max(300).regex(INTERNAL_PATH);

export const imageRefSchema = z
  .object({
    publicId: z.string().regex(/^[A-Za-z0-9_\-/]+$/).max(200),
    rights: z.string().trim().min(1).max(300),
    width: zInt().min(1).optional(),
    height: zInt().min(1).optional(),
  })
  .strict();

const timestamps = { version: zInt().min(1), createdAt: zDate(), updatedAt: zDate() };
const visibility = { visibleFrom: zDate().optional(), visibleTo: zDate().optional() };

export const collectionSchema = z
  .object({
    _id: zObjectId(),
    slug: zSlug(),
    name: localizedText(80),
    description: localizedText(500).optional(),
    /** B4 implements manual collections; rule collections are evaluated by the storefront (B5). */
    kind: z.enum(["manual", "rule"]),
    productIds: z.array(zObjectId()).max(200),
    rule: z.object({ categoryIds: z.array(zObjectId()).max(20), priceMax: zInt().min(1).optional() }).strict().optional(),
    status: z.enum(["draft", "published"]),
    seo: seoSchema.optional(),
    ...timestamps,
  })
  .strict();
export type CollectionDoc = z.infer<typeof collectionSchema>;

export const HOME_SECTION_TYPES = ["hero", "categoryTiles", "productRail", "banner", "collectionGrid", "richText"] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

const sectionBase = { _id: zObjectId(), order: zInt().min(0).max(1000), status: z.enum(["draft", "published"]), ...visibility, ...timestamps };

export const heroData = z
  .object({ title: localizedText(80), subtitle: localizedText(160).optional(), ctaLabel: localizedText(30).optional(), href: zInternalPath().optional(), image: imageRefSchema.extend({ alt: localizedText(200) }).strict().optional() })
  .strict();
export const categoryTilesData = z.object({ title: localizedText(80).optional(), categoryIds: z.array(zObjectId()).min(1).max(12) }).strict();
export const productRailData = z.object({ title: localizedText(80), collectionId: zObjectId() }).strict();
export const bannerData = z.object({ bannerId: zObjectId() }).strict();
export const collectionGridData = z.object({ title: localizedText(80).optional(), collectionIds: z.array(zObjectId()).min(1).max(8) }).strict();
/** Plain text only (rendered escaped); no HTML is stored. */
export const richTextData = z.object({ title: localizedText(80).optional(), body: localizedText(2000) }).strict();

export const homeSectionSchema = z.discriminatedUnion("type", [
  z.object({ ...sectionBase, type: z.literal("hero"), data: heroData }).strict(),
  z.object({ ...sectionBase, type: z.literal("categoryTiles"), data: categoryTilesData }).strict(),
  z.object({ ...sectionBase, type: z.literal("productRail"), data: productRailData }).strict(),
  z.object({ ...sectionBase, type: z.literal("banner"), data: bannerData }).strict(),
  z.object({ ...sectionBase, type: z.literal("collectionGrid"), data: collectionGridData }).strict(),
  z.object({ ...sectionBase, type: z.literal("richText"), data: richTextData }).strict(),
]);
export type HomeSectionDoc = z.infer<typeof homeSectionSchema>;

export const BANNER_PLACEMENTS = ["home_top", "home_mid", "category_top"] as const;

export const bannerSchema = z
  .object({
    _id: zObjectId(),
    image: imageRefSchema,
    alt: localizedText(200),
    href: zInternalPath().optional(),
    placement: z.enum(BANNER_PLACEMENTS),
    status: z.enum(["draft", "published", "archived"]),
    ...visibility,
    ...timestamps,
  })
  .strict();
export type BannerDoc = z.infer<typeof bannerSchema>;
