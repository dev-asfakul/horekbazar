// B5 storefront read model (BUILD-PLAN §11 B5). Read-only: nothing here writes. Only published
// categories, products and collections are returned; a product is listed only when it has at least one
// active variant with a price above zero (the publish rule guarantees one, this re-checks it).
// Availability comes from the stored `available` (onHand − reserved) of the product's active variants;
// nothing is invented: a product without stock says so.
import { ObjectId, type Db, type Document } from "mongodb";
import { CATEGORIES, PRODUCTS, STOCK, VARIANTS, type CategoryDoc, type LocalizedText, type ProductDoc, type VariantDoc } from "@/lib/modules/catalogue/schema";
import { COLLECTIONS, HOME_SECTIONS, BANNERS, type BannerDoc, type CollectionDoc } from "@/lib/modules/merch/schema";
import { catalogueIndex, matchIndex } from "@/lib/modules/storefront/search-index";

export const PAGE_SIZE = 24;
export const MAX_PAGE = 500;
export const SORTS = ["relevance", "new", "price_asc", "price_desc"] as const;
export type Sort = (typeof SORTS)[number];

export interface StoreCategory {
  id: string;
  slug: string;
  name: LocalizedText;
  description?: LocalizedText | undefined;
  parentId: string | null;
  position: number;
  children: StoreCategory[];
  /** Ancestors from the root down, excluding this category. */
  ancestors: StoreCategory[];
}

export interface CategoryTree {
  roots: StoreCategory[];
  byId: Map<string, StoreCategory>;
  bySlug: Map<string, StoreCategory>;
}

/** The published category rows the tree is built from (also what the public-data cache stores). */
export type CategoryRow = Pick<CategoryDoc, "_id" | "slug" | "name" | "description" | "parentId" | "position">;
export async function categoryRows(db: Db): Promise<CategoryRow[]> {
  return db
    .collection<CategoryDoc>(CATEGORIES)
    .find({ status: "published" }, { projection: { slug: 1, name: 1, description: 1, parentId: 1, position: 1 } })
    .sort({ position: 1, slug: 1 })
    .toArray();
}

/** Published categories as a tree. A category whose parent is not published is left out with its subtree. */
export async function categoryTree(db: Db): Promise<CategoryTree> {
  return buildCategoryTree(await categoryRows(db));
}

export function buildCategoryTree(docs: CategoryRow[]): CategoryTree {
  const all = new Map<string, StoreCategory>();
  for (const d of docs) {
    all.set(String(d._id), { id: String(d._id), slug: d.slug, name: d.name, description: d.description, parentId: d.parentId ? String(d.parentId) : null, position: d.position, children: [], ancestors: [] });
  }
  const roots: StoreCategory[] = [];
  const byId = new Map<string, StoreCategory>();
  const bySlug = new Map<string, StoreCategory>();
  const visit = (c: StoreCategory, ancestors: StoreCategory[]) => {
    c.ancestors = ancestors;
    byId.set(c.id, c);
    bySlug.set(c.slug, c);
    for (const child of c.children) visit(child, [...ancestors, c]);
  };
  for (const c of all.values()) {
    if (c.parentId === null) roots.push(c);
    else all.get(c.parentId)?.children.push(c);
  }
  for (const r of roots) visit(r, []);
  return { roots, byId, bySlug };
}

/** The category itself and every published descendant (a listing of a parent shows its whole subtree). */
export function subtreeIds(category: StoreCategory): string[] {
  return [category.id, ...category.children.flatMap(subtreeIds)];
}

/** Resolves /c/a/b/c: every segment must be a published category and the chain must match the tree. */
export function resolveCategoryPath(tree: CategoryTree, segments: string[]): StoreCategory | null {
  if (segments.length === 0 || segments.length > 3) return null;
  const leaf = tree.bySlug.get(segments[segments.length - 1] ?? "");
  if (!leaf) return null;
  const chain = [...leaf.ancestors, leaf].map((c) => c.slug);
  return chain.length === segments.length && chain.every((s, i) => s === segments[i]) ? leaf : null;
}

export const categoryPath = (c: StoreCategory) => `/c/${[...c.ancestors, c].map((a) => a.slug).join("/")}`;

/** "New products" means published in the last 30 days. */
export const NEW_ARRIVAL_DAYS = 30;
export function newArrivalsSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - NEW_ARRIVAL_DAYS * 24 * 60 * 60 * 1000);
}

export interface ListingQuery {
  categoryIds?: string[];
  productIds?: string[];
  text?: string;
  sort?: Sort;
  page?: number;
  pageSize?: number;
  inStock?: boolean;
  /** Inclusive bounds on the lowest active variant price, in paisa. */
  minPrice?: number;
  maxPrice?: number;
  /** Only products with an active variant whose compare-at price is above its price. */
  deals?: boolean;
  publishedSince?: Date;
}

export interface ListingItem {
  id: string;
  slug: string;
  name: LocalizedText;
  primaryCategoryId: string;
  image?: { publicId: string; alt: LocalizedText; width?: number | undefined; height?: number | undefined };
  /** Lowest active variant price and that variant's compare-at price (only when higher). */
  price: number;
  compareAt?: number;
  variantCount: number;
  available: number;
  /** The only variant's id when the product has exactly one (the card can add it directly). */
  variantId?: string;
  /** Verified net quantity of the lowest-priced variant (never an unverified one). */
  netQuantity?: { value: number; unit: string };
  publishedAt?: Date | undefined;
}

export interface Listing {
  items: ListingItem[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  /** Lowest and highest price over the whole match (before price filters), for the filter hint. */
  priceRange: { min: number; max: number } | null;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Normalises a search query: trimmed, single-spaced, at most 80 characters. */
export function normaliseQuery(q: string): string {
  return q.replace(/\s+/g, " ").trim().slice(0, 80);
}

function productMatch(q: ListingQuery, mode: "text" | "regex" | "none"): Document {
  const match: Document = { status: "published" };
  if (q.categoryIds) match.categoryIds = { $in: q.categoryIds.map((id) => new ObjectId(id)) };
  if (q.productIds) match._id = { $in: q.productIds.map((id) => new ObjectId(id)) };
  if (q.publishedSince) match.publishedAt = { $gte: q.publishedSince };
  const text = q.text ? normaliseQuery(q.text) : "";
  if (text && mode === "text") match.$text = { $search: text };
  if (text && mode === "regex") {
    // Word-prefix match on names and slug: "mini" finds "Miniket Rice". Every word must match.
    const words = text.split(" ").filter(Boolean).slice(0, 6);
    match.$and = words.map((w) => {
      const re = new RegExp(`(^|[\\s\\-(])${escapeRegex(w)}`, "i");
      return { $or: [{ "name.en": re }, { "name.bn": re }, { slug: new RegExp(`(^|-)${escapeRegex(w.toLowerCase())}`) }] };
    });
  }
  return match;
}

function pipeline(q: ListingQuery, mode: "text" | "regex" | "none"): Document[] {
  const pageSize = q.pageSize ?? PAGE_SIZE;
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(q.page ?? 1)));
  const sort = q.sort ?? (q.text ? "relevance" : "new");
  const priced: Document = {};
  if (q.minPrice !== undefined) priced.$gte = q.minPrice;
  if (q.maxPrice !== undefined) priced.$lte = q.maxPrice;
  const after: Document = {};
  if (Object.keys(priced).length) after.price = priced;
  if (q.inStock) after.available = { $gt: 0 };
  if (q.deals) after.hasDeal = true;
  const sortStage: Document =
    sort === "price_asc" ? { price: 1, _id: 1 } : sort === "price_desc" ? { price: -1, _id: 1 } : sort === "relevance" && mode === "text" ? { score: -1, publishedAt: -1, _id: 1 } : { publishedAt: -1, _id: 1 };
  return [
    { $match: productMatch(q, mode) },
    ...(mode === "text" ? [{ $addFields: { score: { $meta: "textScore" } } }] : []),
    {
      $lookup: {
        from: VARIANTS,
        let: { pid: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$productId", "$$pid"] }, status: "active", "price.amountMinor": { $gt: 0 } } },
          { $lookup: { from: STOCK, localField: "_id", foreignField: "variantId", as: "stock" } },
          { $project: { price: "$price.amountMinor", compareAt: "$compareAt.amountMinor", netQuantity: 1, position: 1, available: { $ifNull: [{ $first: "$stock.available" }, 0] } } },
          { $sort: { price: 1, position: 1 } },
        ],
        as: "v",
      },
    },
    { $match: { "v.0": { $exists: true } } },
    {
      $addFields: {
        cheapest: { $first: "$v" },
        price: { $min: "$v.price" },
        available: { $sum: "$v.available" },
        variantCount: { $size: "$v" },
        hasDeal: { $anyElementTrue: [{ $map: { input: "$v", as: "x", in: { $gt: [{ $ifNull: ["$$x.compareAt", 0] }, "$$x.price"] } } }] },
      },
    },
    {
      $facet: {
        range: [{ $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } }],
        items: [{ $match: after }, { $sort: sortStage }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }, { $project: { slug: 1, name: 1, primaryCategoryId: 1, media: { $slice: ["$media", 1] }, price: 1, cheapest: 1, available: 1, variantCount: 1, publishedAt: 1 } }],
        total: [{ $match: after }, { $count: "n" }],
      },
    },
  ];
}

interface RawItem {
  _id: ObjectId;
  slug: string;
  name: LocalizedText;
  primaryCategoryId: ObjectId;
  media: ProductDoc["media"];
  price: number;
  cheapest: { _id: ObjectId; price: number; compareAt?: number; netQuantity?: VariantDoc["netQuantity"] };
  available: number;
  variantCount: number;
  publishedAt?: Date;
}

function toItem(r: RawItem): ListingItem {
  const first = r.media[0];
  const nq = r.cheapest.netQuantity;
  return {
    id: String(r._id),
    slug: r.slug,
    name: r.name,
    primaryCategoryId: String(r.primaryCategoryId),
    ...(first ? { image: { publicId: first.publicId, alt: first.alt, width: first.width, height: first.height } } : {}),
    price: r.price,
    ...(r.cheapest.compareAt && r.cheapest.compareAt > r.cheapest.price ? { compareAt: r.cheapest.compareAt } : {}),
    variantCount: r.variantCount,
    available: r.available,
    ...(r.variantCount === 1 ? { variantId: String(r.cheapest._id) } : {}),
    ...(nq?.verified ? { netQuantity: { value: nq.value, unit: nq.unit } } : {}),
    publishedAt: r.publishedAt,
  };
}

async function run(db: Db, q: ListingQuery, mode: "text" | "regex" | "none"): Promise<Listing> {
  const pageSize = q.pageSize ?? PAGE_SIZE;
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(q.page ?? 1)));
  const [out] = await db.collection(PRODUCTS).aggregate<{ items: RawItem[]; total: { n: number }[]; range: { min: number; max: number }[] }>(pipeline(q, mode)).toArray();
  const total = out?.total[0]?.n ?? 0;
  const range = out?.range[0];
  return { items: (out?.items ?? []).map(toItem), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), priceRange: range ? { min: range.min, max: range.max } : null };
}

/** Product listing for categories, collections, deals, new arrivals and search. */
export async function listPublishedProducts(db: Db, q: ListingQuery): Promise<Listing> {
  if (!q.text || !normaliseQuery(q.text)) return run(db, q, "none");
  // Full-word search first (text index, language "none", so Banglish and Bengali words are not stemmed);
  // when it finds nothing, word-prefix matching on names catches partial words like "mini".
  const byText = await run(db, q, "text");
  if (byText.total > 0) return byText;
  const byPrefix = await run(db, q, "regex");
  if (byPrefix.total > 0 || q.productIds) return byPrefix;
  // Last: Banglish and typo tolerant matching (search-index.ts), best match first.
  const ids = matchIndex(await catalogueIndex(db), normaliseQuery(q.text));
  if (ids.length === 0) return byPrefix;
  const rest: ListingQuery = { ...q };
  delete rest.text;
  const fuzzy = await run(db, { ...rest, productIds: ids, sort: q.sort && q.sort !== "relevance" ? q.sort : "new", page: 1, pageSize: ids.length }, "none");
  const rank = new Map(ids.map((id, i) => [id, i]));
  const ordered = q.sort && q.sort !== "relevance" ? fuzzy.items : [...fuzzy.items].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  const pageSize = q.pageSize ?? PAGE_SIZE;
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(q.page ?? 1)));
  return { ...fuzzy, items: ordered.slice((page - 1) * pageSize, page * pageSize), page, pageSize, pages: Math.max(1, Math.ceil(fuzzy.total / pageSize)) };
}

/** Published banners for one placement, inside their visibility window, newest first. */
export async function listPublishedBanners(db: Db, placement: BannerDoc["placement"], now = new Date(), limit = 4): Promise<BannerDoc[]> {
  return db
    .collection<BannerDoc>(BANNERS)
    .find({ placement, status: "published", ...visibleNow(now) })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
}

export interface CategoryShowcase {
  id: string;
  count: number;
  image?: { publicId: string; alt: LocalizedText };
}

/** Per top-level category: how many published products it holds (sub-categories included) and one real product photo. */
export async function categoryShowcase(db: Db, tree: CategoryTree): Promise<Map<string, CategoryShowcase>> {
  const out = new Map<string, CategoryShowcase>();
  await Promise.all(
    tree.roots.map(async (root) => {
      const ids = subtreeIds(root).map((id) => new ObjectId(id));
      const match = { status: "published" as const, categoryIds: { $in: ids } };
      const [count, withPhoto] = await Promise.all([
        db.collection(PRODUCTS).countDocuments(match),
        db.collection<ProductDoc>(PRODUCTS).findOne({ ...match, "media.0": { $exists: true } }, { sort: { publishedAt: 1, _id: 1 }, projection: { media: { $slice: 1 } } }),
      ]);
      const m = withPhoto?.media[0];
      out.set(root.id, { id: root.id, count, ...(m ? { image: { publicId: m.publicId, alt: m.alt } } : {}) });
    }),
  );
  return out;
}

export interface ProductPage {
  product: ProductDoc;
  variants: (VariantDoc & { available: number })[];
  primaryCategory: StoreCategory | null;
}

/** A published product by slug with its active priced variants (in position order) and their availability. */
export interface ProductCore {
  product: ProductDoc;
  /** Active, priced variants in position order, without stock. */
  variants: VariantDoc[];
}

/** The published product and its active variants (no stock): the part the public-data cache may hold. */
export async function publishedProductCore(db: Db, slug: string): Promise<ProductCore | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const product = await db.collection<ProductDoc>(PRODUCTS).findOne({ slug, status: "published" });
  if (!product) return null;
  const variants = await db
    .collection<VariantDoc>(VARIANTS)
    .find({ productId: product._id, status: "active", "price.amountMinor": { $gt: 0 } })
    .sort({ position: 1 })
    .toArray();
  if (variants.length === 0) return null;
  return { product, variants };
}

/** Adds the stored availability (always read live) to a product core. */
export async function productPageWithStock(db: Db, tree: CategoryTree, core: ProductCore): Promise<ProductPage> {
  const stock = await db
    .collection<{ variantId: ObjectId; available: number }>(STOCK)
    .find({ variantId: { $in: core.variants.map((v) => v._id) } }, { projection: { variantId: 1, available: 1 } })
    .toArray();
  const available = new Map(stock.map((s) => [String(s.variantId), s.available]));
  return {
    product: core.product,
    variants: core.variants.map((v) => ({ ...v, available: available.get(String(v._id)) ?? 0 })),
    primaryCategory: tree.byId.get(String(core.product.primaryCategoryId)) ?? null,
  };
}

export async function getPublishedProduct(db: Db, tree: CategoryTree, slug: string): Promise<ProductPage | null> {
  const core = await publishedProductCore(db, slug);
  return core ? productPageWithStock(db, tree, core) : null;
}

export const visibleNow = (now: Date): Document => ({
  $and: [{ $or: [{ visibleFrom: { $exists: false } }, { visibleFrom: { $lte: now } }] }, { $or: [{ visibleTo: { $exists: false } }, { visibleTo: { $gt: now } }] }],
});

/** The same rule as `visibleNow`, applied in memory (absent bound = open; anything but a Date = hidden, as in MongoDB). */
export function visibleAt(doc: { visibleFrom?: unknown; visibleTo?: unknown }, now: Date): boolean {
  const from = doc.visibleFrom;
  const to = doc.visibleTo;
  if (from !== undefined && !(from instanceof Date && from.getTime() <= now.getTime())) return false;
  if (to !== undefined && !(to instanceof Date && to.getTime() > now.getTime())) return false;
  return true;
}

/** Every published home section with its schedule, in display order (the cache applies `visibleAt`). */
export async function allPublishedHomeSections(db: Db, limit = 200): Promise<Document[]> {
  return db.collection(HOME_SECTIONS).find({ status: "published" }).sort({ order: 1, _id: 1 }).limit(limit).toArray();
}

export const toHomeSection = (d: Document): HomeSection => ({ id: String(d._id), type: String(d.type), data: d.data as Record<string, unknown> });

/** Every published banner with its schedule, newest first (the cache applies placement and `visibleAt`). */
export async function allPublishedBanners(db: Db, limit = 500): Promise<BannerDoc[]> {
  return db.collection<BannerDoc>(BANNERS).find({ status: "published" }).sort({ updatedAt: -1 }).limit(limit).toArray();
}

export async function listPublishedCollections(db: Db): Promise<CollectionDoc[]> {
  return db.collection<CollectionDoc>(COLLECTIONS).find({ status: "published" }).sort({ updatedAt: -1 }).limit(200).toArray();
}

export async function getPublishedCollection(db: Db, slug: string): Promise<CollectionDoc | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  return db.collection<CollectionDoc>(COLLECTIONS).findOne({ slug, status: "published" });
}

/** The listing query a collection stands for: manual = its product ids, rule = categories and price cap. */
export function collectionQuery(c: CollectionDoc, tree: CategoryTree): ListingQuery {
  if (c.kind === "manual") return { productIds: c.productIds.map(String) };
  const cats = (c.rule?.categoryIds ?? []).map((id) => tree.byId.get(String(id))).filter((x): x is StoreCategory => Boolean(x));
  return { categoryIds: cats.flatMap(subtreeIds), ...(c.rule?.priceMax ? { maxPrice: c.rule.priceMax } : {}) };
}

export type HomeSection = { id: string; type: string; data: Record<string, unknown> };

/** Published home sections visible now, in order. */
export async function listHomeSections(db: Db, now = new Date()): Promise<HomeSection[]> {
  const docs = await db
    .collection(HOME_SECTIONS)
    .find({ status: "published", ...visibleNow(now) })
    .sort({ order: 1, _id: 1 })
    .limit(30)
    .toArray();
  return docs.map(toHomeSection);
}

export async function getPublishedBanner(db: Db, id: string, now = new Date()): Promise<BannerDoc | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  return db.collection<BannerDoc>(BANNERS).findOne({ _id: new ObjectId(id), status: "published", ...visibleNow(now) });
}

/** Published product slugs and categories for the sitemap (bounded). */
export async function sitemapEntries(db: Db): Promise<{ products: { slug: string; updatedAt: Date }[]; collections: { slug: string; updatedAt: Date }[] }> {
  const [products, collections] = await Promise.all([
    db.collection<ProductDoc>(PRODUCTS).find({ status: "published" }, { projection: { slug: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).limit(20000).toArray(),
    db.collection<CollectionDoc>(COLLECTIONS).find({ status: "published" }, { projection: { slug: 1, updatedAt: 1 } }).limit(1000).toArray(),
  ]);
  return { products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })), collections: collections.map((c) => ({ slug: c.slug, updatedAt: c.updatedAt })) };
}
