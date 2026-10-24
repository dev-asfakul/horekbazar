// Phase A public-data cache against a real replica set (BUILD-PLAN D24–D26, docs/CACHE-INVENTORY.md).
// `next/cache` is the documented-behaviour double in tests/fixtures/fake-next-cache.ts. Checks: cached
// readers return exactly what the live readers return; product-page stock is always live; a cached
// value stays stale until its tag is cleared; an external write (no invalidation) is never served
// past 2 × TTL; "not found" is never stored; the in-memory schedule rule equals MongoDB's.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db, MongoClient } from "mongodb";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => import("../fixtures/fake-next-cache"));

import { resetFakeCache, store } from "../fixtures/fake-next-cache";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { PRODUCTS } from "@/lib/modules/catalogue/schema";
import { createCollection, getCollection, setCollectionStatus } from "@/lib/modules/merch/merch";
import { getSettings } from "@/lib/modules/settings/settings";
import { categoryTree, getPublishedCollection, getPublishedProduct, listPublishedCollections, listPublishedProducts, visibleAt, visibleNow } from "@/lib/modules/storefront/catalogue";
import { afterPublicWrite } from "@/lib/storefront/invalidate";
import { POLICIES, cachedCategoryTree, cachedCollection, cachedCollections, cachedListing, cachedProductExists, cachedProductPage, cachedSettings } from "@/lib/storefront/public-cache";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: "203.0.113.9" };
const tag = randomUUID().slice(0, 6);
const lt = (bn: string, en?: string) => (en ? { bn, en } : { bn });
let rice: string;
let riceProduct: string;
let riceVariant: string;
const slug = `miniket-${tag}`;

async function category(s: string, parentId: string | null, en: string) {
  const id = String(await createCategory(db, client, actor, { slug: `${s}-${tag}`, parentId, name: lt("বিভাগ", en), position: 1 }));
  await setCategoryStatus(db, client, actor, id, (await getCategory(db, id))!.version, "published");
  return id;
}

async function product(s: string, en: string, cat: string, amount: number, stock: number, publish = true) {
  const id = String(await createProduct(db, client, actor, { slug: s, name: lt("পণ্য", en), shortDescription: lt("বিবরণ", en), primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  const v = String(await createVariant(db, client, actor, id, { sku: `S-${randomUUID().slice(0, 8).toUpperCase()}`, title: lt("প্যাক", "1 pack"), options: [], netQuantity: { value: 1, unit: "kg", verified: true }, price: { amountMinor: amount, currency: "BDT" }, position: 0 }));
  if (stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: stock }] });
  if (publish) await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return { id, v };
}

/** Moves every stored entry `ms` into the past (both the store's clock and our `{at}` stamp). */
function age(ms: number) {
  for (const e of store.values()) {
    e.at -= ms;
    const inner = JSON.parse(e.json) as { at: number; v: string };
    inner.at -= ms;
    e.json = JSON.stringify(inner);
  }
}

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  const grocery = await category("grocery", null, "Grocery");
  rice = await category("rice", grocery, "Rice");
  ({ id: riceProduct, v: riceVariant } = await product(slug, "Miniket Rice", rice, 8500, 5));
  await product(`chinigura-${tag}`, "Chinigura Rice", rice, 15000, 0);
  await product(`draft-${tag}`, "Draft Rice", rice, 9000, 1, false);
});
afterAll(async () => cleanup());
beforeEach(() => resetFakeCache());

describe("cached readers equal live readers", () => {
  it("category tree, settings, listings, product page", async () => {
    const tree = await categoryTree(db);
    expect(await cachedCategoryTree(db)).toEqual(tree);
    expect(await cachedCategoryTree(db)).toEqual(tree); // from cache
    expect(await cachedSettings(db)).toEqual(await getSettings(db));
    expect(await cachedSettings(db)).toEqual(await getSettings(db));
    for (const q of [{ categoryIds: [rice] }, { categoryIds: [rice], inStock: true }, { categoryIds: [rice], sort: "price_desc" as const }, { deals: true }, { categoryIds: [rice], text: "rice" }]) {
      const live = await listPublishedProducts(db, q);
      expect(await cachedListing(db, q)).toEqual(live);
      expect(await cachedListing(db, q)).toEqual(live);
    }
    const live = await getPublishedProduct(db, tree, slug);
    expect(live).not.toBeNull();
    expect(await cachedProductPage(db, tree, slug)).toEqual(live);
    expect(await cachedProductPage(db, tree, slug)).toEqual(live);
  });

  it("collections list and lookup", async () => {
    const id = String(await createCollection(db, actor, { slug: `staples-${tag}`, name: lt("সংগ্রহ", "Staples"), productIds: [riceProduct] }));
    await setCollectionStatus(db, actor, id, (await getCollection(db, id))!.version, "published");
    expect(await cachedCollections(db)).toEqual(await listPublishedCollections(db));
    expect(await cachedCollection(db, `staples-${tag}`)).toEqual(await getPublishedCollection(db, `staples-${tag}`));
    expect(await cachedCollection(db, `missing-${tag}`)).toBeNull();
  });
});

describe("freshness", () => {
  it("product-page stock is live even while the product is cached", async () => {
    const tree = await cachedCategoryTree(db);
    const before = (await cachedProductPage(db, tree, slug))!;
    await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: riceVariant, qty: 3 }] });
    const after = (await cachedProductPage(db, tree, slug))!;
    expect(after.variants[0]!.available).toBe(before.variants[0]!.available + 3);
    expect(after).toEqual(await getPublishedProduct(db, tree, slug));
  });

  it("a cached listing stays stale until its tag is cleared, then matches live", async () => {
    const q = { categoryIds: [rice], inStock: true };
    const first = await cachedListing(db, q);
    const { v } = await product(`late-${tag}`, "Late Rice", rice, 7000, 4);
    expect(v).toBeTruthy();
    expect(await cachedListing(db, q)).toEqual(first); // stale: nothing invalidated
    afterPublicWrite("product");
    const live = await listPublishedProducts(db, q);
    expect(live.total).toBe(first.total + 1);
    expect(await cachedListing(db, q)).toEqual(live);
  });

  it("an unpublish via the admin path hides the product at once", async () => {
    const { id } = await product(`gone-${tag}`, "Gone Rice", rice, 7000, 1);
    const tree = await cachedCategoryTree(db);
    expect(await cachedProductPage(db, tree, `gone-${tag}`)).not.toBeNull();
    expect(await cachedProductExists(db, `gone-${tag}`)).toBe(true);
    await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "draft");
    expect(await cachedProductPage(db, tree, `gone-${tag}`)).not.toBeNull(); // stale before the action invalidates
    afterPublicWrite("product");
    expect(await cachedProductPage(db, tree, `gone-${tag}`)).toBeNull();
    expect(await cachedProductExists(db, `gone-${tag}`)).toBe(false);
  });

  it("an external write (no invalidation) is never served past 2 × TTL", async () => {
    const tree = await cachedCategoryTree(db);
    await cachedProductPage(db, tree, slug);
    await db.collection(PRODUCTS).updateOne({ slug }, { $set: { "name.en": "Renamed outside the app" } });
    expect((await cachedProductPage(db, tree, slug))!.product.name.en).toBe("Miniket Rice");
    age(POLICIES.product.ttl * 2 * 1000 + 1000);
    expect((await cachedProductPage(db, tree, slug))!.product.name.en).toBe("Renamed outside the app");
    await db.collection(PRODUCTS).updateOne({ slug }, { $set: { "name.en": "Miniket Rice" } });
  });

  it("never stores not-found, so a newly published product shows at once", async () => {
    const s = `soon-${tag}`;
    const tree = await cachedCategoryTree(db);
    const { id } = await product(s, "Soon Rice", rice, 7000, 1, false);
    expect(await cachedProductPage(db, tree, s)).toBeNull();
    expect(await cachedProductExists(db, s)).toBe(false);
    const stored = store.size;
    await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
    expect(store.size).toBe(stored);
    expect(await cachedProductPage(db, tree, s)).not.toBeNull(); // no invalidation needed
    expect(await cachedProductExists(db, s)).toBe(true);
  });
});

describe("schedule windows", () => {
  it("visibleAt (in memory) selects exactly what visibleNow (MongoDB) selects", async () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);
    const bounds: unknown[] = [undefined, null, past, now, future, "2026-01-01"];
    const docs = bounds.flatMap((from, i) => bounds.map((to, j) => ({ k: `${i}-${j}`, ...(from === undefined ? {} : { visibleFrom: from }), ...(to === undefined ? {} : { visibleTo: to }) })));
    const scratch = db.collection(`vis_${tag}`);
    await scratch.insertMany(docs.map((d) => ({ ...d })));
    const mongo = (await scratch.find(visibleNow(now)).toArray()).map((d) => d.k as string).sort();
    const memory = docs.filter((d) => visibleAt(d, now)).map((d) => d.k).sort();
    expect(memory).toEqual(mongo);
    expect(mongo.length).toBeGreaterThan(0);
  });
});
