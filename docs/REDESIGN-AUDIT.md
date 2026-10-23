# HorekBazar redesign: Checkpoint A audit (2026-10-23)

Status: **approved by the owner on 2026-10-23 as the working baseline (approved audit findings).** Sections 10 to 12 (archive list, scope, checkpoint mapping) are **proposed next steps**, not approved decisions; the mapping is a planning aid and never merges Motomation's six checkpoints. Nothing is archived or deleted in this PR. No application code, dependency, schema or live design file was changed. Sandbox measurements are preliminary (Node 20, no database); database-dependent checks were not re-run here and CI results are cited as CI results. Labels: **[V]** verified in this session, **[D]** taken from project docs (not re-run), **[A]** assumption, **[R]** recommendation, **[Q]** open question.

## 0. Environment and skill

| Item | Finding |
|---|---|
| Repository | `dev-asfakul/horekbazar`, public, `main` = `1740e71` (PR #38 merge). Fresh clone, clean tree. Last 3 `main` CI push runs: success (39940737732, 39936597897, 39928866218) [V] |
| Open PRs | #28 `docs/b9-merged` only (superseded docs record) [V] |
| Stack | Next.js 16.4.2 App Router, React 19.3.1, TypeScript 6.0.3, Tailwind 4.3.3 (only `@tailwindcss/postcss`; styling is mostly hand-written CSS in `app/globals.css`, 2,373 lines), next-intl 4.14.9, MongoDB driver 7.7.0, Better Auth 1.7.12, Zod 4.6.7, `@upstash/redis` 1.39.0 + `@upstash/ratelimit` 2.2.0, `@block65/webcrypto-web-push`. npm, Node 24 (`.nvmrc`). **No Radix/shadcn, TanStack Query, Redux or Zustand is installed**, although DESIGN.md §1 lists Radix/shadcn as approved [V] |
| Scripts | `dev`, `build` (with guarded Next patch `scripts/patch-next-empty-rsc.mjs`), `lint`, `typecheck`, `test` (Vitest), `test:integration`, `test:e2e` (Playwright 3 engines), `test:e2e:db`, `check:bundle`, `db:*`, `showcase*`, `worker` [V] |
| CI | `.github/workflows/ci.yml`, single required job `check`: lint, typecheck, unit, validator drift, integration (in-memory replica set), catalogue checks, zero-env build, Playwright, signed-in journeys, canary bundle secret scan [V] |
| Deployment | Vercel project under `dev-choice`; `horekbazar-preview.vercel.app` answers `/api/health` `setupRequired:false`, `database:connected` [V]. No Vercel access from the agent; deployed commit unknown [D] |
| Sandbox limits | Node 20 here (project needs 24); no DB credentials; local checks **not re-run**, CI results cited instead |
| Motomation skill | Installed 2026-10-23 into the gitignored `.agents/skills/` with `npx skills experimental_install` (restores from the lockfile; skills CLI 1.5.18). `VERSION` 3.0.2; files identical to upstream `1a22531`; folder hash recomputed with the CLI's own algorithm = lockfile `computedHash` `932c87e1…5b49` (403 files); `skills-lock.json` unchanged; no tracked file changed [V] |

## 1. Architecture

- **Rendering:** every storefront page is dynamic: `app/[locale]/layout.tsx` calls `connection()` because the nonce CSP (D17 option a) needs per-request rendering. So no ISR, CDN HTML caching or `use cache` on the storefront [V].
- **Locales:** `/` is Bangla (rewritten to `/bn` by `proxy.ts`), `/en` is English; admin is English-only [V].
- **Data access:** server components call `lib/modules/storefront/catalogue.ts` (MongoDB aggregations) through `loadStore()` (React `cache`, per request: setup status, settings, category tree) [V].
- **Mutations:** server actions (`lib/actions/*.ts`) through `ActionForm`; cart is server-side (`carts` collection + cart-owner cookie, `lib/storefront/cart-owner.ts`) [V].
- **Client JS:** 13 client components in total (shell nav/dock, locale switch, forms, push opt-in, error boundaries). No client data fetching anywhere [V].

## 2. Routes and components

- **Storefront (38 pages):** `/`, `/categories`, `/c/[...slug]`, `/p/[slug]`, `/search`, `/collections`, `/collections/[slug]`, `/deals`, `/new`, `/cart`, `/checkout`, `/checkout/success/[orderNumber]`, auth (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`), account (`/account`, `addresses`, `orders`, `orders/[n]`, `profile`, `security`, `reviews`, `rewards`, `messages`, `messages/[id]`, `notifications`, `privacy`), info (`/about`, `/contact`, `/faq`, `/terms`, `/privacy-policy`, `/delivery-policy`, `/return-policy`), `/offline`, catch-all 404 [V].
- **Admin (31 pages):** dashboard, products, categories, inventory, collections, banners, homepage, promotions, coupons, orders, shipments, returns, customers, reviews, rewards, messages, notifications, staff, security, settings, delivery, health, audit, setup [V].
- **API routes:** `auth/[...all]`, `health`, `jobs/drain`, `media/sign`, `account/export`, `webhooks/courier/[provider]` [V].
- **Shared UI:** `components/shell/{SiteHeader,SiteFooter,BottomDock,BottomNav,LocaleSwitch,OfflineSupport}`, `components/store/{ProductGrid,ListingView,StorePager,Breadcrumbs,JsonLd,InfoPage}`, `components/commerce/{PriceTag,LabelTile,OrderSummary}`, `components/ui/Button`, `components/skeleton/Skeleton`, `components/states/*` [V].

## 3. Features and workflows (all on `main`)

Catalogue with variants, stock and ledger; collections, home sections (6 types: `hero`, `categoryTiles`, `productRail`, `banner`, `collectionGrid`, `richText`), banners; promotions, coupons; cart with re-pricing; COD checkout (`features.checkout` **off** by default); orders, cancellation; shipments (manual, Steadfast), returns; reviews (off), rewards (off), messaging; push and campaigns (off without VAPID); AI drafts (admin); privacy export and deletion requests; audit log; staff roles and 2FA [D, spot-checked in code].

## 4. Current design weaknesses (evidence: live preview screenshots at 375 × 812 and 1440 × 900, this session)

1. **Home starts with a text hero**, a `hero` home section: a 3-line display headline, a paragraph and a CTA, then 9 bordered category text boxes. The first product sits at about y = 540 on a 375 × 812 screen. Home is **8,214 px tall** on mobile, because each "rail" renders a full 2-column grid of 10 products [V].
2. **Category page:** sub-category pills, a full-width sort select and a "apply filter" button fill the first screen; products start at about y = 680 [V].
3. **Header:** text wordmark, "English" text link, no cart count anywhere (header or bottom bar); desktop account and cart are plain text links [V].
4. **Footer:** shows an internal process note to customers: "সেটআপ শেষ হলে স্টোরের কন্টাক্ট ডিটেইলস এখানে দেখাবে" (a Motomation hard ban); two unlabelled link rows; the "রিটার্ন" link is 32 × 44 px (CRITIQUE.md) [V].
5. **Product grid:** large 1:1 images with inconsistent illustrative photos; name, price and "৩টি অপশন"; **no add-to-cart on listings**, although DESIGN.md specified one; 53/144 products show beige label tiles, some with no text at all [V].
6. **Product page:** photo disclaimer ("ছবিটি প্রতীকী…"), plain number input + button, a "checkout will open later" notice; delivery-zone fees are a strength to keep [V].
7. **Desktop:** 4 columns of 260 px images with no density gain over mobile; category boxes in a loose 5-column grid [V].
8. **Overall:** a beige "ledger paper" page with hairline rules reads as unfinished rather than distinctive; no brand mark, favicon or share image (MEDIA.md) [V/D].

## 5. Performance and SEO baseline (lab, indicative only)

Method: Playwright Chromium headless 1217 from this sandbox (location unknown) against `horekbazar-preview.vercel.app`, 375 × 812, one run each; "slow" = CDP 150 ms latency, 1.6 Mbps down, CPU × 4. Not Lighthouse, not field data.

| Page | LCP fast | LCP slow | CLS | Transfer (first load) |
|---|---|---|---|---|
| `/` | 1.41 s | 1.48 s | 0 | ~708 KB, JS ~161 KB over 10 scripts |
| `/c/grocery` | 1.01 s | 1.52 s | 0–0.021 | ~487 KB |
| `/p/miniket-rice` | 1.50 s | **4.29 s** | 0 | n/m |
| `/search?q=rice` | 0.89 s | 2.28 s | 0 | ~63 KB |

- First (cold) request: `/` TTFB **4.6 s**, `/api/health` 4.1 s (curl); warm HTML TTFB ~0.5 s [V].
- Bottlenecks [R]: every page dynamic and uncached; home runs one aggregation per home section plus `listPublishedCollections` once per rail (repeated); product page LCP image on a slow link; cold starts.
- SEO [V/D]: canonical + hreflang, JSON-LD (Product/Offer, BreadcrumbList, Organization, WebSite+SearchAction), sitemap, robots; `/search` is `noindex, follow`; crawling allowed only with `SITE_INDEXING=on` (currently off: showcase). Info pages `noindex` until copy exists. Filter/sort URL indexation rules: to be checked at Checkpoint D.

## 6. Constraints that must not change without approval

- Schemas: 38 validators (`db/validators`, SCHEMA.md); `settings.theme.fontPreset` is an enum `khata | plain` used by settings, actions and tests; `homeSections` union includes `hero` and `banner`.
- Contracts: server actions in `lib/actions/*`, API routes above, env names in `.env.example`, Better Auth sessions, CSP nonce, rate limits (Upstash; fails closed in production).
- Business rules: COD only; checkout off by default; no fabricated ratings, stock or urgency; catalogue is D11 showcase data (`sample: true`), prices unapproved; images illustrative (CC0) and labelled.
- Tests that reference Khata class names: `tests/unit/skeleton.test.tsx` (`khata-grid`, `khata-item`), `tests/e2e-db/storefront.spec.ts` (`.khata-name`), `tests/e2e/shell.spec.ts` (preset loop). A redesign must update selectors, never delete assertions.

## 7. State and data fetching (current)

URL params for listing filters/sort/page; server components for all reads; server cart; `useState` locally; no global store. **Preliminary view [R, decided at Checkpoint B]:** Redux Toolkit is not justified (no complex shared client state). Zustand only if the cart count/mini-cart needs cross-component client state. TanStack Query only for client-side search suggestions, if a small route handler is approved. Motomation Tier 1 allows ≤ 30 KB gzipped JS beyond the framework, so both together must fit inside that.

## 8. Caching and search (current)

- Redis is used **only for rate limiting** (`lib/adapters/cache/rate-limit.ts`); no catalogue or search caching [V].
- Search: MongoDB `$text` index `storefront_text` (language `none`), fallback to word-prefix regex (≤ 6 words), 24 per page, full-page GET form, no suggestions API [V].
- Measured results (`/en/search`): `চাল` 5, `rice` 12, `oil` 4, `সাবান` 1; **`chal` 0, `tel` 0** (no Latin-to-Bangla transliteration); **`সাবন` 0** (no typo tolerance). Full-page round trip 0.74–0.98 s from the sandbox [V].

## 9. Risks and incomplete work

C-01 scheduled drain not configured; Next patch for #100398 must be kept; B9/B10/B11 open items (push, e-mail delivery, retention policy [L], LICENSE, k6, data-backed gate run); credentials pasted in chat need rotation; D12 location data open; Vercel access missing. Regression-sensitive: CSP nonce + dynamic rendering, cart cookie ownership, proxy rewrite, Bangla digits/money formatter, bottom dock focus rules, 3-engine Playwright suite [D].

## 10. Obsolete design artifacts (proposed next step; finalised during the design workflow, archived only at an approved checkpoint)

| Artifact | Status | Proposed handling |
|---|---|---|
| DESIGN.md: Research record, Directions, Concept, Typography, Colour, Layout, Components, Imagery, Restraint (Khata, approved 2026-10-21, now retired by the owner) | obsolete direction | Move to `docs/archive/2026-10-21-khata-direction.md`; keep Stack, Product contract, Type research, Scope, Decision trace authoritative |
| MOTION.md (Khata personality) | obsolete | Archive; rewrite at Checkpoint 4 |
| CRITIQUE.md, GATE.md (B11 drafts) | factual, keep | Keep; superseded by the new gate run |
| docs/BANGLISH-PROPOSAL.md (Latin Banglish, later replaced by Bengali script) | superseded copy proposal | Archive |
| `app/globals.css` Khata tokens, `khata-*` classes, `KhataGrid`, `config/fonts.ts` preset, settings enum value `khata` | live code and schema | **Not touched now.** Replaced during implementation; the enum value is kept or migrated only with approval |
| Remote branches `preview/horekbazar-v1`, `docs/takeover-audit-2026-10-22`, merged feature branches | fully merged | Leave (no history rewrite) |
| Previous proposal images/mockups | none found in the repo | none |

Authoritative and kept: AGENTS.md, README, SCHEMA.md, DATA.md, MEDIA.md, docs/{BUILD-PLAN, domain-rules, STATUS, HANDOFF, PROGRESS, JOBS, OWNER-SETUP, LICENSING}, `catalogue/horekbazar/` (draft package, never read by the app).

## 11. Proposed scope and validation (proposed next step) [R]

- **In scope:** storefront presentation (shell, header, bottom nav, footer, home, categories, listing, product, search + suggestions, cart and checkout styling, account and info page styling); new presentation components; a read-only suggestions route handler and Redis caching of public catalogue reads (both need approval).
- **Out of scope unless approved:** admin redesign, schema changes, auth, checkout/pricing rules, URL changes.
- **Validation:** full CI (`check`) unchanged; updated selectors with the same assertions; Motomation gate at 375/768/1440; same lab method as §5 before and after; search latency p50/p95 measured on the suggestions endpoint; axe or manual keyboard/screen-reader pass.

## 12. Mapping of the owner's checkpoints to Motomation's six (planning aid only)

A Audit → (Motomation Checkpoint 1 Stack: stated from the project, state-management additions decided at B) → **Checkpoint 2 Product contract delta** (home without hero/banner, listing add-to-cart, suggestions) → B + C = **Checkpoint 3** Research and direction with the proposal image → D + E = **Checkpoint 4** Build plan → F = build, preview branch, **Checkpoint 5** Design review → **Checkpoint 6** Gate and ship.
