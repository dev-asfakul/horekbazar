import "server-only";
// Tier: build. Phase A (BUILD-PLAN D24–D26, docs/CACHE-INVENTORY.md): the public-data cache for
// storefront rendering. HTML is still rendered per request with the CSP nonce (D17a); only public
// catalogue reads are cached, with `unstable_cache` (D25: Cache Components stay off) and tags.
//
// Rules (tested in tests/unit/public-cache.test.ts):
// - A cached loader receives no request input. Keys are the database name plus public values
//   (slug, normalised listing shape); never cookies, headers, sessions, carts or env values.
// - Values are stored as Extended JSON, so ObjectId and Date come back as themselves.
// - `unstable_cache` serves an expired entry while it refreshes in the background, on every request
//   until a refresh is stored. A refresh that stores nothing (not found, loader error) leaves the old
//   entry in place. An entry older than 2 × TTL is not served: that request reads MongoDB. Staleness
//   is bounded at 2 × TTL for writers that cannot invalidate (worker, scripts, direct Atlas edits).
// - Stock on the product page is never cached. Add-to-cart, quotes and checkout never read here.
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { BSON, type Db } from "mongodb";
import { databaseConfig } from "@/lib/adapters/db/client";
import { PRODUCTS } from "@/lib/modules/catalogue/schema";
import type { BannerDoc, CollectionDoc } from "@/lib/modules/merch/schema";
import { getSettings } from "@/lib/modules/settings/settings";
import {
  allPublishedBanners,
  allPublishedHomeSections,
  buildCategoryTree,
  categoryRows,
  categoryShowcase,
  getPublishedCollection,
  listPublishedCollections,
  listPublishedProducts,
  productPageWithStock,
  publishedProductCore,
  toHomeSection,
  visibleAt,
  type CategoryShowcase,
  type CategoryTree,
  type HomeSection,
  type Listing,
  type ListingQuery,
  type ProductPage,
} from "@/lib/modules/storefront/catalogue";
import { storeConfigured } from "@/lib/setup/status";
import { publicCacheOff } from "@/lib/storefront/cache-switch";
import { PUBLIC_TAGS, type PublicTag } from "@/lib/storefront/cache-tags";

export interface CachePolicy {
  /** Seconds before `unstable_cache` refreshes the entry (in the background, once). */
  ttl: number;
  tags: readonly PublicTag[];
}

export const POLICIES = {
  setup: { ttl: 300, tags: [PUBLIC_TAGS.setup] },
  settings: { ttl: 3600, tags: [PUBLIC_TAGS.settings] },
  categories: { ttl: 3600, tags: [PUBLIC_TAGS.categories] },
  home: { ttl: 300, tags: [PUBLIC_TAGS.home] },
  banners: { ttl: 300, tags: [PUBLIC_TAGS.banners] },
  collections: { ttl: 300, tags: [PUBLIC_TAGS.collections] },
  listing: { ttl: 60, tags: [PUBLIC_TAGS.catalogue] },
  showcase: { ttl: 300, tags: [PUBLIC_TAGS.catalogue, PUBLIC_TAGS.categories] },
  product: { ttl: 60, tags: [PUBLIC_TAGS.catalogue] },
} as const satisfies Record<string, CachePolicy>;
export type PolicyName = keyof typeof POLICIES;

/** Bumped when the stored shape of any entry changes, so old entries are never parsed as new ones. */
const KEY_VERSION = "hb-public-v1";
const HOME_SECTION_LIMIT = 200;
const BANNER_LIMIT = 500;

/** Thrown inside a loader to return a value without storing it (e.g. "not found", "not configured"). */
class NotStored<T> extends Error {
  constructor(readonly value: T) {
    super("not stored");
  }
}

interface Entry {
  at: number;
  v: string;
}

const stats = new Map<PolicyName, { hit: number; miss: number; bypass: number; tooOld: number }>();
/** Per-process counters (hit = served from the cache, miss = loaded and stored, bypass = not cacheable, tooOld = past 2 × TTL). */
export function cacheStats(): Record<string, { hit: number; miss: number; bypass: number; tooOld: number }> {
  return Object.fromEntries(stats);
}
function count(name: PolicyName, k: "hit" | "miss" | "bypass" | "tooOld") {
  const s = stats.get(name) ?? { hit: 0, miss: 0, bypass: 0, tooOld: 0 };
  s[k]++;
  stats.set(name, s);
}

const encode = (v: unknown): string => BSON.EJSON.stringify(v, { relaxed: true });
const decode = <T>(s: string): T => BSON.EJSON.parse(s, { relaxed: true }) as T;

/**
 * Reads `load()` through the Next data cache. `keep(value)` false means "return it, do not store it".
 * Exported for tests only; storefront code uses the named readers below.
 */
export async function cachedRead<T>(name: PolicyName, scope: string, key: readonly string[], load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const policy: CachePolicy = POLICIES[name];
  if (publicCacheOff()) {
    count(name, "bypass");
    return load();
  }
  // Entries produced by this call's loader. A stale read returns a parsed copy instead (and a
  // background refresh may also run this loader), so only an identical object is a miss.
  const produced = new Set<Entry>();
  const run = unstable_cache(
    async (): Promise<Entry> => {
      const value = await load();
      if (!keep(value)) throw new NotStored(value);
      const fresh = { at: Date.now(), v: encode(value) };
      produced.add(fresh);
      return fresh;
    },
    [KEY_VERSION, name, scope, ...key],
    { revalidate: policy.ttl, tags: [...policy.tags] },
  );
  let entry: Entry;
  try {
    entry = await run();
  } catch (error) {
    if (error instanceof NotStored) {
      count(name, "bypass");
      return error.value as T;
    }
    throw error;
  }
  if (Date.now() - entry.at > policy.ttl * 2 * 1000) {
    count(name, "tooOld");
    return load();
  }
  count(name, produced.has(entry) ? "miss" : "hit");
  return decode<T>(entry.v);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

// ── Setup, settings, categories ─────────────────────────────────────────────────────────────

/** `storeConfigured` for storefront rendering. Only `true` is stored: finishing setup shows at once. */
export async function cachedStoreConfigured(raw: Record<string, string | undefined>): Promise<boolean> {
  const scope = databaseConfig(raw)?.dbName ?? "none";
  return cachedRead("setup", scope, [], () => storeConfigured(raw), (ok) => ok === true);
}

/** Store settings for storefront rendering only. Admin forms, quotes and checkout read live. */
export function cachedSettings(db: Db) {
  return cachedRead("settings", db.databaseName, [], () => getSettings(db));
}

export async function cachedCategoryTree(db: Db): Promise<CategoryTree> {
  return buildCategoryTree(await cachedRead("categories", db.databaseName, [], () => categoryRows(db)));
}

// ── Home sections, banners, collections ─────────────────────────────────────────────────────

/** Published home sections visible at `now` (schedule applied per request, as `listHomeSections`). */
export async function cachedHomeSections(db: Db, now = new Date()): Promise<HomeSection[]> {
  const all = await cachedRead("home", db.databaseName, [], () => allPublishedHomeSections(db, HOME_SECTION_LIMIT));
  if (all.length >= HOME_SECTION_LIMIT) return (await allPublishedHomeSections(db, 10_000)).filter((d) => visibleAt(d, now)).slice(0, 30).map(toHomeSection);
  return all.filter((d) => visibleAt(d, now)).slice(0, 30).map(toHomeSection);
}

async function publishedBanners(db: Db): Promise<{ all: BannerDoc[]; complete: boolean }> {
  const all = await cachedRead("banners", db.databaseName, [], () => allPublishedBanners(db, BANNER_LIMIT));
  return { all, complete: all.length < BANNER_LIMIT };
}

/** As `listPublishedBanners`: newest first, visible at `now`, at most `limit`. */
export async function cachedBanners(db: Db, placement: BannerDoc["placement"], now = new Date(), limit = 4): Promise<BannerDoc[]> {
  const { all, complete } = await publishedBanners(db);
  const source = complete ? all : await allPublishedBanners(db, 100_000);
  return source.filter((b) => b.placement === placement && visibleAt(b, now)).slice(0, limit);
}

/** As `getPublishedBanner`. */
export async function cachedBanner(db: Db, id: string, now = new Date()): Promise<BannerDoc | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const { all, complete } = await publishedBanners(db);
  const source = complete ? all : await allPublishedBanners(db, 100_000);
  return source.find((b) => String(b._id) === id && visibleAt(b, now)) ?? null;
}

/** As `listPublishedCollections` (newest 200). */
export function cachedCollections(db: Db): Promise<CollectionDoc[]> {
  return cachedRead("collections", db.databaseName, [], () => listPublishedCollections(db));
}

/** As `getPublishedCollection`, answered from the cached list (no per-slug keys). */
export async function cachedCollection(db: Db, slug: string): Promise<CollectionDoc | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const all = await cachedCollections(db);
  const found = all.find((c) => c.slug === slug);
  if (found || all.length < 200) return found ?? null;
  return getPublishedCollection(db, slug);
}

// ── Listings, showcase, product page ────────────────────────────────────────────────────────

const LISTING_KEYS = new Set(["categoryIds", "productIds", "sort", "page", "pageSize", "inStock", "deals"]);

/**
 * Whether a listing query has a bounded key: no text search, no price bounds, no "published since",
 * page ≤ 3, ≤ 200 product ids, page size ≤ 48, and no field this rule does not know about.
 */
export function listingCacheable(q: ListingQuery): boolean {
  for (const [k, v] of Object.entries(q)) if (v !== undefined && !LISTING_KEYS.has(k)) return false;
  const page = Math.max(1, Math.floor(q.page ?? 1));
  return page <= 3 && (q.productIds?.length ?? 0) <= 200 && (q.pageSize ?? 24) <= 48;
}

export function listingKey(q: ListingQuery): string {
  return sha(
    JSON.stringify({
      c: q.categoryIds ? [...q.categoryIds].sort() : null,
      p: q.productIds ?? null,
      s: q.sort ?? null,
      pg: Math.max(1, Math.floor(q.page ?? 1)),
      ps: q.pageSize ?? null,
      i: q.inStock === true,
      d: q.deals === true,
    }),
  );
}

/** As `listPublishedProducts`; cached (60 s, hard max 120 s) only for bounded query shapes. */
export function cachedListing(db: Db, q: ListingQuery): Promise<Listing> {
  if (!listingCacheable(q)) {
    count("listing", "bypass");
    return listPublishedProducts(db, q);
  }
  return cachedRead("listing", db.databaseName, [listingKey(q)], () => listPublishedProducts(db, q));
}

/** As `categoryShowcase`. */
export async function cachedCategoryShowcase(db: Db, tree: CategoryTree): Promise<Map<string, CategoryShowcase>> {
  const roots = tree.roots.map((r) => r.id);
  const entries = await cachedRead("showcase", db.databaseName, [sha(roots.join(","))], async () => [...(await categoryShowcase(db, tree)).entries()]);
  return new Map(entries);
}

/** As `getPublishedProduct`: product and variants cached by slug (published ones only); stock always live. */
export async function cachedProductPage(db: Db, tree: CategoryTree, slug: string): Promise<ProductPage | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const core = await cachedRead("product", db.databaseName, ["core", slug], () => publishedProductCore(db, slug), (c) => c !== null);
  return core ? productPageWithStock(db, tree, core) : null;
}

/** As the `countDocuments` check in `resolvesInternal`: a published product has this slug. Only `true` is stored. */
export async function cachedProductExists(db: Db, slug: string): Promise<boolean> {
  const exists = async () => (await db.collection(PRODUCTS).countDocuments({ slug, status: "published" }, { limit: 1 })) > 0;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return exists();
  return cachedRead("product", db.databaseName, ["exists", slug], exists, (ok) => ok === true);
}
