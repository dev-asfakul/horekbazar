// B4 catalogue services against a real replica set (BUILD-PLAN B4 acceptance): category depth 3 on
// create and move, cycles rejected (including two concurrent opposite moves), optimistic versions,
// slug freeze, product publish rules, sample-record guard, variants with zero stock, and the
// inventory ledger: idempotent receipts, guarded adjustments and a replay that changes nothing.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ObjectId, type Db, type MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { createCategory, deleteCategory, depthOf, getCategory, moveCategory, setCategoryStatus, updateCategory } from "@/lib/modules/catalogue/categories";
import { CatalogueError, type Actor } from "@/lib/modules/catalogue/common";
import { moveStock, reconcileStock } from "@/lib/modules/catalogue/inventory";
import { createProduct, createVariant, deleteProduct, getProduct, listProducts, setProductStatus, setVariantStatus, updateProduct, updateVariant } from "@/lib/modules/catalogue/products";
import { CATEGORIES, STOCK } from "@/lib/modules/catalogue/schema";
import { freshDb } from "./helpers";

let client: MongoClient;
let db: Db;
let cleanup: () => Promise<void>;
const actor: Actor = { id: "staff-1", role: "catalogue_editor", ip: "203.0.113.9" };

beforeAll(async () => {
  ({ client, db, cleanup } = await freshDb());
  await runMigrations(db);
});
afterAll(async () => cleanup());

const lt = (bn: string, en?: string) => (en ? { bn, en } : { bn });
const slug = (base: string) => `${base}-${randomUUID().slice(0, 6)}`;
const cat = (parentId: string | null, base = "cat") => createCategory(db, client, actor, { slug: slug(base), parentId, name: lt("বিভাগ", "Category"), position: 1 }).then(String);
const code = (promise: Promise<unknown>) => promise.then(() => "ok", (e: unknown) => (e instanceof CatalogueError ? e.code : `unexpected: ${String(e)}`));
const version = async (id: string) => (await getCategory(db, id))!.version;

describe("category tree (depth ≤ 3, no cycles)", () => {
  it("creates three levels and rejects a fourth", async () => {
    const a = await cat(null);
    const b = await cat(a);
    const c = await cat(b);
    expect(await code(cat(c))).toBe("depth_exceeded");
    const tree = new Map((await db.collection(CATEGORIES).find({}).toArray()).map((n) => [String(n._id), { _id: n._id as ObjectId, parentId: (n.parentId as ObjectId | null) ?? null }]));
    expect(depthOf(tree, c)).toBe(3);
  });

  it("rejects a move that would make the subtree deeper than 3", async () => {
    const a = await cat(null);
    const b = await cat(a); // a > b (depth 2)
    const x = await cat(null);
    await cat(x); // x has height 2
    expect(await code(moveCategory(db, client, actor, x, await version(x), b))).toBe("depth_exceeded");
    // Height 2 under a depth-1 parent is fine.
    expect(await code(moveCategory(db, client, actor, x, await version(x), a))).toBe("ok");
    expect((await getCategory(db, x))!.parentId?.toString()).toBe(a);
  });

  it("rejects moving a category under itself or a descendant", async () => {
    const a = await cat(null);
    const b = await cat(a);
    expect(await code(moveCategory(db, client, actor, a, await version(a), a))).toBe("cycle");
    expect(await code(moveCategory(db, client, actor, a, await version(a), b))).toBe("cycle");
  });

  it("two concurrent opposite moves never form a cycle", async () => {
    const a = await cat(null);
    const b = await cat(null);
    const [va, vb] = [await version(a), await version(b)];
    const results = await Promise.all([code(moveCategory(db, client, actor, a, va, b)), code(moveCategory(db, client, actor, b, vb, a))]);
    expect(results.filter((r) => r === "ok").length).toBe(1);
    expect(results.find((r) => r !== "ok")).toBe("cycle");
    const [da, db_] = [await getCategory(db, a), await getCategory(db, b)];
    expect(Boolean(da!.parentId) && Boolean(db_!.parentId)).toBe(false);
  });

  it("detects a cycle already present in stored data instead of looping", async () => {
    const p = new ObjectId();
    const q = new ObjectId();
    const tree = new Map([
      [String(p), { _id: p, parentId: q }],
      [String(q), { _id: q, parentId: p }],
    ]);
    expect(() => depthOf(tree, String(p))).toThrow(CatalogueError);
  });

  it("rejects a stale version and freezes the slug once published", async () => {
    const a = await cat(null);
    const current = (await getCategory(db, a))!;
    const patch = { slug: current.slug, name: lt("নতুন নাম", "New name"), position: 2 };
    await updateCategory(db, client, actor, a, current.version, patch);
    expect(await code(updateCategory(db, client, actor, a, current.version, patch))).toBe("version_conflict");
    await setCategoryStatus(db, client, actor, a, await version(a), "published");
    expect(await code(updateCategory(db, client, actor, a, await version(a), { ...patch, slug: slug("renamed") }))).toBe("slug_locked");
    expect(await db.collection("auditLog").countDocuments({ "target.id": a })).toBeGreaterThanOrEqual(3);
  });

  it("publishes a child only under a published parent, and deletes only unused drafts", async () => {
    const a = await cat(null);
    const b = await cat(a);
    expect(await code(setCategoryStatus(db, client, actor, b, await version(b), "published"))).toBe("parent_unpublished");
    expect(await code(deleteCategory(db, client, actor, a, await version(a)))).toBe("has_children");
    await deleteCategory(db, client, actor, b, await version(b));
    await deleteCategory(db, client, actor, a, await version(a));
    expect(await getCategory(db, a)).toBeNull();
  });
});

async function publishedLeaf() {
  const root = await cat(null, "root");
  const leaf = await cat(root, "leaf");
  await setCategoryStatus(db, client, actor, root, await version(root), "published");
  await setCategoryStatus(db, client, actor, leaf, await version(leaf), "published");
  return { root, leaf };
}

const variantInput = (sku: string, amountMinor = 8500) => ({ sku, title: lt("১ কেজি", "1 kg"), options: [], netQuantity: { value: 1, unit: "kg" as const, verified: true }, price: { amountMinor, currency: "BDT" as const }, position: 0 });
const productVersion = async (id: string) => (await getProduct(db, id))!.product.version;
const sku = () => `T-${randomUUID().slice(0, 8).toUpperCase()}`;

describe("products and variants", () => {
  it("creates a product on a leaf category, rejects a non-leaf primary category", async () => {
    const { root, leaf } = await publishedLeaf();
    expect(await code(createProduct(db, client, actor, { slug: slug("p"), name: lt("পণ্য"), primaryCategoryId: root, categoryIds: [root], attributes: [] }))).toBe("category_not_leaf");
    const id = String(await createProduct(db, client, actor, { slug: slug("p"), name: lt("পণ্য"), primaryCategoryId: leaf, categoryIds: [], attributes: [] }));
    const found = await getProduct(db, id);
    expect(found!.product.status).toBe("draft");
    expect(found!.product.categoryIds.map(String)).toEqual([leaf]);
    // A category with products cannot receive child categories (the product's primary must stay a leaf).
    expect(await code(cat(leaf))).toBe("parent_has_products");
  });

  it("publishes only with a published category and an active priced variant; zero stock on create", async () => {
    const { leaf } = await publishedLeaf();
    const id = String(await createProduct(db, client, actor, { slug: slug("p"), name: lt("মিনিকেট চাল", "Miniket Rice"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] }));
    expect(await code(setProductStatus(db, client, actor, id, await productVersion(id), "published"))).toBe("no_sellable_variant");
    const s = sku();
    const variantId = String(await createVariant(db, client, actor, id, variantInput(s)));
    expect(await code(createVariant(db, client, actor, id, variantInput(s)))).toBe("sku_taken");
    const stock = await db.collection(STOCK).findOne({ variantId: new ObjectId(variantId) });
    expect([stock!.onHand, stock!.reserved, stock!.available]).toEqual([0, 0, 0]);
    await setProductStatus(db, client, actor, id, await productVersion(id), "published");
    expect((await getProduct(db, id))!.product.status).toBe("published");
    // The last sellable variant of a published product cannot be archived or priced at zero.
    const v = (await getProduct(db, id))!.variants[0]!.variant;
    expect(await code(setVariantStatus(db, client, actor, variantId, v.version, "archived"))).toBe("no_sellable_variant");
    expect(await code(updateVariant(db, client, actor, variantId, v.version, { ...variantInput(s, 0) }))).toBe("no_sellable_variant");
    // Published products are archived, never deleted.
    expect(await code(deleteProduct(db, client, actor, id, await productVersion(id)))).toBe("in_use");
  });

  it("rejects a compare-at price that is not higher than the price", async () => {
    const { leaf } = await publishedLeaf();
    const id = String(await createProduct(db, client, actor, { slug: slug("p"), name: lt("পণ্য"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] }));
    expect(await code(createVariant(db, client, actor, id, { ...variantInput(sku()), compareAt: { amountMinor: 8500, currency: "BDT" } }))).toBe("compare_at_not_higher");
  });

  it("rejects a stale product version and freezes the slug after publishing", async () => {
    const { leaf } = await publishedLeaf();
    const s = slug("p");
    const id = String(await createProduct(db, client, actor, { slug: s, name: lt("পণ্য"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] }));
    const patch = { slug: s, name: lt("নতুন"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] };
    await updateProduct(db, client, actor, id, 1, patch);
    expect(await code(updateProduct(db, client, actor, id, 1, patch))).toBe("version_conflict");
    await createVariant(db, client, actor, id, variantInput(sku()));
    await setProductStatus(db, client, actor, id, await productVersion(id), "published");
    expect(await code(updateProduct(db, client, actor, id, await productVersion(id), { ...patch, slug: slug("other") }))).toBe("slug_locked");
  });

  it("deletes a never-published draft with its variants and stock", async () => {
    const { leaf } = await publishedLeaf();
    const id = String(await createProduct(db, client, actor, { slug: slug("p"), name: lt("পণ্য"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] }));
    const variantId = await createVariant(db, client, actor, id, variantInput(sku()));
    await deleteProduct(db, client, actor, id, await productVersion(id));
    expect(await getProduct(db, id)).toBeNull();
    expect(await db.collection(STOCK).findOne({ variantId })).toBeNull();
  });

  it("lists with search by name or SKU, status filter and pagination", async () => {
    const { leaf } = await publishedLeaf();
    const s = sku();
    const id = String(await createProduct(db, client, actor, { slug: slug("searchable"), name: lt("খুঁজুন", "Findable Tea"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] }));
    await createVariant(db, client, actor, id, variantInput(s));
    expect((await listProducts(db, { q: "findable" })).items.map((i) => String(i.product._id))).toContain(id);
    expect((await listProducts(db, { q: s })).items.map((i) => String(i.product._id))).toEqual([id]);
    expect((await listProducts(db, { q: "findable", status: "archived" })).total).toBe(0);
    const page = await listProducts(db, { pageSize: 2, page: 1 });
    expect(page.items.length).toBeLessThanOrEqual(2);
    expect(page.total).toBeGreaterThan(2);
  });
});

describe("sample records (owner change to D11, 2026-10-22)", () => {
  it("cannot be published outside a _dev database, and can in one", async () => {
    const { leaf } = await publishedLeaf();
    const id = String(await createProduct(db, client, actor, { slug: slug("sample"), name: lt("নমুনা"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [], sample: true }));
    await createVariant(db, client, actor, id, { ...variantInput(sku()), sample: true });
    expect(db.databaseName.endsWith("_dev")).toBe(false);
    expect(await code(setProductStatus(db, client, actor, id, await productVersion(id), "published"))).toBe("sample_publish_blocked");

    const devDb = client.db(`${db.databaseName}_dev`);
    try {
      await runMigrations(devDb);
      const root = String(await createCategory(devDb, client, actor, { slug: "root", parentId: null, name: lt("মূল"), position: 1, sample: true }));
      await setCategoryStatus(devDb, client, actor, root, 1, "published");
      const pid = String(await createProduct(devDb, client, actor, { slug: "sample", name: lt("নমুনা"), primaryCategoryId: root, categoryIds: [root], attributes: [], sample: true }));
      await createVariant(devDb, client, actor, pid, { ...variantInput(sku()), sample: true });
      expect(await code(setProductStatus(devDb, client, actor, pid, 1, "published"))).toBe("ok");
    } finally {
      await devDb.dropDatabase();
    }
  });
});

describe("inventory ledger (domain-rules §4)", () => {
  async function variant() {
    const { leaf } = await publishedLeaf();
    const id = String(await createProduct(db, client, actor, { slug: slug("stock"), name: lt("পণ্য"), primaryCategoryId: leaf, categoryIds: [leaf], attributes: [] }));
    return String(await createVariant(db, client, actor, id, variantInput(sku())));
  }
  const onHand = async (variantId: string) => (await db.collection(STOCK).findOne({ variantId: new ObjectId(variantId) }))!;

  it("receives once per adjustment id; a retry replays and moves nothing", async () => {
    const v = await variant();
    const adjustmentId = randomUUID();
    const first = await moveStock(db, client, actor, { adjustmentId, kind: "receive", lines: [{ variantId: v, qty: 10 }] });
    expect(first.replayed).toBe(false);
    const again = await moveStock(db, client, actor, { adjustmentId, kind: "receive", lines: [{ variantId: v, qty: 10 }] });
    expect(again.replayed).toBe(true);
    expect(again.rows[0]!.idempotencyKey).toBe(`stock:${adjustmentId}:${v}:receive`);
    expect((await onHand(v)).onHand).toBe(10);
    expect(await code(moveStock(db, client, actor, { adjustmentId, kind: "receive", lines: [{ variantId: v, qty: 11 }] }))).toBe("idempotency_key_reused");
  });

  it("concurrent identical submissions move stock once", async () => {
    const v = await variant();
    const adjustmentId = randomUUID();
    const input = { adjustmentId, kind: "receive" as const, lines: [{ variantId: v, qty: 4 }] };
    const results = await Promise.all([moveStock(db, client, actor, input), moveStock(db, client, actor, input), moveStock(db, client, actor, input)]);
    expect(results.filter((r) => !r.replayed).length).toBe(1);
    expect((await onHand(v)).onHand).toBe(4);
    expect(await db.collection("inventoryLedger").countDocuments({ refId: adjustmentId })).toBe(1);
  });

  it("adjusts with a reason and never below zero", async () => {
    const v = await variant();
    await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: 10 }] });
    expect(await code(moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "adjust", lines: [{ variantId: v, qty: -3 }] }))).toBe("invalid");
    expect(await code(moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "adjust", reason: "count", lines: [{ variantId: v, qty: -11 }] }))).toBe("insufficient_stock");
    await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "adjust", reason: "Damaged in storage", lines: [{ variantId: v, qty: -3 }] });
    const s = await onHand(v);
    expect([s.onHand, s.available]).toEqual([7, 7]);
    expect(await code(moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: v, qty: 0 }] }))).toBe("invalid");
  });

  it("a whole submission fails if one line fails (no partial movement)", async () => {
    const [a, b] = [await variant(), await variant()];
    await moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "receive", lines: [{ variantId: a, qty: 2 }] });
    expect(await code(moveStock(db, client, actor, { adjustmentId: randomUUID(), kind: "adjust", reason: "count", lines: [{ variantId: a, qty: -1 }, { variantId: b, qty: -1 }] }))).toBe("insufficient_stock");
    expect((await onHand(a)).onHand).toBe(2);
  });

  it("ledger replay changes nothing and reports no drift; tampering is reported, not fixed", async () => {
    const before = await db.collection(STOCK).find({}).sort({ _id: 1 }).toArray();
    expect(await reconcileStock(db)).toEqual([]);
    expect(await reconcileStock(db)).toEqual([]);
    expect(await db.collection(STOCK).find({}).sort({ _id: 1 }).toArray()).toEqual(before);
    const v = await variant();
    await db.collection(STOCK).updateOne({ variantId: new ObjectId(v) }, { $set: { onHand: 99, available: 99 } });
    expect(await reconcileStock(db)).toEqual([{ variantId: v, stockOnHand: 99, ledgerOnHand: 0 }]);
    expect((await onHand(v)).onHand).toBe(99);
  });
});
