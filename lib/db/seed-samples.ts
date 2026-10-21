// Sample catalogue loader (owner change to D11, 2026-10-22): "generate some catalogue source data and
// push to database, and admin will curd them for real and test". Loads the generated package in
// catalogue/horekbazar/ into a DEVELOPMENT database only, through the catalogue services so every
// rule, validator and audit entry applies exactly as for an admin edit.
//
// Guarantees (tested in tests/integration/seed.test.ts):
// - Refuses unless the database name ends in `_dev` (isDevelopmentDatabase). No override flag.
// - Dry run unless `confirm`; the dry run writes nothing.
// - Idempotent: categories and products are matched by slug, variants by SKU; existing records are
//   never modified. A slug or SKU already used by a non-sample record is reported and skipped.
// - Never deletes, except `removeSamples`, which deletes only `sample: true` records (and the stock
//   and ledger rows of sample variants) in a `_dev` database, and refuses while merchandising refers
//   to them.
// - Every record gets `sample: true`; products and categories are created as drafts; stock is 0
//   (createVariant creates a zero stock document). Research prices are copied as the draft price and
//   flagged for owner review in the package; they are not selling prices.
import type { Db, MongoClient, ObjectId } from "mongodb";
import { CATEGORIES, INVENTORY_LEDGER, PRODUCTS, STOCK, VARIANTS, type CategoryDoc, type LocalizedText, type ProductDoc, type VariantDoc } from "../modules/catalogue/schema.ts";
import { createCategory } from "../modules/catalogue/categories.ts";
import { createProduct, createVariant } from "../modules/catalogue/products.ts";
import { inTransaction, isDevelopmentDatabase, type Actor } from "../modules/catalogue/common.ts";
import { COLLECTIONS, HOME_SECTIONS } from "../modules/merch/schema.ts";
import { recordAudit } from "../modules/platform/audit.ts";

export const SEED_ACTOR: Actor = { id: "system:db-seed", role: "system" };

type PackageLT = { bn: string; en?: string | null };
type PackageSeo = { bn?: { title?: string; description?: string }; en?: { title?: string; description?: string } } | null | undefined;

export interface PackageCategory {
  id: string;
  slug: string;
  parentId: string | null;
  name: PackageLT;
  description?: PackageLT | null;
  sortOrder: number;
  seo?: PackageSeo;
}

export interface PackageVariant {
  sku: string;
  title: PackageLT;
  netQuantity?: { value: number; unit: string } | null;
  price: { proposed: { amountMinor: number; currency: "BDT" } };
  barcode?: string | null;
  shippingWeightGrams?: { value: number | null } | null;
}

export interface PackageProduct {
  id: string;
  slug: string;
  primaryCategoryId: string;
  categoryIds: string[];
  name: PackageLT;
  shortDescription?: PackageLT | null;
  description?: PackageLT | null;
  attributes: { key: string; label: PackageLT; value: PackageLT }[];
  seo?: PackageSeo;
  variants: PackageVariant[];
}

export interface SamplePackage {
  categories: PackageCategory[];
  products: PackageProduct[];
}

export class SeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedRefusedError";
  }
}

export interface SeedReport {
  database: string;
  confirm: boolean;
  categories: { create: number; existingSample: number; conflict: string[] };
  products: { create: number; existingSample: number; conflict: string[] };
  variants: { create: number; existingSample: number; conflict: string[] };
}

const lt = (v: PackageLT | null | undefined): LocalizedText | undefined => (v?.bn ? (v.en ? { bn: v.bn, en: v.en } : { bn: v.bn }) : undefined);

/** Package SEO is per locale ({bn:{title,description}, en:{…}}); the schema is per field ({title:{bn,en}}). */
export function mapSeo(seo: PackageSeo): CategoryDoc["seo"] | undefined {
  if (!seo) return undefined;
  const title = lt(seo.bn?.title ? { bn: seo.bn.title, en: seo.en?.title ?? null } : null);
  const description = lt(seo.bn?.description ? { bn: seo.bn.description, en: seo.en?.description ?? null } : null);
  if (!title && !description) return undefined;
  return { ...(title ? { title } : {}), ...(description ? { description } : {}) };
}

const UNIT: Record<string, NonNullable<VariantDoc["netQuantity"]>["unit"]> = { g: "g", kg: "kg", ml: "ml", l: "l", pc: "pc", piece: "pc" };

export function mapVariant(v: PackageVariant, position: number) {
  const unit = v.netQuantity ? UNIT[v.netQuantity.unit] : undefined;
  if (v.netQuantity && !unit) throw new Error(`Unknown net quantity unit "${v.netQuantity.unit}" on ${v.sku}`);
  return {
    sku: v.sku,
    title: lt(v.title)!,
    options: [],
    // Package quantities are generated, so they start unverified (the LabelTile hides unverified ones).
    netQuantity: v.netQuantity && unit ? { value: v.netQuantity.value, unit, verified: false } : undefined,
    price: { amountMinor: v.price.proposed.amountMinor, currency: "BDT" as const },
    barcode: v.barcode ?? undefined,
    weightGrams: v.shippingWeightGrams?.value ?? undefined,
    position,
    sample: true as const,
  };
}

/** Parents before children, so createCategory always finds the parent. */
export function orderCategories(list: PackageCategory[]): PackageCategory[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const depth = (c: PackageCategory, seen = new Set<string>()): number => {
    if (!c.parentId) return 0;
    if (seen.has(c.id)) throw new Error(`Category cycle at ${c.id}`);
    seen.add(c.id);
    const parent = byId.get(c.parentId);
    if (!parent) throw new Error(`Category ${c.id} has unknown parent ${c.parentId}`);
    return depth(parent, seen) + 1;
  };
  return [...list].sort((a, b) => depth(a) - depth(b) || a.sortOrder - b.sortOrder);
}

function refuseUnlessDev(db: Db) {
  if (!isDevelopmentDatabase(db)) throw new SeedRefusedError(`database "${db.databaseName}" does not end in "_dev"; sample data is for development databases only`);
}

export async function seedSamples(db: Db, client: MongoClient, pkg: SamplePackage, options: { confirm: boolean }): Promise<SeedReport> {
  refuseUnlessDev(db);
  const report: SeedReport = {
    database: db.databaseName,
    confirm: options.confirm,
    categories: { create: 0, existingSample: 0, conflict: [] },
    products: { create: 0, existingSample: 0, conflict: [] },
    variants: { create: 0, existingSample: 0, conflict: [] },
  };

  // Package id → database _id (existing sample or newly created). Conflicting slugs are left out, and
  // anything that depends on them is skipped too.
  const categoryIds = new Map<string, ObjectId>();
  for (const c of orderCategories(pkg.categories)) {
    const existing = await db.collection<CategoryDoc>(CATEGORIES).findOne({ slug: c.slug }, { projection: { _id: 1, sample: 1 } });
    if (existing) {
      if (existing.sample) {
        report.categories.existingSample++;
        categoryIds.set(c.id, existing._id);
      } else report.categories.conflict.push(c.slug);
      continue;
    }
    const parent = c.parentId ? categoryIds.get(c.parentId) : null;
    if (c.parentId && !parent && options.confirm) {
      report.categories.conflict.push(`${c.slug} (parent skipped)`);
      continue;
    }
    report.categories.create++;
    if (!options.confirm) continue;
    const id = await createCategory(db, client, SEED_ACTOR, {
      slug: c.slug,
      parentId: parent ? String(parent) : null,
      name: lt(c.name)!,
      description: lt(c.description),
      position: c.sortOrder,
      seo: mapSeo(c.seo),
      sample: true,
    });
    categoryIds.set(c.id, id);
  }

  for (const p of pkg.products) {
    const existing = await db.collection<ProductDoc>(PRODUCTS).findOne({ slug: p.slug }, { projection: { _id: 1, sample: 1 } });
    let productId: ObjectId | undefined;
    if (existing) {
      if (!existing.sample) {
        report.products.conflict.push(p.slug);
        continue;
      }
      report.products.existingSample++;
      productId = existing._id;
    } else {
      const primary = categoryIds.get(p.primaryCategoryId);
      const all = p.categoryIds.map((id) => categoryIds.get(id));
      if (options.confirm && (!primary || all.some((id) => !id))) {
        report.products.conflict.push(`${p.slug} (category skipped)`);
        continue;
      }
      report.products.create++;
      if (options.confirm) {
        productId = await createProduct(db, client, SEED_ACTOR, {
          slug: p.slug,
          name: lt(p.name)!,
          shortDescription: lt(p.shortDescription),
          description: lt(p.description),
          primaryCategoryId: String(primary),
          categoryIds: all.map(String),
          attributes: p.attributes.map((a) => ({ key: a.key, label: lt(a.label)!, value: lt(a.value)! })),
          seo: mapSeo(p.seo),
          sample: true,
        });
      }
    }

    for (const [i, v] of p.variants.entries()) {
      const input = mapVariant(v, i);
      const found = await db.collection<VariantDoc>(VARIANTS).findOne({ sku: v.sku }, { projection: { _id: 1, sample: 1 } });
      if (found) {
        if (found.sample) report.variants.existingSample++;
        else report.variants.conflict.push(v.sku);
        continue;
      }
      report.variants.create++;
      if (options.confirm && productId) await createVariant(db, client, SEED_ACTOR, String(productId), input);
    }
  }
  return report;
}

export interface RemoveReport {
  database: string;
  confirm: boolean;
  categories: number;
  products: number;
  variants: number;
  stock: number;
  ledger: number;
}

/** Deletes only `sample: true` records in a `_dev` database. Refuses while merchandising refers to them. */
export async function removeSamples(db: Db, client: MongoClient, options: { confirm: boolean }): Promise<RemoveReport> {
  refuseUnlessDev(db);
  const productIds = (await db.collection(PRODUCTS).find({ sample: true }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  const categoryIds = (await db.collection(CATEGORIES).find({ sample: true }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
  const variantIds = (await db.collection(VARIANTS).find({ sample: true }, { projection: { _id: 1 } }).toArray()).map((d) => d._id);

  // A real (non-sample) product or variant must not lose its category or product.
  const realProduct = await db.collection(PRODUCTS).findOne({ sample: { $ne: true }, categoryIds: { $in: categoryIds } }, { projection: { slug: 1 } });
  if (realProduct) throw new SeedRefusedError(`non-sample product "${realProduct.slug}" uses a sample category; move it first`);
  const realCategory = await db.collection(CATEGORIES).findOne({ sample: { $ne: true }, parentId: { $in: categoryIds } }, { projection: { slug: 1 } });
  if (realCategory) throw new SeedRefusedError(`non-sample category "${realCategory.slug}" is inside a sample category; move it first`);
  const realVariant = await db.collection(VARIANTS).findOne({ sample: { $ne: true }, productId: { $in: productIds } }, { projection: { sku: 1 } });
  if (realVariant) throw new SeedRefusedError(`non-sample variant "${realVariant.sku}" belongs to a sample product; remove it first`);
  const referencing = await db.collection(COLLECTIONS).countDocuments({ $or: [{ productIds: { $in: productIds } }, { "rule.categoryIds": { $in: categoryIds } }] });
  const tiles = await db.collection(HOME_SECTIONS).countDocuments({ "data.categoryIds": { $in: categoryIds } });
  if (referencing || tiles) throw new SeedRefusedError(`${referencing} collection(s) and ${tiles} homepage section(s) refer to sample records; edit them first`);

  const ledger = await db.collection(INVENTORY_LEDGER).countDocuments({ variantId: { $in: variantIds } });
  const stockCount = await db.collection(STOCK).countDocuments({ variantId: { $in: variantIds } });
  const report: RemoveReport = { database: db.databaseName, confirm: options.confirm, categories: categoryIds.length, products: productIds.length, variants: variantIds.length, stock: stockCount, ledger };
  if (!options.confirm) return report;

  await inTransaction(client, async (session) => {
    await db.collection(INVENTORY_LEDGER).deleteMany({ variantId: { $in: variantIds } }, { session });
    await db.collection(STOCK).deleteMany({ variantId: { $in: variantIds } }, { session });
    await db.collection(VARIANTS).deleteMany({ _id: { $in: variantIds }, sample: true }, { session });
    await db.collection(PRODUCTS).deleteMany({ _id: { $in: productIds }, sample: true }, { session });
    await db.collection(CATEGORIES).deleteMany({ _id: { $in: categoryIds }, sample: true }, { session });
    await recordAudit(
      db,
      { actor: { id: SEED_ACTOR.id, role: SEED_ACTOR.role }, action: "catalogue.samples_removed", target: { type: "catalogue", id: "samples" }, after: { categories: report.categories, products: report.products, variants: report.variants, stock: report.stock, ledger: report.ledger } },
      { session },
    );
  });
  return report;
}
