// B4 settings, delivery zones and merchandising against a real replica set: versioned singleton,
// accent contrast gate, zones without area mapping (D12), collections, the six homepage section
// types with reference and publish rules, and banners limited to internal links.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import { CatalogueError, type Actor } from "@/lib/modules/catalogue/common";
import { createProduct } from "@/lib/modules/catalogue/products";
import {
  createBanner,
  createCollection,
  createHomeSection,
  deleteBanner,
  deleteCollection,
  deleteHomeSection,
  getCollection,
  getHomeSection,
  setBannerStatus,
  setCollectionStatus,
  setHomeSectionStatus,
  updateCollection,
  updateHomeSection,
} from "@/lib/modules/merch/merch";
import { DEFAULT_SETTINGS } from "@/lib/modules/settings/schema";
import { accentContrast, getSettings, removeDeliveryZone, updateGeneralSettings, upsertDeliveryZone } from "@/lib/modules/settings/settings";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "store_manager" };
const code = (promise: Promise<unknown>) => promise.then(() => "ok", (e: unknown) => (e instanceof CatalogueError ? e.code : `unexpected: ${String(e)}`));

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
});
afterAll(async () => cleanup());

const general = (accent = "#1E4E9C") => ({
  store: { name: { bn: "হরেকবাজার", en: "HorekBazar" }, contact: {} },
  theme: { fontPreset: "khata" as const, accent },
  locale: { default: "bn" as const, numerals: "bengali" as const, grouping: "south_asian" as const },
  pricing: { roundingUnit: 100 },
  features: { wishlist: false, brands: false, reviews: false },
});

describe("settings", () => {
  it("reads defaults before the first save and never invents delivery zones", async () => {
    const s = await getSettings(db);
    expect(s.version).toBe(0);
    expect(s.delivery.zones).toEqual([]);
    expect(await db.collection("settings").countDocuments()).toBe(0);
    expect(accentContrast(DEFAULT_SETTINGS.theme.accent).ok).toBe(true);
  });

  it("first save creates version 1; a concurrent first save and a stale version conflict", async () => {
    const results = await Promise.all([code(updateGeneralSettings(db, actor, 0, general())), code(updateGeneralSettings(db, actor, 0, general()))]);
    expect(results.sort()).toEqual(["ok", "version_conflict"]);
    expect((await getSettings(db)).version).toBe(1);
    expect(await code(updateGeneralSettings(db, actor, 0, general()))).toBe("version_conflict");
    expect(await db.collection("auditLog").countDocuments({ action: "settings.updated" })).toBe(1);
  });

  it("saves an accent only at 4.5:1 against white and the page background", async () => {
    const v = (await getSettings(db)).version;
    expect(await code(updateGeneralSettings(db, actor, v, general("#F5C518")))).toBe("invalid"); // yellow on white fails
    expect(await code(updateGeneralSettings(db, actor, v, general("#1f6b3a")))).toBe("ok");
    expect((await getSettings(db)).theme.accent).toBe("#1F6B3A");
  });

  it("adds, replaces and removes delivery zones; area mapping waits for D12", async () => {
    let v = (await getSettings(db)).version;
    const zone = { id: "inside-dhaka", name: { bn: "ঢাকার ভেতরে", en: "Inside Dhaka" }, fee: { amountMinor: 6000, currency: "BDT" as const }, estimate: { bn: "১–২ দিন" }, areas: [], enabled: true };
    v = await upsertDeliveryZone(db, actor, v, zone);
    v = await upsertDeliveryZone(db, actor, v, { ...zone, fee: { amountMinor: 7000, currency: "BDT" } });
    expect((await getSettings(db)).delivery.zones).toHaveLength(1);
    expect((await getSettings(db)).delivery.zones[0]!.fee.amountMinor).toBe(7000);
    expect(await code(upsertDeliveryZone(db, actor, v, { ...zone, id: "outside", areas: ["BD-13"] as never }))).toBe("invalid");
    v = await removeDeliveryZone(db, actor, v, "inside-dhaka");
    expect((await getSettings(db)).delivery.zones).toEqual([]);
    expect(await code(removeDeliveryZone(db, actor, v, "inside-dhaka"))).toBe("not_found");
  });
});

describe("merchandising", () => {
  let productId: string;
  let categoryId: string;
  beforeAll(async () => {
    categoryId = String(await createCategory(db, client, actor, { slug: "grocery", parentId: null, name: { bn: "মুদি" }, position: 1 }));
    productId = String(await createProduct(db, client, actor, { slug: "miniket-rice", name: { bn: "মিনিকেট চাল" }, primaryCategoryId: categoryId, categoryIds: [categoryId], attributes: [] }));
  });

  it("collections reference existing products and have unique slugs", async () => {
    expect(await code(createCollection(db, actor, { slug: "staples", name: { bn: "নিত্যপণ্য" }, productIds: [String(new ObjectId())] }))).toBe("not_found");
    const id = String(await createCollection(db, actor, { slug: "staples", name: { bn: "নিত্যপণ্য" }, productIds: [productId, productId] }));
    expect((await getCollection(db, id))!.productIds).toHaveLength(1);
    expect(await code(createCollection(db, actor, { slug: "staples", name: { bn: "আবার" }, productIds: [] }))).toBe("slug_taken");
    expect(await code(updateCollection(db, actor, id, 9, { slug: "staples", name: { bn: "নিত্যপণ্য" }, productIds: [] }))).toBe("version_conflict");
  });

  it("a product rail can be published only when its collection is, and pins the collection", async () => {
    const collectionId = String(await createCollection(db, actor, { slug: "rail", name: { bn: "রেল" }, productIds: [productId] }));
    const sectionId = String(await createHomeSection(db, actor, { type: "productRail", order: 2, data: { title: { bn: "চাল" }, collectionId: new ObjectId(collectionId) } }));
    expect(await code(setHomeSectionStatus(db, actor, sectionId, 1, "published"))).toBe("parent_unpublished");
    await setCollectionStatus(db, actor, collectionId, 1, "published");
    expect(await code(setHomeSectionStatus(db, actor, sectionId, 1, "published"))).toBe("ok");
    expect(await code(setCollectionStatus(db, actor, collectionId, 2, "draft"))).toBe("in_use");
    expect(await code(deleteCollection(db, actor, collectionId, 2))).toBe("in_use");
    await deleteHomeSection(db, actor, sectionId, 2);
    expect(await code(deleteCollection(db, actor, collectionId, 2))).toBe("ok");
  });

  it("validates each of the six section types, references and the visibility window", async () => {
    const ok = [
      { type: "hero" as const, order: 0, data: { title: { bn: "স্বাগতম" }, href: "/c/grocery" } },
      { type: "richText" as const, order: 5, data: { body: { bn: "নিরাপদ ডেলিভারি" } } },
      { type: "categoryTiles" as const, order: 1, data: { categoryIds: [new ObjectId(categoryId)] } },
    ];
    for (const s of ok) expect(await code(createHomeSection(db, actor, s))).toBe("ok");
    expect(await code(createHomeSection(db, actor, { type: "categoryTiles", order: 1, data: { categoryIds: [new ObjectId()] } }))).toBe("category_not_found");
    expect(await code(createHomeSection(db, actor, { type: "collectionGrid", order: 3, data: { collectionIds: [new ObjectId()] } }))).toBe("not_found");
    expect(await code(createHomeSection(db, actor, { type: "banner", order: 4, data: { bannerId: new ObjectId() } }))).toBe("not_found");
    expect(await code(createHomeSection(db, actor, { type: "hero", order: 0, data: { title: { bn: "x" }, href: "https://evil.example" } }))).toBe("invalid");
    expect(await code(createHomeSection(db, actor, { type: "hero", order: 0, data: { title: { bn: "x" }, href: "//evil.example" } }))).toBe("invalid");
    const from = new Date("2026-11-01T00:00:00Z");
    expect(await code(createHomeSection(db, actor, { type: "richText", order: 6, data: { body: { bn: "x" } }, visibleFrom: from, visibleTo: from }))).toBe("invalid");
    // Category tiles are publishable only when every category is published.
    const tiles = (await db.collection("homeSections").findOne({ type: "categoryTiles" }))!;
    expect(await code(setHomeSectionStatus(db, actor, String(tiles._id), 1, "published"))).toBe("category_unpublished");
    await setCategoryStatus(db, client, actor, categoryId, 1, "published");
    expect(await code(setHomeSectionStatus(db, actor, String(tiles._id), 1, "published"))).toBe("ok");
    // The type of a section never changes on update.
    const rich = (await db.collection("homeSections").findOne({ type: "richText" }))!;
    expect(await code(updateHomeSection(db, actor, String(rich._id), 1, { type: "hero", order: 1, data: { title: { bn: "x" } } }))).toBe("invalid");
    expect(await code(updateHomeSection(db, actor, String(rich._id), 1, { type: "richText", order: 9, data: { body: { bn: "নতুন" } } }))).toBe("ok");
    expect((await getHomeSection(db, String(rich._id)))!.order).toBe(9);
  });

  it("banners need rights and alt text, accept only internal links, and are pinned while shown", async () => {
    const image = { publicId: "horekbazar/banners/eid", rights: "Own photo, 2026" };
    expect(await code(createBanner(db, actor, { image, alt: { bn: "ঈদ" }, placement: "home_top", href: "https://evil.example" }))).toBe("invalid");
    expect(await code(createBanner(db, actor, { image: { ...image, rights: "" }, alt: { bn: "ঈদ" }, placement: "home_top" }))).toBe("invalid");
    const bannerId = String(await createBanner(db, actor, { image, alt: { bn: "ঈদ" }, placement: "home_top", href: "/c/grocery" }));
    const sectionId = String(await createHomeSection(db, actor, { type: "banner", order: 4, data: { bannerId: new ObjectId(bannerId) } }));
    await setBannerStatus(db, actor, bannerId, 1, "published");
    await setHomeSectionStatus(db, actor, sectionId, 1, "published");
    expect(await code(setBannerStatus(db, actor, bannerId, 2, "archived"))).toBe("in_use");
    expect(await code(deleteBanner(db, actor, bannerId, 2))).toBe("in_use");
  });
});
