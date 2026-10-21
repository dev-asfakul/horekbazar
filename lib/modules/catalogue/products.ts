// Product and variant service (SCHEMA.md → Product, Variant; domain-rules §5.2, §10).
// Rules enforced here (validators cannot express them):
// - the primary category is a leaf and is listed in categoryIds; every category exists;
// - slug and SKU are unique; a product slug is frozen once published, a SKU once stock has moved;
// - a compare-at price must be higher than the price (no fake discounts; genuineness is staff's duty);
// - publishing needs a published primary category and at least one active variant priced above zero;
//   a sample record (db:seed) can be published only in a `_dev` database;
// - every edit carries the version it was based on (optimistic concurrency) and is audited;
// - only never-published products without stock movements can be deleted; others are archived.
import { ObjectId, type ClientSession, type Db, type MongoClient } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { CatalogueError, defined, inTransaction, isDevelopmentDatabase, isDuplicateKey, toObjectId, unsetMissing, type Actor } from "./common.ts";
import {
  CATEGORIES,
  INVENTORY_LEDGER,
  PRODUCTS,
  STOCK,
  VARIANTS,
  type CategoryDoc,
  type LocalizedText,
  type Money,
  type ProductDoc,
  type StockDoc,
  type VariantDoc,
} from "./schema.ts";

const products = (db: Db) => db.collection<ProductDoc>(PRODUCTS);
const variants = (db: Db) => db.collection<VariantDoc>(VARIANTS);
const stock = (db: Db) => db.collection<StockDoc>(STOCK);
const actorOf = (actor: Actor) => ({ id: actor.id, role: actor.role });

export interface ProductInput {
  slug: string;
  name: LocalizedText;
  shortDescription?: LocalizedText | undefined;
  description?: LocalizedText | undefined;
  primaryCategoryId: string;
  categoryIds: string[];
  attributes: ProductDoc["attributes"];
  seo?: ProductDoc["seo"] | undefined;
  sample?: true | undefined;
}

const productSnapshot = (doc: Partial<ProductDoc>) => ({
  slug: doc.slug,
  name: doc.name,
  shortDescription: doc.shortDescription,
  description: doc.description,
  primaryCategoryId: doc.primaryCategoryId ? String(doc.primaryCategoryId) : undefined,
  categoryIds: doc.categoryIds?.map(String),
  attributes: doc.attributes,
  seo: doc.seo,
  status: doc.status,
});

async function checkCategories(db: Db, session: ClientSession, primary: ObjectId, all: ObjectId[]) {
  const ids = [...new Map([primary, ...all].map((id) => [String(id), id])).values()];
  const found = await db.collection<CategoryDoc>(CATEGORIES).find({ _id: { $in: ids } }, { session, projection: { _id: 1 } }).toArray();
  if (found.length !== ids.length) throw new CatalogueError("category_not_found");
  if (await db.collection(CATEGORIES).findOne({ parentId: primary }, { session, projection: { _id: 1 } })) throw new CatalogueError("category_not_leaf");
  return ids;
}

// ── Queries ─────────────────────────────────────────────────────────────────────────────────

export interface ProductListQuery {
  q?: string | undefined;
  status?: ProductDoc["status"] | undefined;
  categoryId?: string | undefined;
  sample?: boolean | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listProducts(db: Db, query: ProductListQuery = {}) {
  const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.categoryId && ObjectId.isValid(query.categoryId)) filter.categoryIds = new ObjectId(query.categoryId);
  if (query.sample !== undefined) filter.sample = query.sample ? true : { $exists: false };
  const q = query.q?.trim().slice(0, 80);
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    const skuMatches = await variants(db).find({ sku: re }, { projection: { productId: 1 } }).limit(200).toArray();
    filter.$or = [{ "name.bn": re }, { "name.en": re }, { slug: re }, { _id: { $in: skuMatches.map((v) => v.productId) } }];
  }
  const [total, items] = await Promise.all([
    products(db).countDocuments(filter),
    products(db).find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
  ]);
  const ids = items.map((p) => p._id);
  const vs = ids.length ? await variants(db).find({ productId: { $in: ids } }, { projection: { productId: 1, price: 1, status: 1 } }).toArray() : [];
  const summary = new Map<string, { variants: number; minPrice: number | null }>();
  for (const v of vs) {
    const key = String(v.productId);
    const s = summary.get(key) ?? { variants: 0, minPrice: null };
    if (v.status === "active") {
      s.variants += 1;
      s.minPrice = s.minPrice === null ? v.price.amountMinor : Math.min(s.minPrice, v.price.amountMinor);
    }
    summary.set(key, s);
  }
  return { items: items.map((p) => ({ product: p, ...(summary.get(String(p._id)) ?? { variants: 0, minPrice: null }) })), total, page, pageSize };
}

export async function getProduct(db: Db, id: string) {
  const product = await products(db).findOne({ _id: toObjectId(id) });
  if (!product) return null;
  const vs = await variants(db).find({ productId: product._id }).sort({ position: 1, sku: 1 }).toArray();
  const st = vs.length ? await stock(db).find({ variantId: { $in: vs.map((v) => v._id) } }).toArray() : [];
  const byVariant = new Map(st.map((s) => [String(s.variantId), s]));
  return { product, variants: vs.map((v) => ({ variant: v, stock: byVariant.get(String(v._id)) ?? null })) };
}

// ── Products ────────────────────────────────────────────────────────────────────────────────

export async function createProduct(db: Db, client: MongoClient, actor: Actor, input: ProductInput): Promise<ObjectId> {
  const primary = toObjectId(input.primaryCategoryId);
  return inTransaction(client, async (session) => {
    if (await products(db).findOne({ slug: input.slug }, { session, projection: { _id: 1 } })) throw new CatalogueError("slug_taken");
    const categoryIds = await checkCategories(db, session, primary, input.categoryIds.map(toObjectId));
    const now = new Date();
    const doc = defined({
      slug: input.slug,
      name: input.name,
      shortDescription: input.shortDescription,
      description: input.description,
      primaryCategoryId: primary,
      categoryIds,
      attributes: input.attributes,
      media: [],
      status: "draft" as const,
      seo: input.seo,
      sample: input.sample,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }) as Omit<ProductDoc, "_id">;
    try {
      const { insertedId } = await products(db).insertOne(doc as ProductDoc, { session });
      await recordAudit(db, { actor: actorOf(actor), action: "product.created", target: { type: "product", id: String(insertedId) }, after: productSnapshot(doc), ip: actor.ip ?? null }, { session, now });
      return insertedId;
    } catch (error) {
      if (isDuplicateKey(error)) throw new CatalogueError("slug_taken");
      throw error;
    }
  });
}

export type ProductPatch = Omit<ProductInput, "sample">;

export async function updateProduct(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, patch: ProductPatch) {
  const _id = toObjectId(id);
  const primary = toObjectId(patch.primaryCategoryId);
  return inTransaction(client, async (session) => {
    const before = await products(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (patch.slug !== before.slug) {
      if (before.publishedAt) throw new CatalogueError("slug_locked");
      if (await products(db).findOne({ slug: patch.slug, _id: { $ne: _id } }, { session, projection: { _id: 1 } })) throw new CatalogueError("slug_taken");
    }
    const categoryIds = await checkCategories(db, session, primary, patch.categoryIds.map(toObjectId));
    if (before.status === "published") {
      const cat = await db.collection<CategoryDoc>(CATEGORIES).findOne({ _id: primary }, { session, projection: { status: 1 } });
      if (cat?.status !== "published") throw new CatalogueError("category_unpublished");
    }
    const now = new Date();
    const set = defined({
      slug: patch.slug,
      name: patch.name,
      shortDescription: patch.shortDescription,
      description: patch.description,
      primaryCategoryId: primary,
      categoryIds,
      attributes: patch.attributes,
      seo: patch.seo,
      updatedAt: now,
    });
    const result = await products(db).updateOne({ _id, version: expectedVersion }, { $set: set, $inc: { version: 1 }, ...unsetMissing(patch, ["shortDescription", "description", "seo"]) }, { session });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: "product.updated", target: { type: "product", id }, before: productSnapshot(before), after: productSnapshot({ ...before, ...set }), ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

export async function setProductStatus(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, status: ProductDoc["status"]) {
  const _id = toObjectId(id);
  return inTransaction(client, async (session) => {
    const before = await products(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (before.status === status) return before.version;
    if (status === "published") {
      if (before.sample && !isDevelopmentDatabase(db)) throw new CatalogueError("sample_publish_blocked");
      const cat = await db.collection<CategoryDoc>(CATEGORIES).findOne({ _id: before.primaryCategoryId }, { session, projection: { status: 1 } });
      if (cat?.status !== "published") throw new CatalogueError("category_unpublished");
      const sellable = await variants(db).findOne({ productId: _id, status: "active", "price.amountMinor": { $gt: 0 } }, { session, projection: { _id: 1 } });
      if (!sellable) throw new CatalogueError("no_sellable_variant");
    }
    const now = new Date();
    const result = await products(db).updateOne(
      { _id, version: expectedVersion },
      { $set: { status, updatedAt: now, ...(status === "published" && !before.publishedAt ? { publishedAt: now } : {}) }, $inc: { version: 1 } },
      { session },
    );
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: `product.${status}`, target: { type: "product", id }, before: { status: before.status }, after: { status }, ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

/** Deletes a never-published product whose variants never moved stock; everything else is archived. */
export async function deleteProduct(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number) {
  const _id = toObjectId(id);
  await inTransaction(client, async (session) => {
    const before = await products(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (before.publishedAt) throw new CatalogueError("in_use");
    const ids = (await variants(db).find({ productId: _id }, { session, projection: { _id: 1 } }).toArray()).map((v) => v._id);
    if (ids.length && (await db.collection(INVENTORY_LEDGER).findOne({ variantId: { $in: ids } }, { session, projection: { _id: 1 } }))) throw new CatalogueError("in_use");
    await stock(db).deleteMany({ variantId: { $in: ids } }, { session });
    await variants(db).deleteMany({ productId: _id }, { session });
    await products(db).deleteOne({ _id }, { session });
    await recordAudit(db, { actor: actorOf(actor), action: "product.deleted", target: { type: "product", id }, before: { ...productSnapshot(before), variants: ids.length }, ip: actor.ip ?? null }, { session });
  });
}

export async function addProductMedia(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, media: ProductDoc["media"][number]) {
  const _id = toObjectId(id);
  return inTransaction(client, async (session) => {
    const before = await products(db).findOne({ _id }, { session, projection: { media: 1, version: 1 } });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (before.media.length >= 12) throw new CatalogueError("invalid");
    const now = new Date();
    const result = await products(db).updateOne({ _id, version: expectedVersion }, { $push: { media }, $set: { updatedAt: now }, $inc: { version: 1 } }, { session });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: "product.media_added", target: { type: "product", id }, after: { publicId: media.publicId, rights: media.rights }, ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

export async function removeProductMedia(db: Db, client: MongoClient, actor: Actor, id: string, expectedVersion: number, publicId: string) {
  const _id = toObjectId(id);
  return inTransaction(client, async (session) => {
    const now = new Date();
    const result = await products(db).updateOne({ _id, version: expectedVersion }, { $pull: { media: { publicId } }, $set: { updatedAt: now }, $inc: { version: 1 } }, { session });
    if (result.matchedCount !== 1) {
      const current = await products(db).findOne({ _id }, { session, projection: { version: 1 } });
      throw new CatalogueError(current ? "version_conflict" : "not_found");
    }
    await recordAudit(db, { actor: actorOf(actor), action: "product.media_removed", target: { type: "product", id }, before: { publicId }, ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

// ── Variants ────────────────────────────────────────────────────────────────────────────────

export interface VariantInput {
  sku: string;
  title: LocalizedText;
  options: VariantDoc["options"];
  netQuantity?: VariantDoc["netQuantity"] | undefined;
  price: Money;
  compareAt?: Money | undefined;
  barcode?: string | undefined;
  weightGrams?: number | undefined;
  position: number;
  sample?: true | undefined;
}

function checkPrices(input: Pick<VariantInput, "price" | "compareAt">) {
  if (input.compareAt && input.compareAt.amountMinor <= input.price.amountMinor) throw new CatalogueError("compare_at_not_higher");
}

const variantSnapshot = (v: Partial<VariantDoc>) => ({
  sku: v.sku,
  title: v.title,
  options: v.options,
  netQuantity: v.netQuantity,
  price: v.price,
  compareAt: v.compareAt,
  barcode: v.barcode,
  weightGrams: v.weightGrams,
  position: v.position,
  status: v.status,
});

/** Creates the variant and its zero `stock` document in one transaction. */
export async function createVariant(db: Db, client: MongoClient, actor: Actor, productId: string, input: VariantInput): Promise<ObjectId> {
  const pid = toObjectId(productId);
  checkPrices(input);
  return inTransaction(client, async (session) => {
    if (!(await products(db).findOne({ _id: pid }, { session, projection: { _id: 1 } }))) throw new CatalogueError("not_found");
    if (await variants(db).findOne({ sku: input.sku }, { session, projection: { _id: 1 } })) throw new CatalogueError("sku_taken");
    const now = new Date();
    const doc = defined({
      productId: pid,
      sku: input.sku,
      title: input.title,
      options: input.options,
      netQuantity: input.netQuantity,
      price: input.price,
      compareAt: input.compareAt,
      barcode: input.barcode,
      weightGrams: input.weightGrams,
      position: input.position,
      status: "active" as const,
      sample: input.sample,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }) as Omit<VariantDoc, "_id">;
    try {
      const { insertedId } = await variants(db).insertOne(doc as VariantDoc, { session });
      await stock(db).insertOne({ variantId: insertedId, onHand: 0, reserved: 0, available: 0, lowStockThreshold: 5, version: 1, updatedAt: now } as StockDoc, { session });
      await recordAudit(db, { actor: actorOf(actor), action: "variant.created", target: { type: "variant", id: String(insertedId) }, after: { productId, ...variantSnapshot(doc) }, ip: actor.ip ?? null }, { session, now });
      return insertedId;
    } catch (error) {
      if (isDuplicateKey(error)) throw new CatalogueError("sku_taken");
      throw error;
    }
  });
}

export type VariantPatch = Omit<VariantInput, "sample">;

export async function updateVariant(db: Db, client: MongoClient, actor: Actor, variantId: string, expectedVersion: number, patch: VariantPatch) {
  const _id = toObjectId(variantId);
  checkPrices(patch);
  return inTransaction(client, async (session) => {
    const before = await variants(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (patch.sku !== before.sku) {
      if (await db.collection(INVENTORY_LEDGER).findOne({ variantId: _id }, { session, projection: { _id: 1 } })) throw new CatalogueError("in_use");
      if (await variants(db).findOne({ sku: patch.sku, _id: { $ne: _id } }, { session, projection: { _id: 1 } })) throw new CatalogueError("sku_taken");
    }
    if (patch.price.amountMinor === 0 && before.status === "active") await assertOtherSellable(db, session, before);
    const now = new Date();
    const set = defined({ ...patch, updatedAt: now });
    const result = await variants(db).updateOne({ _id, version: expectedVersion }, { $set: set, $inc: { version: 1 }, ...unsetMissing(patch, ["netQuantity", "compareAt", "barcode", "weightGrams"]) }, { session });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: "variant.updated", target: { type: "variant", id: variantId }, before: variantSnapshot(before), after: variantSnapshot({ ...before, ...patch }), ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}

/** A published product must keep at least one active variant priced above zero. */
async function assertOtherSellable(db: Db, session: ClientSession, variant: VariantDoc) {
  const product = await products(db).findOne({ _id: variant.productId }, { session, projection: { status: 1 } });
  if (product?.status !== "published") return;
  const other = await variants(db).findOne({ productId: variant.productId, _id: { $ne: variant._id }, status: "active", "price.amountMinor": { $gt: 0 } }, { session, projection: { _id: 1 } });
  if (!other) throw new CatalogueError("no_sellable_variant");
}

export async function setVariantStatus(db: Db, client: MongoClient, actor: Actor, variantId: string, expectedVersion: number, status: VariantDoc["status"]) {
  const _id = toObjectId(variantId);
  return inTransaction(client, async (session) => {
    const before = await variants(db).findOne({ _id }, { session });
    if (!before) throw new CatalogueError("not_found");
    if (before.version !== expectedVersion) throw new CatalogueError("version_conflict", { current: before.version });
    if (before.status === status) return before.version;
    if (status === "archived") await assertOtherSellable(db, session, before);
    const now = new Date();
    const result = await variants(db).updateOne({ _id, version: expectedVersion }, { $set: { status, updatedAt: now }, $inc: { version: 1 } }, { session });
    if (result.matchedCount !== 1) throw new CatalogueError("version_conflict");
    await recordAudit(db, { actor: actorOf(actor), action: `variant.${status}`, target: { type: "variant", id: variantId }, before: { status: before.status }, after: { status }, ip: actor.ip ?? null }, { session, now });
    return expectedVersion + 1;
  });
}
