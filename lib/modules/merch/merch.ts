// Merchandising service: collections (manual product lists), homepage sections (six types) and
// banners. Capability `merch.write` is checked by the caller. Rules: every reference exists; a
// section can be published only when what it shows (collection, banner) is published; a collection
// or banner used by a section cannot be deleted; `visibleTo` is after `visibleFrom`; every edit is
// a version compare-and-set and is audited.
import { ObjectId, type Db, type Filter } from "mongodb";
import { recordAudit } from "../platform/audit.ts";
import { CatalogueError, defined, isDuplicateKey, toObjectId, unsetMissing, type Actor } from "../catalogue/common.ts";
import { CATEGORIES, PRODUCTS, type LocalizedText } from "../catalogue/schema.ts";
import { BANNERS, COLLECTIONS, HOME_SECTIONS, bannerSchema, collectionSchema, homeSectionSchema, type BannerDoc, type CollectionDoc, type HomeSectionDoc } from "./schema.ts";

const audit = (db: Db, actor: Actor, action: string, type: string, id: string, before?: Record<string, unknown>, after?: Record<string, unknown>) =>
  recordAudit(db, { actor: { id: actor.id, role: actor.role }, action, target: { type, id }, ...(before ? { before } : {}), ...(after ? { after } : {}), ip: actor.ip ?? null });

async function assertAllExist(db: Db, collection: string, ids: ObjectId[], code: "not_found" | "category_not_found" = "not_found") {
  const unique = [...new Map(ids.map((id) => [String(id), id])).values()];
  if (unique.length === 0) return unique;
  const count = await db.collection(collection).countDocuments({ _id: { $in: unique } });
  if (count !== unique.length) throw new CatalogueError(code);
  return unique;
}

function checkWindow(from?: Date, to?: Date) {
  if (from && to && to.getTime() <= from.getTime()) throw new CatalogueError("invalid", { field: "visibleTo" });
}

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[] }[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CatalogueError("invalid", { issues: result.error.issues.map((i) => i.path.join(".")) });
  return result.data;
}

async function casUpdate<T extends { _id: ObjectId; version: number }>(db: Db, name: string, id: ObjectId, expectedVersion: number, update: Record<string, unknown>) {
  const result = await db.collection<T>(name).updateOne({ _id: id, version: expectedVersion } as Filter<T>, { ...update, $inc: { version: 1 } } as never);
  if (result.matchedCount !== 1) {
    const exists = await db.collection<T>(name).findOne({ _id: id } as Filter<T>, { projection: { _id: 1 } });
    throw new CatalogueError(exists ? "version_conflict" : "not_found");
  }
  return expectedVersion + 1;
}

// ── Collections ─────────────────────────────────────────────────────────────────────────────

export interface CollectionInput {
  slug: string;
  name: LocalizedText;
  description?: LocalizedText | undefined;
  productIds: string[];
  seo?: CollectionDoc["seo"] | undefined;
}

export const listCollections = (db: Db) => db.collection<CollectionDoc>(COLLECTIONS).find({}).sort({ updatedAt: -1 }).toArray();
export const getCollection = (db: Db, id: string) => db.collection<CollectionDoc>(COLLECTIONS).findOne({ _id: toObjectId(id) });

export async function createCollection(db: Db, actor: Actor, input: CollectionInput) {
  const productIds = await assertAllExist(db, PRODUCTS, input.productIds.map(toObjectId));
  const now = new Date();
  const doc = parseOrThrow(collectionSchema, defined({ _id: new ObjectId(), slug: input.slug, name: input.name, description: input.description, kind: "manual", productIds, status: "draft", seo: input.seo, version: 1, createdAt: now, updatedAt: now }));
  try {
    await db.collection<CollectionDoc>(COLLECTIONS).insertOne(doc);
  } catch (error) {
    if (isDuplicateKey(error)) throw new CatalogueError("slug_taken");
    throw error;
  }
  await audit(db, actor, "collection.created", "collection", String(doc._id), undefined, { slug: doc.slug, products: productIds.length });
  return doc._id;
}

export async function updateCollection(db: Db, actor: Actor, id: string, expectedVersion: number, input: CollectionInput) {
  const _id = toObjectId(id);
  const productIds = await assertAllExist(db, PRODUCTS, input.productIds.map(toObjectId));
  const before = await getCollection(db, id);
  if (!before) throw new CatalogueError("not_found");
  if (input.slug !== before.slug && before.status === "published") throw new CatalogueError("slug_locked");
  const set = defined({ slug: input.slug, name: input.name, description: input.description, productIds, seo: input.seo, updatedAt: new Date() });
  parseOrThrow(collectionSchema, { ...before, ...set });
  try {
    const next = await casUpdate<CollectionDoc>(db, COLLECTIONS, _id, expectedVersion, { $set: set, ...unsetMissing(input, ["description", "seo"]) });
    await audit(db, actor, "collection.updated", "collection", id, { slug: before.slug, products: before.productIds.length }, { slug: input.slug, products: productIds.length });
    return next;
  } catch (error) {
    if (isDuplicateKey(error)) throw new CatalogueError("slug_taken");
    throw error;
  }
}

export async function setCollectionStatus(db: Db, actor: Actor, id: string, expectedVersion: number, status: CollectionDoc["status"]) {
  const _id = toObjectId(id);
  if (status === "draft" && (await db.collection(HOME_SECTIONS).findOne({ status: "published", $or: [{ "data.collectionId": _id }, { "data.collectionIds": _id }] }, { projection: { _id: 1 } }))) {
    throw new CatalogueError("in_use");
  }
  const next = await casUpdate<CollectionDoc>(db, COLLECTIONS, _id, expectedVersion, { $set: { status, updatedAt: new Date() } });
  await audit(db, actor, `collection.${status}`, "collection", id, undefined, { status });
  return next;
}

export async function deleteCollection(db: Db, actor: Actor, id: string, expectedVersion: number) {
  const _id = toObjectId(id);
  if (await db.collection(HOME_SECTIONS).findOne({ $or: [{ "data.collectionId": _id }, { "data.collectionIds": _id }] }, { projection: { _id: 1 } })) throw new CatalogueError("in_use");
  const result = await db.collection<CollectionDoc>(COLLECTIONS).findOneAndDelete({ _id, version: expectedVersion });
  if (!result) throw new CatalogueError((await getCollection(db, id)) ? "version_conflict" : "not_found");
  await audit(db, actor, "collection.deleted", "collection", id, { slug: result.slug });
}

// ── Banners ─────────────────────────────────────────────────────────────────────────────────

export type BannerInput = Pick<BannerDoc, "image" | "alt" | "placement"> & { href?: string | undefined; visibleFrom?: Date | undefined; visibleTo?: Date | undefined };

export const listBanners = (db: Db) => db.collection<BannerDoc>(BANNERS).find({}).sort({ placement: 1, updatedAt: -1 }).toArray();
export const getBanner = (db: Db, id: string) => db.collection<BannerDoc>(BANNERS).findOne({ _id: toObjectId(id) });

export async function createBanner(db: Db, actor: Actor, input: BannerInput) {
  checkWindow(input.visibleFrom, input.visibleTo);
  const now = new Date();
  const doc = parseOrThrow(bannerSchema, defined({ _id: new ObjectId(), ...input, status: "draft", version: 1, createdAt: now, updatedAt: now }));
  await db.collection<BannerDoc>(BANNERS).insertOne(doc);
  await audit(db, actor, "banner.created", "banner", String(doc._id), undefined, { placement: doc.placement, image: doc.image.publicId, rights: doc.image.rights });
  return doc._id;
}

export async function updateBanner(db: Db, actor: Actor, id: string, expectedVersion: number, input: BannerInput) {
  checkWindow(input.visibleFrom, input.visibleTo);
  const before = await getBanner(db, id);
  if (!before) throw new CatalogueError("not_found");
  const set = defined({ ...input, updatedAt: new Date() });
  parseOrThrow(bannerSchema, { ...before, ...set });
  const next = await casUpdate<BannerDoc>(db, BANNERS, before._id, expectedVersion, { $set: set, ...unsetMissing(input, ["href", "visibleFrom", "visibleTo"]) });
  await audit(db, actor, "banner.updated", "banner", id, { placement: before.placement, href: before.href }, { placement: input.placement, href: input.href });
  return next;
}

export async function setBannerStatus(db: Db, actor: Actor, id: string, expectedVersion: number, status: BannerDoc["status"]) {
  const _id = toObjectId(id);
  if (status !== "published" && (await db.collection(HOME_SECTIONS).findOne({ status: "published", "data.bannerId": _id }, { projection: { _id: 1 } }))) throw new CatalogueError("in_use");
  const next = await casUpdate<BannerDoc>(db, BANNERS, _id, expectedVersion, { $set: { status, updatedAt: new Date() } });
  await audit(db, actor, `banner.${status}`, "banner", id, undefined, { status });
  return next;
}

export async function deleteBanner(db: Db, actor: Actor, id: string, expectedVersion: number) {
  const _id = toObjectId(id);
  if (await db.collection(HOME_SECTIONS).findOne({ "data.bannerId": _id }, { projection: { _id: 1 } })) throw new CatalogueError("in_use");
  const result = await db.collection<BannerDoc>(BANNERS).findOneAndDelete({ _id, version: expectedVersion });
  if (!result) throw new CatalogueError((await getBanner(db, id)) ? "version_conflict" : "not_found");
  await audit(db, actor, "banner.deleted", "banner", id, { placement: result.placement, image: result.image.publicId });
}

// ── Homepage sections ───────────────────────────────────────────────────────────────────────

type SectionOf<T extends HomeSectionDoc["type"]> = Extract<HomeSectionDoc, { type: T }>;
type SectionShape = { [T in HomeSectionDoc["type"]]: { type: T; data: SectionOf<T>["data"] } }[HomeSectionDoc["type"]];
export type HomeSectionInput = { [T in HomeSectionDoc["type"]]: { type: T; data: SectionOf<T>["data"]; order: number; visibleFrom?: Date | undefined; visibleTo?: Date | undefined } }[HomeSectionDoc["type"]];

export const listHomeSections = (db: Db) => db.collection<HomeSectionDoc>(HOME_SECTIONS).find({}).sort({ order: 1, _id: 1 }).toArray();
export const getHomeSection = (db: Db, id: string) => db.collection<HomeSectionDoc>(HOME_SECTIONS).findOne({ _id: toObjectId(id) });

async function checkReferences(db: Db, section: SectionShape) {
  switch (section.type) {
    case "categoryTiles":
      await assertAllExist(db, CATEGORIES, section.data.categoryIds, "category_not_found");
      break;
    case "productRail":
      await assertAllExist(db, COLLECTIONS, [section.data.collectionId]);
      break;
    case "collectionGrid":
      await assertAllExist(db, COLLECTIONS, section.data.collectionIds);
      break;
    case "banner":
      await assertAllExist(db, BANNERS, [section.data.bannerId]);
      break;
    default:
      break;
  }
}

/** A published section shows only published things (no empty or hidden placeholders on the homepage). */
async function checkPublishable(db: Db, section: SectionShape) {
  const unpublished = async (name: string, ids: ObjectId[], visible: string) => (await db.collection(name).countDocuments({ _id: { $in: ids }, status: visible })) !== ids.length;
  if (section.type === "productRail" && (await unpublished(COLLECTIONS, [section.data.collectionId], "published"))) throw new CatalogueError("parent_unpublished");
  if (section.type === "collectionGrid" && (await unpublished(COLLECTIONS, section.data.collectionIds, "published"))) throw new CatalogueError("parent_unpublished");
  if (section.type === "banner" && (await unpublished(BANNERS, [section.data.bannerId], "published"))) throw new CatalogueError("parent_unpublished");
  if (section.type === "categoryTiles" && (await unpublished(CATEGORIES, section.data.categoryIds, "published"))) throw new CatalogueError("category_unpublished");
}

export async function createHomeSection(db: Db, actor: Actor, input: HomeSectionInput) {
  checkWindow(input.visibleFrom, input.visibleTo);
  const now = new Date();
  const doc = parseOrThrow(homeSectionSchema, defined({ _id: new ObjectId(), ...input, status: "draft", version: 1, createdAt: now, updatedAt: now }));
  await checkReferences(db, doc);
  await db.collection<HomeSectionDoc>(HOME_SECTIONS).insertOne(doc);
  await audit(db, actor, "home_section.created", "homeSection", String(doc._id), undefined, { type: doc.type, order: doc.order });
  return doc._id;
}

export async function updateHomeSection(db: Db, actor: Actor, id: string, expectedVersion: number, input: HomeSectionInput) {
  checkWindow(input.visibleFrom, input.visibleTo);
  const before = await getHomeSection(db, id);
  if (!before) throw new CatalogueError("not_found");
  if (before.type !== input.type) throw new CatalogueError("invalid", { field: "type" });
  const set = defined({ data: input.data, order: input.order, visibleFrom: input.visibleFrom, visibleTo: input.visibleTo, updatedAt: new Date() });
  const merged = parseOrThrow(homeSectionSchema, { ...before, ...set });
  await checkReferences(db, merged);
  if (before.status === "published") await checkPublishable(db, merged);
  const next = await casUpdate<HomeSectionDoc>(db, HOME_SECTIONS, before._id, expectedVersion, { $set: set, ...unsetMissing(input, ["visibleFrom", "visibleTo"]) });
  await audit(db, actor, "home_section.updated", "homeSection", id, { order: before.order }, { order: input.order });
  return next;
}

export async function setHomeSectionStatus(db: Db, actor: Actor, id: string, expectedVersion: number, status: HomeSectionDoc["status"]) {
  const before = await getHomeSection(db, id);
  if (!before) throw new CatalogueError("not_found");
  if (status === "published") await checkPublishable(db, before);
  const next = await casUpdate<HomeSectionDoc>(db, HOME_SECTIONS, before._id, expectedVersion, { $set: { status, updatedAt: new Date() } });
  await audit(db, actor, `home_section.${status}`, "homeSection", id, { status: before.status }, { status });
  return next;
}

export async function deleteHomeSection(db: Db, actor: Actor, id: string, expectedVersion: number) {
  const result = await db.collection<HomeSectionDoc>(HOME_SECTIONS).findOneAndDelete({ _id: toObjectId(id), version: expectedVersion });
  if (!result) throw new CatalogueError((await getHomeSection(db, id)) ? "version_conflict" : "not_found");
  await audit(db, actor, "home_section.deleted", "homeSection", id, { type: result.type });
}
