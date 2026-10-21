// npm run db:seed (owner change to D11, 2026-10-22): the full generated package loads into a `_dev`
// database through the catalogue services; anything else is refused; a dry run writes nothing; a
// second run creates nothing; real records are never touched; --remove-samples deletes only samples.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { runMigrations } from "@/lib/db/migrate";
import { removeSamples, seedSamples, SeedRefusedError, type SamplePackage } from "@/lib/db/seed-samples";
import { createCategory } from "@/lib/modules/catalogue/categories";
import { moveStock } from "@/lib/modules/catalogue/inventory";
import { CATEGORIES, INVENTORY_LEDGER, PRODUCTS, STOCK, VARIANTS } from "@/lib/modules/catalogue/schema";
import { freshDb } from "./helpers";

const pkg: SamplePackage = {
  categories: JSON.parse(readFileSync("catalogue/horekbazar/categories.json", "utf8")).categories,
  products: JSON.parse(readFileSync("catalogue/horekbazar/products.json", "utf8")).products,
};
const variantCount = pkg.products.reduce((n, p) => n + p.variants.length, 0);

let client: MongoClient;
let prod: Db;
let dev: Db;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const fresh = await freshDb();
  ({ client, cleanup } = fresh);
  prod = fresh.db;
  dev = client.db(`${fresh.dbName}_dev`);
  await runMigrations(prod);
  await runMigrations(dev);
}, 120_000);
afterAll(async () => {
  await dev.dropDatabase();
  await cleanup();
});

describe("db:seed", () => {
  it("refuses a database whose name does not end in _dev, even as a dry run", async () => {
    await expect(seedSamples(prod, client, pkg, { confirm: false })).rejects.toBeInstanceOf(SeedRefusedError);
    await expect(seedSamples(prod, client, pkg, { confirm: true })).rejects.toBeInstanceOf(SeedRefusedError);
    await expect(removeSamples(prod, client, { confirm: true })).rejects.toBeInstanceOf(SeedRefusedError);
    expect(await prod.collection(PRODUCTS).countDocuments()).toBe(0);
    expect(await prod.collection(CATEGORIES).countDocuments()).toBe(0);
  });

  it("dry run reports the package and writes nothing", async () => {
    const r = await seedSamples(dev, client, pkg, { confirm: false });
    expect(r.categories.create).toBe(pkg.categories.length);
    expect(r.products.create).toBe(pkg.products.length);
    expect(r.variants.create).toBe(variantCount);
    expect(await dev.collection(CATEGORIES).countDocuments()).toBe(0);
  });

  it("skips a slug already used by a real record and loads everything else as draft samples with zero stock", async () => {
    // A real (non-sample) category that happens to use a package slug for a leaf with products.
    const leaf = pkg.categories.find((c) => c.parentId && !pkg.categories.some((x) => x.parentId === c.id))!;
    await createCategory(dev, client, { id: "staff-1", role: "owner" }, { slug: leaf.slug, parentId: null, name: { bn: "আসল" }, position: 1 });
    const blocked = pkg.products.filter((p) => p.primaryCategoryId === leaf.id || p.categoryIds.includes(leaf.id));
    const blockedVariants = blocked.reduce((n, p) => n + p.variants.length, 0);

    const r = await seedSamples(dev, client, pkg, { confirm: true });
    expect(r.categories.conflict).toEqual([leaf.slug]);
    expect(r.categories.create).toBe(pkg.categories.length - 1);
    expect(r.products.create).toBe(pkg.products.length - blocked.length);
    expect(r.products.conflict).toHaveLength(blocked.length);
    expect(r.variants.create).toBe(variantCount - blockedVariants);

    const real = await dev.collection(CATEGORIES).findOne({ slug: leaf.slug });
    expect(real?.sample).toBeUndefined();
    expect(real?.name).toEqual({ bn: "আসল" });
    expect(await dev.collection(CATEGORIES).countDocuments({ sample: true, status: "draft" })).toBe(pkg.categories.length - 1);
    expect(await dev.collection(PRODUCTS).countDocuments({ sample: true, status: "draft" })).toBe(pkg.products.length - blocked.length);
    expect(await dev.collection(VARIANTS).countDocuments({ sample: true })).toBe(variantCount - blockedVariants);
    expect(await dev.collection(STOCK).countDocuments({ onHand: { $ne: 0 } })).toBe(0);
    expect(await dev.collection(VARIANTS).countDocuments({ "netQuantity.verified": true })).toBe(0);
    // Price copied from price.proposed (paisa).
    const v = pkg.products.find((p) => !blocked.includes(p))!.variants[0]!;
    expect((await dev.collection(VARIANTS).findOne({ sku: v.sku }))?.price).toEqual({ amountMinor: v.price.proposed.amountMinor, currency: "BDT" });
    // Every write went through the services and was audited.
    expect(await dev.collection("auditLog").countDocuments({ "actor.id": "system:db-seed" })).toBe(r.categories.create + r.products.create + r.variants.create);
  }, 300_000);

  it("a second run creates nothing", async () => {
    const r = await seedSamples(dev, client, pkg, { confirm: true });
    expect(r.categories.create + r.products.create + r.variants.create).toBe(0);
    expect(r.products.existingSample).toBeGreaterThan(0);
  }, 120_000);

  it("--remove-samples deletes only sample records, including their stock and ledger rows", async () => {
    const variant = await dev.collection(VARIANTS).findOne({ sample: true });
    await moveStock(dev, client, { id: "staff-1", role: "owner" }, { adjustmentId: "seedtest1", kind: "receive", lines: [{ variantId: String(variant!._id), qty: 3 }] });
    const dry = await removeSamples(dev, client, { confirm: false });
    expect(dry.ledger).toBe(1);
    expect(await dev.collection(PRODUCTS).countDocuments({ sample: true })).toBeGreaterThan(0);

    await removeSamples(dev, client, { confirm: true });
    expect(await dev.collection(PRODUCTS).countDocuments({})).toBe(0);
    expect(await dev.collection(VARIANTS).countDocuments({})).toBe(0);
    expect(await dev.collection(STOCK).countDocuments({})).toBe(0);
    expect(await dev.collection(INVENTORY_LEDGER).countDocuments({})).toBe(0);
    expect(await dev.collection(CATEGORIES).countDocuments({})).toBe(1); // the real one
    expect(await dev.collection(CATEGORIES).countDocuments({ sample: true })).toBe(0);
  }, 120_000);
});
