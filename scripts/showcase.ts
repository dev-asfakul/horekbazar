// npm run showcase -- [--confirm] — makes the development/showcase database ("_dev" only) browsable:
// store settings, two delivery zones, published categories and products, and opening stock.
// Every write goes through the same services as the admin (versions, publish rules, inventory ledger,
// audit log) with the store Owner as the actor; nothing is written around them.
//
// Idempotent: settings are saved only if missing, a zone only if its id is absent, only drafts that were
// never published are published (a record the admin unpublished stays a draft), each variant's opening
// stock uses a fixed adjustment id (a rerun is a ledger replay, never a second receipt), a showcase
// collection is created only if its slug is absent, and the home sections only while the store has none.
// Existing records are never modified. Dry run by default. Prints counts and the database name, never
// the URI.
//
// Showcase values (the owner adjusts them in /admin): zone fees and estimates, stock quantities, and the
// collections and home sections in catalogue/horekbazar/showcase-merch.json.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { closeDatabase, databaseConfig, getClient, getDatabase } from "../lib/adapters/db/client.ts";
import { setCategoryStatus } from "../lib/modules/catalogue/categories.ts";
import { moveStock } from "../lib/modules/catalogue/inventory.ts";
import { setProductStatus } from "../lib/modules/catalogue/products.ts";
import { CATEGORIES, PRODUCTS, STOCK, VARIANTS } from "../lib/modules/catalogue/schema.ts";
import { ObjectId } from "mongodb";
import { createCollection, createHomeSection, setCollectionStatus, setHomeSectionStatus, type HomeSectionInput } from "../lib/modules/merch/merch.ts";
import { COLLECTIONS, HOME_SECTIONS } from "../lib/modules/merch/schema.ts";
import { getSettings, updateGeneralSettings, upsertDeliveryZone } from "../lib/modules/settings/settings.ts";

type LT = { bn: string; en?: string };
interface MerchFile {
  collections: { slug: string; name: LT; description?: LT; products: string[] }[];
  home: { hero: { title: LT; subtitle?: LT; ctaLabel?: LT; href?: string }; categoryTilesTitle?: LT; rails: string[]; collectionGridTitle?: LT };
}

const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((a) => a !== "--confirm");
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(" ")}. Use --confirm to write.`);
  process.exit(2);
}
const confirm = args.has("--confirm");

/** Opening stock per variant, derived from its id so reruns agree: ~8% out of stock, ~15% low. */
export function openingQty(variantId: string): number {
  const n = createHash("sha256").update(variantId).digest().readUInt32BE(0) % 1000;
  if (n < 80) return 0;
  if (n < 230) return 2 + (n % 4); // 2–5: at or under a typical low-stock threshold
  return 12 + (n % 69); // 12–80
}

const ZONES = [
  { id: "dhaka-city", name: { bn: "ঢাকা সিটির ভেতরে", en: "Inside Dhaka city" }, fee: { amountMinor: 6000, currency: "BDT" as const }, estimate: { bn: "১–২ দিন", en: "1–2 days" }, areas: [], enabled: true },
  { id: "outside-dhaka", name: { bn: "ঢাকার বাইরে", en: "Outside Dhaka" }, fee: { amountMinor: 12000, currency: "BDT" as const }, estimate: { bn: "৩–৫ দিন", en: "3–5 days" }, areas: [], enabled: true },
];

try {
  const db = await getDatabase();
  const client = getClient(databaseConfig(process.env)!);
  console.log(`database: ${db.databaseName}`);
  console.log(`mode:     ${confirm ? "WRITE (--confirm)" : "dry run (add --confirm to write)"}`);
  if (!db.databaseName.endsWith("_dev")) throw new Error("refused: the showcase script only runs on a database whose name ends in _dev");

  const owner = await db.collection("user").findOne({ staffRoleKey: "owner" }, { projection: { _id: 1 } });
  if (!owner) throw new Error("refused: no Owner yet; create it at /admin/setup first (docs/OWNER-SETUP.md)");
  const actor = { id: String(owner._id), role: "owner", ip: null };

  // 1. Settings (once) and delivery zones (missing ids only).
  let settings = await getSettings(db);
  const saved = settings.version > 0;
  console.log(`settings: ${saved ? "already saved" : confirm ? "saving defaults" : "would save defaults"}`);
  if (!saved && confirm) {
    const { store, theme, locale, pricing, features } = settings;
    await updateGeneralSettings(db, actor, 0, { store, theme, locale, pricing, features });
    settings = await getSettings(db);
  }
  for (const zone of ZONES) {
    const present = settings.delivery.zones.some((z) => z.id === zone.id);
    console.log(`zone ${zone.id}: ${present ? "present" : confirm ? "adding" : "would add"}`);
    if (!present && confirm) {
      await upsertDeliveryZone(db, actor, settings.version, zone);
      settings = await getSettings(db);
    }
  }

  // 2. Categories: parents before children (a child needs a published parent).
  const categories = await db.collection(CATEGORIES).find({}, { projection: { parentId: 1, status: 1, version: 1, slug: 1, publishedAt: 1, position: 1 } }).toArray();
  const depth = (c: (typeof categories)[number]): number => {
    let d = 0;
    let p = c.parentId;
    while (p) {
      d++;
      p = categories.find((x) => String(x._id) === String(p))?.parentId;
    }
    return d;
  };
  const drafts = categories.filter((c) => c.status === "draft" && !c.publishedAt).sort((a, b) => depth(a) - depth(b));
  let catDone = 0;
  for (const c of drafts) {
    if (confirm) await setCategoryStatus(db, client, actor, String(c._id), c.version as number, "published");
    catDone++;
  }
  console.log(`categories: ${categories.length} total, ${confirm ? "published" : "would publish"} ${catDone}`);

  // 3. Products (drafts only; the publish rules decide, failures are listed).
  const products = await db.collection(PRODUCTS).find({ status: "draft", publishedAt: { $exists: false } }, { projection: { slug: 1, version: 1 } }).toArray();
  let prodDone = 0;
  const prodFailed: string[] = [];
  for (const p of products) {
    if (!confirm) {
      prodDone++;
      continue;
    }
    try {
      await setProductStatus(db, client, actor, String(p._id), p.version as number, "published");
      prodDone++;
    } catch (error) {
      prodFailed.push(`${p.slug}: ${(error as { code?: string }).code ?? (error as Error).message}`);
    }
  }
  console.log(`products: ${confirm ? "published" : "would publish"} ${prodDone} drafts${prodFailed.length ? `, not published ${prodFailed.length}` : ""}`);
  for (const f of prodFailed) console.log(`  not published: ${f}`);

  // 4. Opening stock through the ledger (fixed adjustment id per variant).
  const variants = await db.collection(VARIANTS).find({ status: "active" }, { projection: { _id: 1 } }).toArray();
  const stock = new Map((await db.collection(STOCK).find({}, { projection: { variantId: 1, onHand: 1 } }).toArray()).map((s) => [String(s.variantId), s.onHand as number]));
  let received = 0;
  let replayed = 0;
  let zero = 0;
  for (const v of variants) {
    const qty = openingQty(String(v._id));
    if (qty === 0) {
      zero++;
      continue;
    }
    if (!confirm) {
      if ((stock.get(String(v._id)) ?? 0) === 0) received++;
      else replayed++;
      continue;
    }
    const r = await moveStock(db, client, actor, { adjustmentId: `showcase-open-${String(v._id)}`, kind: "receive", lines: [{ variantId: String(v._id), qty }] });
    if (r.replayed) replayed++;
    else received++;
  }
  console.log(`stock: ${variants.length} active variants; ${confirm ? "received" : "would receive"} ${received}, already received ${replayed}, left at 0 (out of stock) ${zero}`);

  // 5. Merchandising: showcase collections (missing slugs only) and home sections (only while none exist).
  const merch = JSON.parse(await readFile(new URL("../catalogue/horekbazar/showcase-merch.json", import.meta.url), "utf8")) as MerchFile;
  const bySlug = new Map((await db.collection(PRODUCTS).find({ status: "published" }, { projection: { slug: 1 } }).toArray()).map((p) => [p.slug as string, String(p._id)]));
  const collectionIds = new Map<string, string>();
  for (const c of merch.collections) {
    const existing = await db.collection(COLLECTIONS).findOne({ slug: c.slug }, { projection: { _id: 1 } });
    if (existing) {
      collectionIds.set(c.slug, String(existing._id));
      console.log(`collection ${c.slug}: present (left as is)`);
      continue;
    }
    const ids = c.products.map((slug) => bySlug.get(slug)).filter((id): id is string => Boolean(id));
    const missing = c.products.length - ids.length;
    console.log(`collection ${c.slug}: ${confirm ? "creating" : "would create"} with ${ids.length} published products${missing ? ` (${missing} not published, left out)` : ""}`);
    if (!confirm || ids.length === 0) continue;
    const id = String(await createCollection(db, actor, { slug: c.slug, name: c.name, ...(c.description ? { description: c.description } : {}), productIds: ids }));
    await setCollectionStatus(db, actor, id, 1, "published");
    collectionIds.set(c.slug, id);
  }
  const sectionCount = await db.collection(HOME_SECTIONS).countDocuments({});
  if (sectionCount > 0) {
    console.log(`home sections: ${sectionCount} present (left as is)`);
  } else {
    const roots = categories.filter((c) => !c.parentId).sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0));
    const sections: HomeSectionInput[] = [
      { type: "hero", order: 0, data: merch.home.hero },
      { type: "categoryTiles", order: 10, data: { ...(merch.home.categoryTilesTitle ? { title: merch.home.categoryTilesTitle } : {}), categoryIds: roots.slice(0, 12).map((c) => c._id) } },
      ...merch.home.rails.flatMap((slug, i): HomeSectionInput[] => {
        const id = collectionIds.get(slug);
        const c = merch.collections.find((x) => x.slug === slug);
        return id && c ? [{ type: "productRail", order: 20 + i * 10, data: { title: c.name, collectionId: new ObjectId(id) } }] : [];
      }),
    ];
    const gridIds = [...collectionIds.values()].slice(0, 8).map((id) => new ObjectId(id));
    if (gridIds.length) sections.push({ type: "collectionGrid", order: 900, data: { ...(merch.home.collectionGridTitle ? { title: merch.home.collectionGridTitle } : {}), collectionIds: gridIds } });
    console.log(`home sections: none yet; ${confirm ? "creating" : "would create"} ${sections.length}${confirm ? "" : " (rails need the collections, so a dry run on an empty store lists fewer)"}`);
    if (confirm) {
      for (const section of sections) {
        const id = String(await createHomeSection(db, actor, section));
        await setHomeSectionStatus(db, actor, id, 1, "published");
      }
    }
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
