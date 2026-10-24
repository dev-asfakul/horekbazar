// Phase A public-data cache (BUILD-PLAN D24–D27, docs/CACHE-INVENTORY.md): values survive the JSON
// store intact; keys carry only public inputs; "not found" and "not configured" are never stored; a
// cleared tag forces a fresh read; staleness is bounded at 2 × TTL even when nothing invalidates;
// listing keys are bounded; every admin action that writes public data invalidates, and customer
// order paths do not.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ObjectId } from "mongodb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => import("../fixtures/fake-next-cache"));
const searchIndex = vi.hoisted(() => ({ invalidateSearchIndex: vi.fn() }));
vi.mock("@/lib/modules/storefront/search-index", async (orig) => ({ ...(await orig<object>()), ...searchIndex }));

import { cleared, resetFakeCache, settle, store } from "../fixtures/fake-next-cache";
import { visibleAt } from "@/lib/modules/storefront/catalogue";
import { PUBLIC_TAGS, SEARCH_INDEX_WRITES, TAGS_FOR_WRITE, tagsFor, type PublicWrite } from "@/lib/storefront/cache-tags";
import { publicCacheLocalTestOff } from "@/lib/storefront/cache-switch";
import { afterPublicWrite } from "@/lib/storefront/invalidate";
import { POLICIES, cacheStats, cachedRead, listingCacheable, listingKey } from "@/lib/storefront/public-cache";

let now = 1_800_000_000_000;
beforeEach(() => {
  resetFakeCache();
  searchIndex.invalidateSearchIndex.mockClear();
  now = 1_800_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

describe("cachedRead", () => {
  it("serves the second read from the cache with ObjectId and Date intact", async () => {
    const id = new ObjectId();
    const at = new Date("2026-01-02T03:04:05.000Z");
    const load = vi.fn(async () => ({ id, at, nested: [{ id }], price: 8500 }));
    const first = await cachedRead("listing", "db1", ["k"], load);
    const second = await cachedRead("listing", "db1", ["k"], load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(second.id).toBeInstanceOf(ObjectId);
    expect(second.id.equals(id)).toBe(true);
    expect(second.nested[0]!.id).toBeInstanceOf(ObjectId);
    expect(second.at).toBeInstanceOf(Date);
    expect(second.at.getTime()).toBe(at.getTime());
    expect(second).toEqual(first);
  });

  it("isolates entries by policy, database and key", async () => {
    let n = 0;
    const load = async () => ++n;
    expect(await cachedRead("listing", "db1", ["a"], load)).toBe(1);
    expect(await cachedRead("listing", "db2", ["a"], load)).toBe(2);
    expect(await cachedRead("listing", "db1", ["b"], load)).toBe(3);
    expect(await cachedRead("product", "db1", ["a"], load)).toBe(4);
    expect(await cachedRead("listing", "db1", ["a"], load)).toBe(1);
  });

  it("never stores a value that keep() rejects (not found, not configured)", async () => {
    const load = vi.fn(async () => null as null | { ok: true });
    expect(await cachedRead("product", "db1", ["core", "x"], load, (v) => v !== null)).toBeNull();
    expect(await cachedRead("product", "db1", ["core", "x"], load, (v) => v !== null)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.size).toBe(0);
    const setup = vi.fn(async () => false);
    await cachedRead("setup", "db1", [], setup, (ok) => ok === true);
    await cachedRead("setup", "db1", [], setup, (ok) => ok === true);
    expect(setup).toHaveBeenCalledTimes(2);
  });

  it("does not store a loader failure", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(7);
    await expect(cachedRead("settings", "db1", [], load)).rejects.toThrow("db down");
    expect(await cachedRead("settings", "db1", [], load)).toBe(7);
  });

  it("re-reads after the tag is cleared by the matching admin write", async () => {
    let price = 100;
    const load = async () => price;
    expect(await cachedRead("listing", "db1", ["k"], load)).toBe(100);
    price = 200;
    expect(await cachedRead("listing", "db1", ["k"], load)).toBe(100); // stale until invalidated
    afterPublicWrite("banner"); // unrelated tag
    expect(await cachedRead("listing", "db1", ["k"], load)).toBe(100);
    afterPublicWrite("product");
    expect(await cachedRead("listing", "db1", ["k"], load)).toBe(200);
  });

  it("serves the stale value between TTL and 2 × TTL until a background refresh is stored", async () => {
    let v = 1;
    const load = async () => v;
    const ttl = POLICIES.listing.ttl * 1000;
    await cachedRead("listing", "db1", ["k"], load);
    v = 2;
    now += ttl + 1;
    expect(await cachedRead("listing", "db1", ["k"], load)).toBe(1); // stale-while-revalidate
    await settle();
    expect(await cachedRead("listing", "db1", ["k"], load)).toBe(2);
  });

  it("keeps serving the stale value while refreshes store nothing, never past 2 × TTL", async () => {
    let doc: { slug: string } | null = { slug: "rice" };
    const load = vi.fn(async () => doc);
    const keep = (d: unknown) => d !== null;
    const ttl = POLICIES.product.ttl * 1000;
    const start = now;
    await cachedRead("product", "db1", ["core", "rice"], load, keep);
    doc = null; // unpublished outside the app: nothing invalidates
    for (const t of [ttl + 1, ttl * 1.5, ttl * 2 - 1]) {
      now = start + t;
      expect(await cachedRead("product", "db1", ["core", "rice"], load, keep)).toEqual({ slug: "rice" });
      await settle();
    }
    now = start + ttl * 2 + 1;
    expect(await cachedRead("product", "db1", ["core", "rice"], load, keep)).toBeNull();
  });

  it("counts a stale read as a hit even when its background refresh runs", async () => {
    let v = 1;
    const load = async () => v;
    const before = { ...(cacheStats().listing ?? { hit: 0, miss: 0 }) };
    await cachedRead("listing", "db1", ["stats"], load);
    v = 2;
    now += POLICIES.listing.ttl * 1000 + 1;
    await cachedRead("listing", "db1", ["stats"], load);
    await settle();
    await cachedRead("listing", "db1", ["stats"], load);
    const s = cacheStats().listing!;
    expect(s.miss - before.miss).toBe(1); // the first read
    expect(s.hit - before.hit).toBe(2); // the stale read and the refreshed read
  });

  it("never serves an entry older than 2 × TTL (writers that cannot invalidate)", async () => {
    let v = 1;
    const load = vi.fn(async () => v);
    await cachedRead("product", "db1", ["core", "rice"], load);
    v = 2;
    now += POLICIES.product.ttl * 2 * 1000 + 1;
    expect(await cachedRead("product", "db1", ["core", "rice"], load)).toBe(2);
    expect(cacheStats().product!.tooOld).toBeGreaterThan(0);
  });

  it("keeps price and stock freshness windows short", () => {
    expect(POLICIES.listing.ttl).toBeLessThanOrEqual(60);
    expect(POLICIES.product.ttl).toBeLessThanOrEqual(60);
    for (const p of Object.values(POLICIES)) expect(p.ttl).toBeLessThanOrEqual(3600);
  });
});

describe("test-server switch", () => {
  const loop = "mongodb://127.0.0.1:41234/?replicaSet=testset";
  it("reads live only on a loopback database that asks for it, never on Vercel or a real cluster", () => {
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1", MONGODB_URI: loop })).toBe(true);
    expect(publicCacheLocalTestOff({ MONGODB_URI: loop })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "true", MONGODB_URI: loop })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1", MONGODB_URI: loop, VERCEL: "1" })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1", MONGODB_URI: "mongodb+srv://u:p@cluster0.example.mongodb.net/db" })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1", MONGODB_URI: "mongodb://127.0.0.1.evil.example:27017/" })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1" })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1", MONGODB_URI: "mongodb://127.0.0.1:27017,db.example.net:27017/?replicaSet=rs0" })).toBe(false);
    expect(publicCacheLocalTestOff({ PUBLIC_CACHE_LOCAL_TEST_OFF: "1", MONGODB_URI: "mongodb://localhost:27017/" })).toBe(false);
  });
});

describe("listing keys", () => {
  it("caches only bounded query shapes", () => {
    expect(listingCacheable({ categoryIds: ["a"], sort: "new", page: 1, pageSize: 24 })).toBe(true);
    expect(listingCacheable({ deals: true, inStock: true, page: 3 })).toBe(true);
    expect(listingCacheable({ text: "chal" })).toBe(false);
    expect(listingCacheable({ minPrice: 100 })).toBe(false);
    expect(listingCacheable({ maxPrice: 100 })).toBe(false);
    expect(listingCacheable({ publishedSince: new Date() })).toBe(false);
    expect(listingCacheable({ page: 4 })).toBe(false);
    expect(listingCacheable({ pageSize: 49 })).toBe(false);
    expect(listingCacheable({ productIds: Array.from({ length: 201 }, (_, i) => String(i)) })).toBe(false);
    expect(listingCacheable({ somethingNew: 1 } as never)).toBe(false);
  });

  it("normalises equivalent queries and separates different ones", () => {
    expect(listingKey({ categoryIds: ["b", "a"] })).toBe(listingKey({ categoryIds: ["a", "b"], page: 1 }));
    const base = listingKey({ categoryIds: ["a"] });
    for (const q of [{ categoryIds: ["a"], inStock: true }, { categoryIds: ["a"], deals: true }, { categoryIds: ["a"], sort: "price_asc" as const }, { categoryIds: ["a"], page: 2 }, { categoryIds: ["a"], pageSize: 12 }, { productIds: ["a"] }])
      expect(listingKey(q)).not.toBe(base);
  });
});

describe("tags and invalidation", () => {
  it("maps every public write to at least one tag and clears exactly those", () => {
    const all = Object.keys(TAGS_FOR_WRITE) as PublicWrite[];
    for (const w of all) {
      cleared.length = 0;
      afterPublicWrite(w);
      expect(TAGS_FOR_WRITE[w].length).toBeGreaterThan(0);
      expect(cleared.sort()).toEqual([...TAGS_FOR_WRITE[w]].sort());
    }
    expect(tagsFor(["category", "product"]).sort()).toEqual([PUBLIC_TAGS.catalogue, PUBLIC_TAGS.categories].sort());
    expect(TAGS_FOR_WRITE.settings).toContain(PUBLIC_TAGS.setup);
  });

  it("rebuilds the search index only after product and category writes", () => {
    for (const w of Object.keys(TAGS_FOR_WRITE) as PublicWrite[]) {
      searchIndex.invalidateSearchIndex.mockClear();
      afterPublicWrite(w);
      expect(searchIndex.invalidateSearchIndex).toHaveBeenCalledTimes(SEARCH_INDEX_WRITES.has(w) ? 1 : 0);
    }
  });

  it("every policy tag is one an admin write can clear", () => {
    const clearable = new Set(Object.values(TAGS_FOR_WRITE).flat());
    for (const p of Object.values(POLICIES)) for (const t of p.tags) expect(clearable.has(t)).toBe(true);
  });
});

describe("visibility windows (applied per request)", () => {
  const t = new Date("2026-06-01T00:00:00Z");
  it("matches the storefront schedule rule", () => {
    expect(visibleAt({}, t)).toBe(true);
    expect(visibleAt({ visibleFrom: null }, t)).toBe(false); // MongoDB: null is not <= now
    expect(visibleAt({ visibleTo: null }, t)).toBe(false);
    expect(visibleAt({ visibleFrom: new Date(t.getTime() + 1) }, t)).toBe(false);
    expect(visibleAt({ visibleFrom: t }, t)).toBe(true);
    expect(visibleAt({ visibleTo: t }, t)).toBe(false);
    expect(visibleAt({ visibleTo: new Date(t.getTime() + 1) }, t)).toBe(true);
  });
});

// ── Source rules ──────────────────────────────────────────────────────────────────────────
const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
function actions(file: string): Map<string, string> {
  const src = read(file);
  const out = new Map<string, string>();
  for (const part of src.split(/^(?=export async function )/m)) {
    const m = /^export async function (\w+)/.exec(part);
    if (m) out.set(m[1]!, part);
  }
  return out;
}

const PUBLIC_WRITERS: Record<string, Record<string, string[]>> = {
  "lib/actions/catalogue.ts": {
    createProductAction: ["product"], updateProductAction: ["product"], setProductStatusAction: ["product"], bulkProductStatusAction: ["product"],
    deleteProductAction: ["product"], addProductMediaAction: ["product"], removeProductMediaAction: ["product"], createVariantAction: ["product"],
    updateVariantAction: ["product"], setVariantStatusAction: ["product"], createCategoryAction: ["category"], updateCategoryAction: ["category"],
    moveCategoryAction: ["category"], setCategoryStatusAction: ["category"], deleteCategoryAction: ["category"], moveStockAction: ["stock"], setThresholdAction: ["stock"],
  },
  "lib/actions/merch.ts": {
    createCollectionAction: ["collection"], updateCollectionAction: ["collection"], setCollectionStatusAction: ["collection"], deleteCollectionAction: ["collection"],
    createBannerAction: ["banner"], updateBannerAction: ["banner"], setBannerStatusAction: ["banner"], deleteBannerAction: ["banner"],
    createHomeSectionAction: ["homeSection"], updateHomeSectionAction: ["homeSection"], setHomeSectionStatusAction: ["homeSection"], deleteHomeSectionAction: ["homeSection"],
    updateGeneralSettingsAction: ["settings"], upsertDeliveryZoneAction: ["settings"], removeDeliveryZoneAction: ["settings"],
  },
  "lib/actions/ai-drafts.ts": { applyAiFieldAction: ["product", "category"] },
  "lib/actions/admin-engagement.ts": { rewardSettingsAction: ["settings"] },
};

describe("admin writers invalidate", () => {
  for (const [file, expected] of Object.entries(PUBLIC_WRITERS)) {
    it(`${file}: each public write clears its tags before refresh/redirect`, () => {
      const fns = actions(file);
      for (const [name, writes] of Object.entries(expected)) {
        const body = fns.get(name);
        expect(body, `${name} exists`).toBeDefined();
        const call = `afterPublicWrite(${writes.map((w) => `"${w}"`).join(", ")})`;
        expect(body, name).toContain(call);
        // Every refresh()/redirect() in the action is preceded by the invalidation.
        const lines = body!.split("\n");
        lines.forEach((line, i) => {
          if (/^\s*(refresh\(\);|redirect\()/.test(line)) expect(lines[i - 1], `${name} line ${i}`).toContain(call);
        });
      }
    });
  }

  it("no other admin action writes public collections without invalidating", () => {
    // An action file that imports a public-data service must be listed above.
    // (reads such as getSettings/listX do not count).
    const services = /^import \{([^}]*)\} from "@\/lib\/modules\/(catalogue\/\w+|merch\/\w+|settings\/\w+|engagement\/settings|ai\/drafts)";$/gm;
    for (const f of readdirSync(join(root, "lib/actions"))) {
      const file = `lib/actions/${f}`;
      const names = [...read(file).matchAll(services)].flatMap((m) => m[1]!.split(",").map((n) => n.trim().replace(/^type\s+/, "")));
      const writers = names.filter((n) => /^[a-z]/.test(n) && !/^(get|list|load|find|count|is|has|check|parse|to|format|accentContrast)/.test(n));
      if (writers.length === 0) continue;
      expect(Object.keys(PUBLIC_WRITERS), file).toContain(file);
    }
  });

  it("customer order paths do not broadly invalidate listings (D26)", () => {
    for (const f of readdirSync(join(root, "lib/actions"))) {
      if (Object.keys(PUBLIC_WRITERS).includes(`lib/actions/${f}`)) continue;
      expect(read(`lib/actions/${f}`), f).not.toContain("afterPublicWrite");
    }
  });

  it("uses immediate expiry only: no revalidateTag 'max', no Cache Components", () => {
    const scan = (dir: string): string[] =>
      readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? scan(`${dir}/${d.name}`) : /\.(ts|tsx)$/.test(d.name) ? [`${dir}/${d.name}`] : []));
    for (const f of [...scan("lib"), ...scan("app")]) expect(read(f), f).not.toMatch(/revalidateTag\([^)]*["']max["']/);
    expect(read("next.config.ts")).not.toMatch(/cacheComponents\s*:\s*true|ppr\s*:/);
  });

  it("cached loaders take no request or private input", () => {
    const src = read("lib/storefront/public-cache.ts");
    for (const banned of ["cookies(", "headers(", "getPrincipal", "session", "cart", "process.env", "connection("])
      expect(src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*\*[\s\S]*?\*\//g, ""), banned).not.toContain(banned);
  });
});
