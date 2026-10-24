# Public-data cache: reader and writer inventory (Phase A)

Status: written **before** any cache was enabled. Baseline `main` @ `10a86af`. Decisions: BUILD-PLAN D17(a), D24–D27 (owner-approved 2026-10-24).
Evidence labels as in BUILD-PLAN: **[C]** read from the code, **[M]** measured, **[H]** hypothesis.

## 1. Rules

1. Only **public catalogue data** is cached. The cache never holds HTML, cookies, sessions, principals, carts, orders, accounts, reviews written by the visitor, or authorization decisions.
2. Cached functions take no request input apart from public keys: database name, locale-free query shape and slug. They never call `cookies()`, `headers()`, `getPrincipal()` or `connection()`. This is enforced in `lib/storefront/public-cache.ts` and tested in `tests/unit/public-cache.test.ts`.
3. Storefront HTML stays `private, no-cache, no-store` with a per-request CSP nonce (D17a). Partial Prerendering and Cache Components stay off.
4. The cache never decides correctness. Add-to-cart (`sellable()`), cart pricing (`quote.ts`, which reads settings live) and order placement (`checkout.ts`) read MongoDB directly and are unchanged.
5. Each cached read stores the time it was loaded. `unstable_cache` serves an expired entry while it refreshes in the background, on every request until a refresh is stored; a refresh that stores nothing (not found, loader error) leaves the old entry in place (`next/dist/server/web/spec-extension/unstable-cache.js`, Next 16.4.2). To bound that, an entry older than **2 × TTL** is not served: the reader goes to MongoDB for that request. Maximum staleness is therefore 2 × TTL for writers that cannot invalidate.
6. Invalidation follows D24:
   - Admin Server Actions call `updateTag` **after** the write has succeeded (read-your-own-writes).
   - No Route Handler writes cached public data (§4), so `revalidateTag(tag, { expire: 0 })` is not needed yet. Any future Route Handler that writes public price or stock data must use it. `"max"` is not used.

## 2. Readers (what is cached)

TTLs are the starting values. "Hard max" is the 2 × TTL bound from rule 5.

| Cached reader (`lib/storefront/public-cache.ts`) | Wraps | Key | Tags | TTL / hard max | Notes |
|---|---|---|---|---|---|
| `cachedStoreConfigured` | `storeConfigured` (installation, owner, settings exist) | db | `hb:setup` | 300 s / 600 s | **Only `true` is cached.** `false` is never stored, so finishing setup shows at once. The DB health check (`checkDatabase`, in-process 30 s) stays live |
| `cachedSettings` | `getSettings` | db | `hb:settings` | 3600 s / 7200 s | **Storefront rendering only** (`loadStore`). Admin forms, version checks, `quote.ts` and checkout keep reading live |
| `cachedCategoryTree` | `categoryTree` query (published categories) | db | `hb:categories` | 3600 s / 7200 s | The tree (Maps) is rebuilt from the cached rows on each request |
| `cachedHomeSections(now)` | `listHomeSections` | db | `hb:home` | 300 s / 600 s | Caches **all published** sections (≤ 200). `visibleFrom`/`visibleTo` are applied per request with the same rule as the query, so schedule boundaries stay exact |
| `cachedBanners(placement, now, limit)` / `cachedBanner(id, now)` | `listPublishedBanners`, `getPublishedBanner` | db | `hb:banners` | 300 s / 600 s | Caches all published banners (≤ 500, newest first). Visibility is applied per request, as for sections |
| `cachedCollections` / `cachedCollection(slug)` | `listPublishedCollections`, `getPublishedCollection` | db | `hb:collections` | 300 s / 600 s | Rule and manual collections. Their listings are cached under the listing key (below) |
| `cachedListing(q)` | `listPublishedProducts` | db + normalised query (sha-256) | `hb:catalogue` | **60 s / 120 s** | Cached only for bounded query shapes: no `text`, no `minPrice`/`maxPrice`, `page ≤ 3`, `productIds ≤ 200`. Every other query reads live (protects the cache from unbounded keys). `publishedSince` ("new arrivals", `/new`) is also read live: its key would change every minute and grow the file cache |
| `cachedCategoryShowcase` | `categoryShowcase` (count and photo per top category) | db + root ids | `hb:catalogue`, `hb:categories` | 300 s / 600 s | Map is rebuilt from entries |
| `cachedProductPage(slug)` | `getPublishedProduct` | db + slug | `hb:catalogue` | 60 s / 120 s | Caches product and active variants (names, media, **price**). **Stock is read live on every request** (one `$in` query), so the product page never shows stale availability |
| `cachedProductExists(slug)` | `countDocuments` in `resolvesInternal` | db + `exists` + slug | `hb:catalogue` | 60 s / 120 s | Banner and hero link check. Only `true` is stored, so a newly published product links at once |

Not cached, deliberately:

| Reader | Why |
|---|---|
| Search results (`/search`, `text` queries) | Unbounded keys. The in-process search index is already reused (60 s) |
| `/api/search/suggest` product rows | Approved D27: keeps live price and stock for the 4 suggestions; existing `s-maxage=60` response header unchanged. The `loadStore` part it shares with every page is cached |
| Reviews on the product page | Moderation must show at once; small query |
| Cart snapshot, principal, cart and checkout pages' quotes | Private (rule 1) |
| Sitemap | Rare; generated live |
| Admin pages | Must show live data |

## 3. Writers inside the app (Server Actions) and what they invalidate

| Writer (Server Action) | Collections written | Invalidates |
|---|---|---|
| `createProductAction`, `updateProductAction`, `setProductStatusAction`, `bulkProductStatusAction`, `deleteProductAction`, `addProductMediaAction`, `removeProductMediaAction` | products (+ variants, stock on delete) | `hb:catalogue` + search index |
| `createVariantAction`, `updateVariantAction` (**price**), `setVariantStatusAction` | variants (+ stock row on create) | `hb:catalogue` + search index |
| `createCategoryAction`, `updateCategoryAction`, `moveCategoryAction`, `setCategoryStatusAction`, `deleteCategoryAction` | categories (+ products on delete) | `hb:categories`, `hb:catalogue` + search index |
| `moveStockAction`, `setThresholdAction` | stock, inventory ledger | `hb:catalogue` |
| `applyAiFieldAction` | products or categories (one field) | `hb:catalogue`, `hb:categories` + search index |
| `create/update/setStatus/deleteCollectionAction` | collections | `hb:collections` |
| `create/update/setStatus/deleteBannerAction` | banners | `hb:banners` |
| `create/update/setStatus/deleteHomeSectionAction` | home sections | `hb:home` |
| `updateGeneralSettingsAction`, `upsertDeliveryZoneAction`, `removeDeliveryZoneAction`, `rewardSettingsAction` | settings | `hb:settings`, `hb:setup` |
| `setupOwnerAction` | installation, user | none needed: `false` is never cached (§2) |
| `placeOrderAction` (reserve), `cancelMyOrderAction`, `transitionOrderAction`, fulfilment actions (RTO and return restock) | stock | **none (D26)**. Listings rely on 60 s / 120 s. The product page reads stock live. Add-to-cart and checkout re-check stock |
| Cart, coupon, address, review, message, privacy, notification and identity actions | private collections | none (nothing public is cached from them) |
| `createPromotionAction` etc. | promotions | none: promotions are applied in `quote.ts` (live), not shown in cached reads |
| `moderateReviewAction` | reviews | none: reviews are read live |

## 4. Writers outside the Next.js server (cannot invalidate; rely on TTL)

These run in another process, or outside the app entirely, so `updateTag` / `revalidateTag` cannot reach the Next.js cache. Changes they make appear within the **hard max** of the affected reader: at most 120 s for listings, product pages and product links; 600 s for setup, home sections, banners and collections; 7200 s for settings and the category tree.

| Writer | Process | What it can change | Effect |
|---|---|---|---|
| Outbox worker (`npm run worker`, `scripts/worker.ts`) | separate Node process | email, push, courier booking and status sync. Courier status can trigger RTO restock through `fulfilment/shipments.ts` | stock in listings ≤ 120 s; product page live |
| `POST /api/jobs/drain` (cron-job.org) | Route Handler | same handlers as the worker | same. No public catalogue data is written, so no `revalidateTag` |
| `POST /api/webhooks/courier/[provider]` | Route Handler | shipment status, possibly restock | same as above |
| `npm run db:seed` / `showcase` / `showcase:images` | CLI | products, variants, categories, collections, banners, media | up to each reader's hard max. A new build starts with an empty cache; a restart may reuse the file copy (§5), still bounded by the hard max. Run them before traffic, or wait out the hard max |
| `npm run db:migrate` | CLI | schema and indexes, data migrations | as above |
| `npm run owner:bootstrap` / `admin:recover-owner` | CLI | installation, owner user | setup `true` is cached ≤ 600 s; `false` never |
| Direct edits in MongoDB Atlas | outside the app | anything | up to the reader's hard max. **Price edits made directly in Atlas can show stale on cards and product pages for up to 120 s**; add-to-cart and checkout always use the live price |
| Browser-suite seeding (`tests/e2e-db`, test process) | Playwright test process | everything the specs seed | cannot invalidate either. The disposable server (`scripts/e2e-db-server.mjs`) sets `PUBLIC_CACHE_LOCAL_TEST_OFF=1`, honoured only with a loopback MongoDB URI and outside Vercel (`lib/storefront/cache-switch.ts`, same rule as `RATE_LIMIT_LOCAL_TEST`), so that server reads public data live. Cache behaviour is proven by `tests/unit/public-cache.test.ts`, `tests/integration/public-cache.test.ts` and the Phase A mirror run |

## 5. Where the cache lives

- **Self-hosted standalone (`next start`, this sandbox):** Next's default incremental cache: in memory (50 MB LRU) plus a file copy under `.next/standalone/.next/cache/fetch-cache`, **per instance**. Measured on the mirror: 31 entries, 224 KB after the benchmark, public catalogue data only. Each stored value carries its own write time, so an entry older than 2 × TTL is never served, also after a restart (measured: the first requests after a restart read MongoDB). A new build starts empty. `updateTag` clears the instance that ran the action; other instances catch up within the hard max. A shared `cacheHandler` (for example Redis) would be needed for instant cross-instance invalidation; it is not part of Phase A.
- **Vercel:** the data cache and tag invalidation are shared by all instances, per Next's documentation. This is **not verified**: the Vercel preview builds and reports Ready, but it is behind Vercel deployment protection and no cache behaviour has been measured on it. Verify it after the first deploy (D5).
- The in-process search index (60 s) is cleared by the catalogue actions on the instance that ran them. Other instances catch up within 60 s.

## 6. Known limits

- Listing availability and the "in stock" filter can be up to 120 s behind customer orders, by design (D26). Miss rates in the Phase A PR were counted before a counter fix: a stale read whose background refresh finished first was counted as a miss, so those rates may be overstated. Stale reads now count as hits.
- When a product is unpublished or deleted outside the app, its old entry is never replaced (the refresh finds nothing to store). Past 2 × TTL each request for that slug reads MongoDB twice (the background refresh and the request itself), and Next logs a `revalidating cache with key` error each time, until the entry is evicted or the cache is rebuilt. Correctness is unaffected. Admin writes do not have this cost: `updateTag` expires the entry, so the next read is a single blocking load.
- No CI test exercises the real `unstable_cache`/`updateTag`: unit and integration tests use `tests/fixtures/fake-next-cache.ts`, and the browser DB suite runs with the cache off. Real-cache evidence comes from the Phase A mirror run only.
- `unstable_cache` is marked as superseded by `"use cache"` in Next 16. It is kept because Cache Components are excluded (D25). Revisit at the next Next.js upgrade.
- Browser search suggestions (Phase D) cannot detect catalogue changes. They expire by TTL and are cleared on navigation (D27).
