// B5 storefront read model against a real replica set: only published data is visible; listings
// carry the lowest active price, a compare-at price only when genuinely higher, and stored availability;
// filters, sorting, pagination, category subtrees and paths, search (text and word-prefix), collections
// (manual and rule) and the store readiness check. Data is created through the B4 services, so every
// publish rule applies exactly as in the admin.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, getCategory, setCategoryStatus } from "@/lib/modules/catalogue/categories";
import type { Actor } from "@/lib/modules/catalogue/common";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, getProduct, setProductStatus } from "@/lib/modules/catalogue/products";
import { createCollection, getCollection, setCollectionStatus } from "@/lib/modules/merch/merch";
import { categoryPath, categoryTree, collectionQuery, getPublishedCollection, getPublishedProduct, listPublishedProducts, newArrivalsSince, resolveCategoryPath, subtreeIds } from "@/lib/modules/storefront/catalogue";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "owner", ip: "203.0.113.9" };
const tag = randomUUID().slice(0, 6);

const lt = (bn: string, en?: string) => (en ? { bn, en } : { bn });
let grocery: string;
let rice: string;
let oil: string;
let draftCat: string;

async function category(slug: string, parentId: string | null, en: string, publish = true) {
  const id = String(await createCategory(db, client, actor, { slug: `${slug}-${tag}`, parentId, name: lt("বিভাগ", en), position: 1 }));
  if (publish) await setCategoryStatus(db, client, actor, id, (await getCategory(db, id))!.version, "published");
  return id;
}

async function product(slugBase: string, en: string, cat: string, prices: { amount: number; compareAt?: number; stock?: number }[], publish = true) {
  const id = String(await createProduct(db, client, actor, { slug: `${slugBase}-${tag}`, name: lt("পণ্য", en), shortDescription: lt("বিবরণ", `${en} for everyday use`), primaryCategoryId: cat, categoryIds: [cat], attributes: [] }));
  for (const [i, p] of prices.entries()) {
    const sku = `S-${randomUUID().slice(0, 8).toUpperCase()}`;
    const v = String(await createVariant(db, client, actor, id, { sku, title: lt("প্যাক", `${i + 1} pack`), options: [], netQuantity: { value: i + 1, unit: "kg", verified: true }, price: { amountMinor: p.amount, currency: "BDT" }, ...(p.compareAt ? { compareAt: { amountMinor: p.compareAt, currency: "BDT" } } : {}), position: i }));
    if (p.stock) await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: p.stock }] });
  }
  if (publish) await setProductStatus(db, client, actor, id, (await getProduct(db, id))!.product.version, "published");
  return id;
}

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
  grocery = await category("grocery", null, "Grocery");
  rice = await category("rice", grocery, "Rice");
  oil = await category("oil", grocery, "Cooking Oil");
  draftCat = await category("hidden", null, "Hidden", false);
  await product("miniket-rice", "Miniket Rice", rice, [{ amount: 8500, stock: 5 }, { amount: 42500, compareAt: 45000 }]);
  await product("chinigura-rice", "Chinigura Rice", rice, [{ amount: 15000 }]);
  await product("soybean-oil", "Soybean Oil", oil, [{ amount: 19000, stock: 2 }]);
  await product("mustard-oil", "Mustard Oil", oil, [{ amount: 32000 }], false); // draft
});
afterAll(async () => cleanup());

describe("category tree and paths", () => {
  it("contains published categories only, with resolvable 1–3 level paths", async () => {
    const tree = await categoryTree(db);
    expect(tree.byId.has(draftCat)).toBe(false);
    const g = tree.byId.get(grocery)!;
    const r = tree.byId.get(rice)!;
    expect(categoryPath(r)).toBe(`/c/grocery-${tag}/rice-${tag}`);
    expect(resolveCategoryPath(tree, [`grocery-${tag}`, `rice-${tag}`])?.id).toBe(rice);
    expect(resolveCategoryPath(tree, [`rice-${tag}`])).toBeNull(); // chain must match the tree
    expect(resolveCategoryPath(tree, [`hidden-${tag}`])).toBeNull();
    expect(resolveCategoryPath(tree, ["a", "b", "c", "d"])).toBeNull();
    expect(subtreeIds(g).sort()).toEqual([grocery, rice, oil].sort());
  });
});

describe("listings", () => {
  it("lists published products of a subtree with real prices and availability", async () => {
    const tree = await categoryTree(db);
    const list = await listPublishedProducts(db, { categoryIds: subtreeIds(tree.byId.get(grocery)!) });
    const slugs = list.items.map((i) => i.slug);
    expect(list.total).toBe(3);
    expect(slugs).not.toContain(`mustard-oil-${tag}`);
    const miniket = list.items.find((i) => i.slug === `miniket-rice-${tag}`)!;
    expect(miniket.price).toBe(8500); // lowest active variant
    expect(miniket.compareAt).toBeUndefined(); // the cheapest variant has no compare-at price
    expect(miniket.available).toBe(5);
    expect(miniket.variantCount).toBe(2);
    expect(miniket.netQuantity).toEqual({ value: 1, unit: "kg" });
    expect(list.priceRange).toEqual({ min: 8500, max: 19000 });
  });

  it("filters by stock and price, sorts, and paginates", async () => {
    const all = { categoryIds: [grocery, rice, oil] };
    expect((await listPublishedProducts(db, { ...all, inStock: true })).items.map((i) => i.slug).sort()).toEqual([`miniket-rice-${tag}`, `soybean-oil-${tag}`].sort());
    expect((await listPublishedProducts(db, { ...all, minPrice: 10000, maxPrice: 16000 })).items.map((i) => i.slug)).toEqual([`chinigura-rice-${tag}`]);
    expect((await listPublishedProducts(db, { ...all, sort: "price_asc" })).items.map((i) => i.price)).toEqual([8500, 15000, 19000]);
    expect((await listPublishedProducts(db, { ...all, sort: "price_desc" })).items.map((i) => i.price)).toEqual([19000, 15000, 8500]);
    const page2 = await listPublishedProducts(db, { ...all, sort: "price_asc", pageSize: 2, page: 2 });
    expect(page2).toMatchObject({ total: 3, pages: 2, page: 2 });
    expect(page2.items.map((i) => i.price)).toEqual([19000]);
    expect((await listPublishedProducts(db, { ...all, page: 99 })).items).toEqual([]);
  });

  it("deals need a genuine compare-at price; new products are recent publications", async () => {
    const deals = await listPublishedProducts(db, { deals: true });
    expect(deals.items.map((i) => i.slug)).toContain(`miniket-rice-${tag}`); // its 5-pack is 425 < 450
    expect(deals.items.map((i) => i.slug)).not.toContain(`chinigura-rice-${tag}`);
    expect((await listPublishedProducts(db, { publishedSince: newArrivalsSince() })).total).toBeGreaterThanOrEqual(3);
    expect((await listPublishedProducts(db, { publishedSince: new Date(Date.now() + 60_000) })).total).toBe(0);
  });
});

describe("search", () => {
  it("finds whole words, word prefixes, and never drafts", async () => {
    const whole = await listPublishedProducts(db, { text: "rice" });
    expect(whole.items.map((i) => i.slug).sort()).toEqual([`chinigura-rice-${tag}`, `miniket-rice-${tag}`].sort());
    expect((await listPublishedProducts(db, { text: "mini" })).items.map((i) => i.slug)).toEqual([`miniket-rice-${tag}`]);
    expect((await listPublishedProducts(db, { text: "mustard" })).total).toBe(0);
    expect((await listPublishedProducts(db, { text: "zzzz-nothing" })).total).toBe(0);
    // Regex metacharacters are matched literally, not interpreted.
    expect((await listPublishedProducts(db, { text: ".*" })).total).toBe(0);
  });
});

describe("product page and collections", () => {
  it("returns a published product with active variants and stock; drafts are not found", async () => {
    const tree = await categoryTree(db);
    const page = await getPublishedProduct(db, tree, `miniket-rice-${tag}`);
    expect(page?.variants.map((v) => v.available)).toEqual([5, 0]);
    expect(page?.primaryCategory?.id).toBe(rice);
    expect(await getPublishedProduct(db, tree, `mustard-oil-${tag}`)).toBeNull();
    expect(await getPublishedProduct(db, tree, "../etc")).toBeNull();
  });

  it("shows a manual collection's published products only, once published", async () => {
    const tree = await categoryTree(db);
    const ids = (await db.collection("products").find({ slug: { $in: [`chinigura-rice-${tag}`, `mustard-oil-${tag}`] } }).toArray()).map((p) => String(p._id));
    const id = String(await createCollection(db, actor, { slug: `picks-${tag}`, name: lt("বাছাই", "Picks"), productIds: ids }));
    expect(await getPublishedCollection(db, `picks-${tag}`)).toBeNull();
    await setCollectionStatus(db, actor, id, (await getCollection(db, id))!.version, "published");
    const c = (await getPublishedCollection(db, `picks-${tag}`))!;
    const list = await listPublishedProducts(db, collectionQuery(c, tree));
    expect(list.items.map((i) => i.slug)).toEqual([`chinigura-rice-${tag}`]);
  });
});
