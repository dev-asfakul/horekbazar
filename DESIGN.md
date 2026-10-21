# HorekBazar: Design and Architecture Record

Status: **Checkpoint 1 (Stack) approved 2026-10-21 with amendments. Checkpoint 2 (Product contract) approved 2026-10-21 with conditions (below). Checkpoint 3 (Research and direction): the amended "Khata" direction approved by the owner 2026-10-21. Checkpoint 4 (Build plan) approved by the owner 2026-10-21 with conditions: `docs/BUILD-PLAN.md`, `MOTION.md`, `SCHEMA.md` v0.2.2 and the canonical inventory ledger-key format in `docs/domain-rules.md` §4.1 (approved as a design contract); the approval does not authorise invented catalogue data, unapproved prices, unlicensed images or location data, or silently resolving open business, security or deployment decisions. Phase B0 (toolchain) in progress; Phase B1 not started.** D11: Owner authorized catalogue generation; generated catalogue pending owner review and approval. D12 (location data) remains open; D5 deferred.
Application code: Phases B0 and B1 on `preview/horekbazar-v1` (see `docs/PROGRESS.md`). D17 decided by the owner 2026-10-21: option (a), nonce CSP on every rendered page.

Skill: `asfakulsiam-motomation-design` v3.0.2 (installed with `npx skills add`, hash in `skills-lock.json`, verified identical to upstream `main`).
Rules: `gates/rules.md` and `principles/authority.md` read; designing within them.
Route: **full** (new brand, new product experience, commerce). Delivery mode: **Production template** (stated in the brief).

---

## 0. Startup audit (2026-10-21)

| Item | Finding |
|---|---|
| Workspace | Empty at start. Node 20.20.2, npm 10.8.2, git 2.53. pnpm not installed. |
| GitHub identity | `gh` authenticated as **dev-asfakul** (id 333819831) through the Perplexity git proxy. `gh auth setup-git` not needed: git is pre-wired to the proxy. |
| `dev-asfakul/horekbazar` | Did not exist (authenticated as the owner, so absence, not a permission error). **Created, private**, default branch `main`. |
| `asfakulsiam/asfakulsiam-motomation-design` | Exists, **public**, default branch `main`, 11 commits, 1 workflow (`.github/workflows/validate.yml`). dev-asfakul has **pull only** on it: this account cannot modify the skill repo, which is the intended separation. Left untouched. |
| Skill install | `npx skills add asfakulsiam/asfakulsiam-motomation-design -y` → `.agents/skills/…` and symlink `.claude/skills/…`. Diffed against the upstream clone: identical. Not vendored into this repo (`.gitignore`); pinned via `skills-lock.json`. |
| Vercel | CLI 50.28.0 authenticates as **dev-asfakul**, but its default scope `dev-choice` rejects the token and `vercel teams ls` fails. Project list not readable. **Blocker for deployment only**; not needed until Checkpoint 5. |
| Secrets | Only variable names inspected; no values printed or stored. `.env*` ignored except `.env.example`. |

---

## 1. Stack (Checkpoint 1)

### Approved stack (Checkpoint 1, 2026-10-21; open to override)

| Layer | Choice | Version checked (npm, 2026-10-21) | Licence | Why |
|---|---|---|---|---|
| Framework | Next.js App Router + React | next 16.4.2 · react 19.3.1 | MIT | Routes + data + SEO + streaming; skill default; brief preference. `adapters/next.md`. |
| Language | TypeScript, `strict` | **typescript 6.0.3 pinned at B0** (TS 7.0.2 is `latest` but its package exposes no classic compiler API, and typescript-eslint requires `typescript >=4.8.4 <6.1.0`) | Apache-2.0 | Brief requirement. |
| Styling | Tailwind CSS v4, CSS variables as theme tokens | 4.3.3 | MIT | Buyer rebranding = token file, not code edits. |
| Accessible primitives | Radix primitives via shadcn/ui source (copied in, owned) | radix-ui 1.8.1 | MIT | Dialog, sheet, menu, combobox, tabs, toast are solved a11y problems; skill says adopt, don't rebuild. Alternative: React Aria. |
| Validation + types | Zod (one schema → TS types, server validation, Mongo `$jsonSchema`) | 4.6.7 | MIT | Replaces an ODM; no second DB abstraction. |
| Database | MongoDB Atlas + **official driver only**; **replica set required** in every environment (`docs/domain-rules.md` §12) | mongodb 7.7.0 | Apache-2.0 | Brief requirement. Multi-document transactions for order + stock + ledger writes; collection validators generated from Zod (§14); atomic `$inc` with guards. |
| Auth | **Better Auth** + official Mongo adapter + two-factor plugin (`better-auth/plugins/two-factor`, verified in the 1.7.12 package) | better-auth 1.7.12 · @better-auth/mongo-adapter 1.7.12 | MIT | See D1 and D7. Email/password, Google, reset, verification, DB sessions, roles, TOTP 2FA with backup codes. |
| Cache / rate limit | Upstash Redis (HTTP) behind a `cache` port | @upstash/redis 1.39.0 · @upstash/ratelimit 2.2.0 | MIT | Serverless-safe (no TCP pool). Port lets a buyer swap to self-hosted Redis without touching features. |
| Background work | **Transactional outbox in MongoDB**, drained by a real configurable trigger: separate worker process or authenticated HTTP drain called by an external scheduler (`docs/domain-rules.md` §13). QStash optional | @upstash/qstash 2.12.1 (optional) | MIT | Emails, push, courier sync, search reindex are retried from an `outbox` collection written in the same transaction as the order. |
| Media | Cloudinary, signed direct uploads | cloudinary 2.11.0 (server only) | MIT | Brief requirement. Server signs; browser uploads; no file passes through functions. |
| Email | Resend | resend 6.34.1 | MIT | Brief requirement. Plain, bilingual templates; no React Email dependency unless needed. |
| AI assistant | Gemini, server only, per-buyer key, drafts require admin approval | @google/genai 2.30.0 | Apache-2.0 | Brief requirement. Feature hidden when key unset. |
| Web Push | Standard Push API + VAPID; library TBD (D3) | — | — | `web-push` fails the skill's maintenance and licence checks (below). |
| Realtime chat | `realtime` port: polling/SSE fallback by default, Ably adapter optional (D4) | ably 2.29.0 (optional) | Apache-2.0 | Works on any host; vendor only when a buyer enables live chat. |
| i18n | next-intl, `/[locale]` segments, `bn` + `en` | 4.14.9 | MIT | Localised routes, metadata and `hreflang`. Alternative: hand-rolled dictionaries. |
| Tests | Vitest (unit/integration), Playwright (journeys, gate), disposable test replica set via Docker or mongodb-memory-server replica-set mode (test-only, never used by the app) | vitest 5.0.5 · @playwright/test 1.64.1 · mongodb-memory-server 11.3.0 | MIT | Playwright is also what the skill's `gate.mjs` needs. |
| Load test | Grafana k6 as an external binary (not a dependency) | — | AGPL-3.0 (tool only, not distributed) | Reproducible 50K-VU plan in Checkpoint 4. |
| Hosting | Vercel for the HorekBazar demo; template kept host-portable (`output: "standalone"`, no Vercel-only APIs in core) | — | — | Buyers may deploy to Vercel Pro, a Node host or Docker. |

Package manager: **npm** (already present; zero setup for buyers). pnpm optional later.

### The three checks (`craft/stack.md`) on contested dependencies

- **Auth.js / next-auth**: `latest` is still 4.24.15; v5 has been `beta` (5.0.0-beta.32) for years. The Auth.js team announced it has [joined Better Auth](https://better-auth.com/blog/authjs-joins-better-auth) and "strongly recommend new projects to start with Better Auth". → **Rejected for a new commercial template.**
- **web-push 3.6.7**: last published January 2024 (over 12 months), MPL-2.0 (weak file-level copyleft, outside the skill's licence list). → **Flagged.** Candidates: `@block65/webcrypto-web-push` 2.0.0 (MIT, published 2026-09) or `@pushforge/builder` 2.0.5 (MIT, 2026-04); both need the fit check (bundle, security review, single-maintainer risk) at the push phase. Third option: a small in-house RFC 8291/8292 implementation on `node:crypto`.
- **Courier SDKs** (`steadfast-merchant-sdk`, `pathao-merchant-sdk`): unofficial, single maintainer, published this month. → **Rejected as dependencies**; thin typed clients written from each courier's official docs behind a `courier` port.

### Provider limits that shape the architecture (verified today)

| Provider | Free tier | Consequence |
|---|---|---|
| Vercel Hobby | Terms: "only use the Services under a Hobby plan for your personal or non-commercial use" ([Vercel terms](https://vercel.com/legal/terms)) | Hobby is fine for the template's dev/demo; any **selling** store, including a real HorekBazar, needs Pro or another host. |
| Vercel WebSockets | "public beta on all plans and runs on Fluid Compute" ([Vercel docs](https://vercel.com/docs/functions/websockets)) | Not a default dependency for chat while in beta. |
| MongoDB Atlas M0 | 512 MB storage and about 100 ops/sec ([MongoDB pricing](https://www.mongodb.com/pricing)); Flex is billed by ops/sec tiers ([Atlas Flex costs](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/)) | Dev only. 50K concurrent users means dedicated clusters **and** a design where browsing traffic is served from cache/CDN, not the database. |
| Upstash Redis | 250 MB, 500K commands/month ([Upstash pricing](https://upstash.com/pricing/redis)) | Dev only; rate-limit and cache key design must be command-frugal. |
| Cloudinary | 25 credits/month ([Cloudinary pricing](https://cloudinary.com/pricing)) | Fine for demo catalogue; buyers upgrade independently. |
| Resend | 3,000 emails/month, 100/day ([Resend pricing](https://resend.com/pricing)) | Matches "selective transactional email"; promotions go to push, not email. |
| Gemini API | Free tier content is "used to improve our products"; paid tier is not ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)) | Admin UI must warn buyers that free-tier keys share product text with Google. |
| Ably | 200 concurrent connections, 6M messages/month ([Ably free plan](https://ably.com/docs/platform/pricing/free)) | Optional adapter only. |
| BD couriers | RedX publishes docs + sandbox + webhooks; Steadfast issues API keys; Pathao docs sit behind merchant login ([ArrowBin overview](https://arrowbin.com/blog/courier-api-integration-bangladesh), secondary source) | Need merchant docs/credentials from the store owner before the courier phase. |

### Conflicts resolved by `principles/authority.md`

1. **No mock-data fallback (owner decision, 2026-10-21, authority level 1).** The skill's production-template default (zero-config `npm run dev` falling back to JSON in `data/`) is overridden. The application only ever reads real configured data sources:
   - Development uses a real, separately configured development database and the owner's own development credentials. Development, staging and production configurations are separate and never share credentials.
   - With no `MONGODB_URI`, public routes render a clear, actionable **setup-required state** (what is missing, which variable, link to the setup guide). No products are invented and no in-memory database is substituted.
   - Each integration is required only by the operation that uses it (Gemini → AI drafting; Resend → email sends; VAPID → push; courier keys → booking/tracking). Public browsing never fails because an optional integration is absent.
   - The skill's required `data/` folder is kept **only as seed input**: catalogue content the owner supplies or explicitly approves (D11). The generated draft catalogue lives separately in `catalogue/horekbazar/` and reaches `data/` only record by record after owner approval, typed by `data/schema.json`, imported into the development database by an explicit `npm run db:seed`. It may be empty; an empty development database is acceptable. It is never read at runtime and contains no fabricated products, reviews, stock or orders, no personal customer data and no production records.
2. **Skill security rule sec-03 (RLS)**: MongoDB has no row-level security. Excused with the replacement control: every data access goes through a repository layer that takes the session's `userId`/role and scopes the query; direct collection access outside `lib/db/` is lint-banned.

### Alternatives considered

- **B. Next.js + PostgreSQL (Neon/Supabase) + Drizzle**: stronger relational integrity for orders/ledgers and RLS. Rejected because the brief fixes MongoDB; noted for buyers who ask.
- **C. Separate API service (NestJS/Hono) + Next.js frontend**: clearer scaling of write paths. Rejected for v1: two deployables for every buyer, against "no unnecessary microservices". The `lib/` domain layer is written framework-free so it can be extracted later.

---

## Product contract

Checkpoint 2 of 6. Status: **approved 2026-10-21 with conditions** (D11 generated catalogue pending owner review; D12 open; D5 deferred). From approval this contract is authority level 4 (`principles/authority.md`).

Approval conditions (owner, 2026-10-21):
1. The generated HorekBazar catalogue stays an unapproved research artifact: not imported, not published, not in the reusable template. D11 stays pending owner review.
2. All 235 catalogue prices stay unapproved. Historical TCB reference prices (26 Feb 2026) and agent estimates are kept distinct, and neither is presented as a verified current selling price.
3. Product images stay missing until exact-product suitability and commercial usage rights are verified. BSTI and other compliance flags stay provisional until authoritative verification and qualified local review.
4. D12 stays open until the location dataset's source, licence, attribution, completeness and version are verified. It is resolved **before** any location-data-dependent behaviour is implemented.
5. D5 hosting stays deferred and does not block the product contract.
6. Decision status is kept consistent across `DESIGN.md`, `docs/domain-rules.md`, `docs/LICENSING.md`, `README.md`, `AGENTS.md` and `docs/PROGRESS.md`; catalogue validation and provenance records are preserved.
7. Proceed to Checkpoint 3 (research and direction) only: no application code, no database import, no deployment.

 Detailed domain rules (roles, order lifecycle, inventory, pricing, configuration, integrations, security, acceptance criteria) are in [`docs/domain-rules.md`](docs/domain-rules.md) and are part of this contract.

| Field | Answer |
|---|---|
| **Product** | A reusable, self-hosted, **single-store, multi-category online shop** template, sold to independent businesses. HorekBazar is the flagship installation: a Bangladeshi store, cash on delivery first, Bengali and English. **Its catalogue (D11):** the owner authorized generation of a proposed starter catalogue (`catalogue/horekbazar/`: 9 top-level and 30 leaf categories, 144 draft products). It is pending owner review and approval and is never loaded at runtime. Exact subtype: general retail with variants (not a marketplace, not a grocery quick-commerce app, not a SaaS). |
| **Audiences** | (1) **Shoppers**: mostly mobile, often on mid-range Android phones and unstable 3G/4G; Bengali-first, some English; return repeatedly for deals. (2) **Store staff**: owner, managers, order operators, catalogue editors, support agents, on laptop and phone. (3) **Template buyers / developers**: configure, brand, deploy and upgrade an installation. |
| **Jobs (shopper)** | 1. Find the thing I want fast (search, categories). 2. Trust the price, stock and delivery fee before I commit. 3. Order without paying online (COD) and know the order was received. 4. Know when it will arrive and track it. 5. Cancel or return without a fight. 6. Get a fair deal (sales, coupons, rewards) without being tricked. 7. Reach a person when something goes wrong. |
| **Jobs (staff)** | 1. Confirm or reject new COD orders quickly. 2. Pack, book the courier and track every parcel. 3. Keep stock correct through cancellations, failed deliveries and returns. 4. Add and edit products in both languages (optionally with AI drafts). 5. Run sales, coupons and homepage merchandising. 6. Answer customer messages. 7. See what is selling and what is stuck. |
| **Jobs (buyer/developer)** | 1. Rebrand and configure a new shop without editing core code. 2. Connect their own services. 3. Deploy and upgrade safely. |
| **Business model** | Shop revenue = product margin on COD orders. Demands: high trust (real stock, honest fees, real reviews), low failed-delivery rate (admin confirmation before processing), repeat purchase (rewards, push), operational speed. Template revenue = basic commercial licence sales; demands clean customisation boundaries and documentation. |
| **Core journeys** | See the `journey` rows in Scope (route sequences). |
| **Information architecture** | **Search-first header** (persistent search on every storefront page, category entry beside it), category tree up to 3 levels, collections as curated cross-category sets, deal surfaces (flash sale, new arrivals, preorder). Mobile: bottom bar (Home, Categories, Search, Cart, Account). Account area with side/tab navigation. Admin: separate `/admin` app with sidebar navigation by job (Orders first). |
| **Content and density** | Storefront listing pages: **medium-high** density (2 columns at 375px, 4–5 at 1440px; price, compare-at, stock and delivery signals on cards). Product page: medium (gallery, variant pickers, price breakdown, delivery estimate by zone, description, specs, reviews, Q&A excluded). Home: configurable sections. Admin: **high** density tables with filters, bulk actions and keyboard use. Data relationships: Category ⇄ Product (many-to-many, one primary), Collection ⇄ Product, Product → Variants (SKU-level stock and price), Order → Lines (variant snapshot) → Inventory ledger. |
| **Essential interactions and states** | Search with suggestions and zero-result recovery; faceted filters (category, price, availability, attributes, rating, offer type) with sort and pagination; variant selection updating price/stock; cart edits with live re-pricing; coupon apply/remove with reason on failure; address book with zone-based fee; COD order placement with idempotency; order timeline with courier tracking link; cancellation and return requests; review after delivery; push opt-in; support messaging. Every async surface has loading, empty, error and success states; every database-backed route has a **setup-required** state when the database is not configured; every integration-backed action has an **integration unavailable** state. |
| **Responsive expectations** | 375px: bottom bar, filters in a sheet, sticky add-to-cart and checkout summary, one-handed reach for primary actions. 768px: 3-column grids, filters still a sheet. 1440px: persistent filter sidebar, mega-menu for categories, wider gallery. Admin: usable on a phone for order confirmation and messaging (cards instead of tables), full tables from 1024px. |
| **Constraints** | Stack from Checkpoint 1. MongoDB replica set in every environment (transactions). Real data only (no mock fallback; `data/` holds only owner-supplied or owner-approved catalogue content; the generated draft catalogue stays in `catalogue/horekbazar/` until records are approved; an empty development database is acceptable). Legal points below are **interpretations from secondary sources that require qualified Bangladeshi legal review before launch** (register: `docs/domain-rules.md` §15). Bangladesh Digital Commerce Operation Guidelines 2021: terms, delivery, return/refund conditions shown clearly and **in Bangla** ([Mahbub & Co.](https://mahbub-law.com/ministry-of-commerce-issues-detailed-guidelines-on-e-commerce-business/)); delivery within 5 days same city / 10 days other city, complaints resolved within 72 hours, stock quantity and full charges disclosed ([The Daily Star](https://www.thedailystar.net/law-our-rights/news/overview-the-digital-commerce-operation-guidelines-2021-2128871)). Personal data law: Bangladesh's Personal Data Protection Ordinance 2025 was replaced by an Act enacted on 10 April 2026 ([DataGuidance](https://www.dataguidance.com/jurisdictions/bangladesh?topic)); consent, retention limits and data-subject rights must be supportable. Low bandwidth: performance budgets in `gates/rules.md` (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1). Every buyer owns their own data and credentials. |
| **Explicit exclusions** | Multi-vendor marketplace and seller accounts (owner brief). Multi-tenant SaaS (owner brief). Guest checkout (owner brief: account required). Native mobile apps (not requested; PWA-level install and push only). Online payments (owner, D15: COD is the only active method; the payment step ships with a provider port). SMS and phone OTP (owner, D14; `sms` port reserved). Multi-currency per store (one currency per installation). Product Q&A, gift cards, subscriptions, POS, multiple warehouses (owner, D16). Wishlist disabled unless separately approved (owner, D16). Extended/tiered licences and licence enforcement (owner, D6). Fabricated reviews, ratings, sales figures, stock or order history, and publishing or importing the generated draft catalogue without record-level owner approval (owner, D11). |
| **Success criteria** | A buyer can install, configure and brand a shop from documentation alone. A shopper can complete Home → Product → Cart → Checkout → Order confirmed on a 375px phone on a throttled connection within the performance budgets. Stock never goes negative or double-moves under concurrent orders and repeated requests (proven by tests). Every core journey passes the Motomation gate (axes X and J). 50K concurrent users is an engineering target with a load-test plan, not a claim. |

## Type research

Access: web, searched 2026-10-21. Many Bangladeshi stores render content client-side, so the fetches below saw partial pages; anything not visible is marked unverified rather than assumed.

| Site | Type | Routes | Functionality | States | Admin | Legal | Notes |
|---|---|---|---|---|---|---|---|
| [Chaldal](https://chaldal.com/) | Single-store grocery, BD, COD | Grocery, city switch, popular categories (observed) | Pay after receiving; delivery-slot choice; fee by city and order value (Dhaka ৳59 below ৳400, ৳49 above); points membership "Egg Club"; deal of the day "limited stock"; hotline 16710 (observed) | Empty cart "0 items" (observed) | unverified | 7-day return on unopened packaged goods, 1-day for perishables, listed exclusions (observed in FAQ) | Fee thresholds and itemised exclusions show what a BD shopper expects to see before ordering. |
| [Rokomari](https://www.rokomari.com/) | Single-store books + general goods, BD | Very wide category list in Bengali and English (observed); return-policy page blocked to automated readers (unverified) | Login; "N In Stock" counts on items; COD across Bangladesh; live chat, email, WhatsApp corporate and retailer lines (observed) | unverified | unverified | Policy links not visible in fetch (unverified) | Visible stock counts as a trust signal; bilingual category names. |
| [Shajgoj Shop](https://shop.shajgoj.com/) | Single-store beauty, BD | Home, Brands, Categories, Cart, Chat (observed) | Home sections: deals, top brands and offers, limited-time offers, shop by category, shop by concern (observed) | Empty bag "Your Shopping Bag is Empty" + "Start shopping" (observed) | unverified | unverified | Chat in the header; merchandising expressed as section types, which matches the brief's six configurable home sections. |
| [Pickaboo](https://www.pickaboo.com/) | Single-store electronics, BD | My Account, Cart, Payment methods (observed); rest client-rendered (unverified) | Meta description claims official warranty, EMI, nationwide delivery (observed in meta only) | unverified | unverified | unverified | Too little visible to use; listed for honesty. |
| [Medusa Next.js starter](https://github.com/medusajs/nextjs-starter-medusa) | Open-source commerce template | Product detail, product overview, collections, cart, checkout, accounts, order details (observed in README) | Stripe checkout (observed) | unverified | Separate Medusa admin (inferred) | n/a | Template baseline: buyers expect at least this route set; HorekBazar adds COD operations, inventory ledger, BD delivery and bilingual content. |

**Gaps:** checkout, account and admin screens of BD stores sit behind login (unverified). Courier dashboards not visible. Assumptions used instead are marked in `docs/domain-rules.md`.

## Scope

**Delivery mode:** Production template
**Site type:** single-store multi-category retail (COD-first, bilingual)
**Admin panel:** included

Evidence (file#pattern) is filled in during the build; Notes describe intent. Marks: requested = in the owner brief; required = the type or the law needs it; optional = feature-flagged, off by default unless noted. Level: the capability level the route or function ships at. Locale: Bengali at `/`, English at `/en/…` with shared stable Latin slugs (D10, approved at Checkpoint 2).

| Kind | Item | Mark | Evidence | Level | Notes |
|---|---|---|---|---|---|
| route | / | requested |  | backend | configurable home sections |
| route | /categories | requested |  | backend | category index |
| route | /c/[...slug] | requested |  | backend | category listing, filters, sort, pagination |
| route | /collections | requested |  | backend | collection index |
| route | /collections/[slug] | requested |  | backend | collection listing |
| route | /p/[slug] | requested |  | backend | product detail |
| route | /search | requested |  | backend | search results, filters, suggestions |
| route | /deals | requested |  | backend | flash sale and live promotions |
| route | /new | requested |  | backend | new arrivals |
| route | /preorder | requested |  | backend | preorder products |
| route | /cart | requested |  | backend | server-persisted cart for signed-in users; device cart before sign-in |
| route | /checkout | requested |  | backend | address, delivery zone and fee, payment method (COD), review |
| route | /checkout/success/[orderNumber] | required |  | backend | order received page (noindex) |
| route | /login | requested |  | integration | email/password + Google when configured |
| route | /register | requested |  | backend | account creation |
| route | /forgot-password | requested |  | integration | reset request |
| route | /reset-password | requested |  | backend | token reset |
| route | /verify-email | required |  | integration | email verification landing |
| route | /account | requested |  | backend | dashboard |
| route | /account/orders | requested |  | backend | order history |
| route | /account/orders/[orderNumber] | requested |  | integration | timeline, courier tracking link, cancel/return actions |
| route | /account/orders/[orderNumber]/invoice | required |  | backend | printable invoice (VAT line when configured) |
| route | /account/addresses | requested |  | backend | multiple delivery addresses |
| route | /account/profile | requested |  | backend | name, phone, email, language |
| route | /account/security | required |  | backend | password change, sessions and revocation, linked Google |
| route | /account/rewards | requested |  | backend | reward balance and ledger (terminology configurable) |
| route | /account/reviews | requested |  | backend | my reviews, review prompts after delivery |
| route | /account/messages | requested |  | backend | support conversations |
| route | /account/notifications | requested |  | integration | push and email preferences |
| route | /account/privacy | required |  | backend | data export and deletion request (data protection law) |
| route | /about | required |  | backend | store information |
| route | /contact | required |  | backend | phone, email, address, complaint channel (72-hour rule) |
| route | /faq | optional |  | backend | editable FAQ |
| route | /offline | required | app/[locale]/offline/page.tsx#ReloadButton | interface | offline fallback page |
| legal | /terms | required |  | backend | terms of sale, Bangla mandatory |
| legal | /privacy-policy | required |  | backend | privacy notice |
| legal | /delivery-policy | required |  | backend | zones, fees, timelines |
| legal | /return-policy | required |  | backend | return, refund and cancellation conditions |
| legal | /cookies | not required for this brief, reason: only strictly necessary cookies are used; disclosed in /privacy-policy |  |  |  |
| state | every database-backed route: setup required | requested | components/states/SetupRequired.tsx#setup-required, app/[locale]/[...rest]/page.tsx#SetupRequired | interface | owner decision D2 |
| state | every listing: loading, empty, error, filled | required |  | backend |  |
| state | /search: zero results with recovery | required |  | backend |  |
| state | /c/[...slug]: filters produce no results | required |  | backend |  |
| state | /p/[slug]: out of stock, preorder, flash sale ended mid-view, variant unavailable | required |  | backend |  |
| state | /cart: empty, item went out of stock, price changed, coupon invalid | required |  | backend |  |
| state | /checkout: zone not deliverable, stock lost at placement, duplicate submit, server error, missing or invalid phone number | required |  | backend |  |
| state | storefront listings with an empty database (no approved catalogue yet) | required |  | backend | honest empty state, no placeholder products (D11) |
| state | /account/orders: empty | required |  | backend |  |
| state | integration unavailable (email, push, courier, AI, chat) | requested |  | interface |  |
| state | 404, 500, maintenance | required | app/[locale]/not-found.tsx#notFound, app/[locale]/error.tsx#retry, app/global-error.tsx#Something went wrong, lib/maintenance.ts#503 | interface |  |
| journey | browse and buy | requested | / → /c/[...slug] → /p/[slug] → /cart → /login → /checkout → /checkout/success/[orderNumber] | backend |  |
| journey | search and buy | requested | / → /search → /p/[slug] → /cart → /checkout → /checkout/success/[orderNumber] | backend |  |
| journey | deal to order | requested | / → /deals → /p/[slug] → /cart → /checkout → /checkout/success/[orderNumber] | backend |  |
| journey | register and set up | requested | /register → /verify-email → /account/addresses → /account | integration |  |
| journey | recover password | requested | /login → /forgot-password → /reset-password → /login | integration |  |
| journey | track an order | requested | /account → /account/orders → /account/orders/[orderNumber] | integration |  |
| journey | cancel or return | requested | /account/orders/[orderNumber] → /account/orders → /account/messages | backend |  |
| journey | review a purchase | requested | /account/orders/[orderNumber] → /account/reviews → /p/[slug] | backend |  |
| journey | get help | requested | /contact → /login → /account/messages | backend |  |
| journey | admin confirms and ships | requested | /admin → /admin/orders → /admin/orders/[orderNumber] → /admin/shipments | integration |  |
| journey | admin adds a product with AI draft | requested | /admin/products → /admin/products/new → /admin/products/[id] → /p/[slug] | integration |  |
| journey | buyer configures a new shop | requested | /admin/setup → /admin/settings → /admin/settings/integrations → / | backend |  |
| function | /p/[slug]: variant pickers update price, stock, images | requested |  | backend |  |
| function | /p/[slug]: delivery fee and estimate by zone | requested |  | backend |  |
| function | /p/[slug]: quantity-tier pricing table | requested |  | backend |  |
| function | /cart: change quantity, remove, live re-price | requested |  | backend |  |
| function | /cart: apply/remove coupon with reason | requested |  | backend |  |
| function | /checkout: redeem rewards | requested |  | backend |  |
| function | /checkout: payment method step (COD only in v1) | requested |  | backend | provider port for later (D15) |
| function | push opt-in prompt after a meaningful action | requested |  | integration |  |
| function | live chat (realtime) | optional |  | integration | polling fallback ships |
| function | wishlist | not required for this brief, reason: disabled in v1 unless separately approved by the owner (D16) |  |  |  |
| function | brands as a facet and index | optional |  | backend | flag off; decided with the real catalogue (D11) |
| edge | concurrent orders for the last unit | required |  | backend | atomic guarded decrement |
| edge | repeated checkout submit / network retry | required |  | backend | idempotency key |
| edge | flash sale ends between cart and placement | required |  | backend | re-price at placement, show change |
| edge | coupon limit reached by another shopper | required |  | backend | atomic usage counter |
| edge | courier webhook delivered twice or out of order | required |  | integration | event id dedupe, monotonic status |
| edge | partial cancellation of one line | requested |  | backend |  |
| edge | failed delivery and returned parcel | requested |  | backend |  |
| edge | price or product edited after an order | required |  | backend | order lines snapshot |
| edge | product deleted that appears in past orders | required |  | backend | archive, never hard delete |
| edge | admin approves AI text while another admin edits | required |  | backend | version check |
| admin | /admin | requested |  | backend | dashboard: today’s orders to confirm, revenue, low stock, failed deliveries |
| admin | /admin/orders | requested |  | backend | queues by status, search, bulk confirm |
| admin | /admin/orders/[orderNumber] | requested |  | integration | confirm, reject, partial cancel, dispatch, tracking link, notes, timeline |
| admin | /admin/shipments | requested |  | integration | courier bookings and statuses |
| admin | /admin/returns | requested |  | backend | return requests, inspection, restock or write-off |
| admin | /admin/products | requested |  | backend | list, filters, bulk status |
| admin | /admin/products/new | requested |  | backend | create |
| admin | /admin/products/[id] | requested |  | integration | edit, variants, media, SEO, AI drafts |
| admin | /admin/inventory | requested |  | backend | levels, adjustments, ledger |
| admin | /admin/categories | requested |  | backend | tree |
| admin | /admin/collections | requested |  | backend | manual and rule-based |
| admin | /admin/homepage | requested |  | backend | section builder (six section types) |
| admin | /admin/banners | requested |  | backend | banners |
| admin | /admin/promotions | requested |  | backend | flash sales, product promotions, quantity tiers |
| admin | /admin/coupons | requested |  | backend | coupons |
| admin | /admin/reviews | requested |  | backend | moderation |
| admin | /admin/customers | requested |  | backend | list, detail, rewards adjustments |
| admin | /admin/rewards | requested |  | backend | earning and redemption rules, ledger |
| admin | /admin/messages | requested |  | backend | support inbox |
| admin | /admin/notifications | requested |  | integration | push campaigns, email template toggles |
| admin | /admin/settings | requested |  | backend | store identity, branding, locale, contact, policies, footer |
| admin | /admin/settings/delivery | requested |  | backend | zones, fees, free-delivery rules |
| admin | /admin/settings/features | requested |  | backend | feature flags |
| admin | /admin/settings/integrations | requested |  | integration | status and test per provider (no secret display) |
| admin | /admin/staff | requested |  | backend | staff accounts and roles, 2FA status and reset (Owner), session revocation |
| admin | /admin/security | requested |  | backend | own 2FA enrolment, backup codes, sessions (mandatory for Owner and Store Manager, D7) |
| admin | /admin/health | required |  | backend | database topology check, job trigger, outbox lag, dead letters, integration status |
| admin | /admin/audit | required |  | backend | audit log |
| admin | /admin/setup | requested |  | backend | first-run checklist |
| skeleton | product grid | required |  |  |  |
| skeleton | product detail | required |  |  |  |
| skeleton | search results | required |  |  |  |
| skeleton | cart and checkout summary | required |  |  |  |
| skeleton | account order list and detail | required |  |  |  |
| skeleton | admin tables and order detail | required |  |  |  |
| template | middleware.ts | required | proxy.ts#export function proxy |  | auth gate, locale routing, rate limiting, security headers. **Checkpoint 4 note:** Next.js 16 renamed `middleware` to `proxy`, so this is built as `proxy.ts`; the skill's completeness check will report `middleware.ts` missing, and that is recorded as an exception in `GATE.md` (`docs/BUILD-PLAN.md` §0, C2) |
| template | data/ with schema.json | required |  |  | seed input only, owner-supplied or approved content, may be empty (D2, D11); draft review package in `catalogue/horekbazar/` is separate and never read at runtime |
| template | README demo line | not required for this brief, reason: owner decision D2 (no mock data); README instead states that data/ holds only owner-supplied or approved catalogue content for a development database and may be empty |  |  |  |
| template | README, DESIGN, MOTION, MEDIA, SCHEMA, CRITIQUE, GATE, LICENSE, CHANGELOG, .env.example | required |  |  |  |
| route | online payment return/callback routes | not required for this brief, reason: COD only in v1 (owner brief); interface: /checkout payment method step with provider port |  |  |  |
| route | seller/vendor routes | not required for this brief, reason: single-store template, marketplace excluded by owner |  |  |  |

## Technical requirements added at Checkpoint 2

Detailed in `docs/domain-rules.md`:

- §12 MongoDB replica set required in development, test, staging and production; startup topology check.
- §13 Transactional outbox drained by a real configurable trigger (`worker` process or authenticated HTTP drain from an external scheduler); Vercel Hobby cron is not acceptable for it; jobs are "done" only after provider acceptance.
- §14 Zod is the source of truth; MongoDB validators are generated, committed and checked in CI against both the generator and the live test database.
- §15 Legal basis register: every legal claim is an interpretation needing qualified local review.
- §11 Stock concurrency proof: 100 simultaneous attempts on 10 units → exactly 10 successes, 90 `INSUFFICIENT_STOCK` rejections, never negative.

## Research record

Checkpoint 3 of 6. Status: **approved by the owner 2026-10-21 (the amended "Khata" direction).** Items labelled hypothesis or build check in "Verification status" remain unverified until measured in the build. Nothing below authorises application code, a database import or a deployment.

**Amendments after the owner's review (2026-10-21).** The design was brought back in line with the approved product contract. The contract itself was not changed.
1. **Mobile navigation:** restored the contract's five-item bottom bar (Home, Categories, Search, Cart, Account). The RunningTotalBar now sits above it inside one bottom dock, with safe-area and no-obscuring rules (Layout → Bottom dock).
2. **Category depth:** the contract says "category tree up to 3 levels". `SCHEMA.md` v0 had said depth 2 and cited `docs/domain-rules.md` §2, but that section has no depth rule, so the citation was wrong. **Resolution: maximum 3 levels everywhere, with the approved contract as the source.** The generated taxonomy uses 2 levels, which is within the limit. The catalogue checker now enforces ≤ 3 instead of 2 (details in `docs/PROGRESS.md`).
3. **Listing density:** the contract says "2 columns at 375px, 4–5 at 1440px" and "3-column grids" at 768 px. v0 had single-column rows on mobile listings. Listings now use the contract's column counts, laid out as a **ruled khata grid**: hairline rules between entries, no card boxes. Single-column ruled rows remain for the cart, checkout summary, order lines and search suggestions.
4. **Header:** aligned with the contract: persistent search on every storefront page with the category entry beside it; mega-menu at 1440 px; persistent filter sidebar at 1440 px; filter sheet below 1280 px (exact edges: Layout → Viewport bands, Checkpoint 4); admin card lists on a phone, full tables from 1024 px.
5. **Verification:** results are now labelled **measured**, **hypothesis** or **build check** (section "Verification status").

**Access:** web (searched 2026-10-21). Font files were downloaded from the official [google/fonts](https://github.com/google/fonts) repository and measured locally with fontTools 4.67. Number formatting was checked in Node 20 (ICU). Baymard's full reports are paywalled, so only their public articles and summaries were used. Shwapno was read from a cached copy, so what it showed may since have changed.

**Questions:**
1. How should a Bangla-first store set bilingual text, numbers and prices so they read well and align on a budget phone, and what do the fonts cost in bytes?
2. How do shoppers add many everyday items quickly from a phone listing without opening each product page?
3. How can a product card stay honest and useful when the product has no photo yet? (Every draft catalogue image is missing; D11.)
4. What must a cash-on-delivery shopper see before and after placing an order, so the total and the next step are never a surprise?
5. Which patterns common in Bangladeshi grocery and general stores must this store not copy, given the contract's ban on fabricated urgency and popularity?

| Source (name, URL) | Kind | Observation | Intended use | Limitation |
|---|---|---|---|---|
| [Baymard: grocery "Add to Cart" becomes a quantity picker](https://baymard.com/research-articles/grocery-add-to-cart-buttons) | case study | A static add button made testers miss what they had added. Turning the button into a quantity picker after the first add was "intuitively understood". Ocado also makes the quantity an editable text field. | Q2: the add button becomes a stepper with an editable number, in listings and on the product page | Grocery-specific; tested on US/UK sites, not Bangladeshi shoppers |
| [Baymard: mobile e-commerce research index](https://baymard.com/research/mcommerce-usability) | case study | Separate guideline sets for mobile product lists, list-item content, "Load More" buttons and showing product variations | Q2: list rows carry the comparison facts; paging uses a "load more" button with real paginated URLs | Only the public summary was read; individual guidelines are paywalled |
| [Shwapno](https://www.shwapno.com/) | production (BD grocery) | Unit prices with minimums ("৳113 Per Kg (Min. 250gm)"); a struck-through earlier price beside the offer price; chips such as "Most Picked" and "Top Seller"; emoji section titles ("Hot & Trending Right Now") | Q1/Q2: show the unit price beside the pack price. Q5: popularity chips and trending headers are left out of v1, because there is no real sales data | Cached copy, dated 2024-06-23 in the fetch metadata; whether their chips come from real data was not verified |
| [Chaldal](https://chaldal.com/) (Checkpoint 2 type research) | production (BD grocery) | Delivery fee and its order-value threshold are stated before ordering | Q4: the delivery fee line appears in the cart and on the product page, not only at checkout | Observed 2026-10-21; checkout is behind login |
| [Google Fonts family metadata](https://fonts.google.com/metadata/fonts) | docs / data | 11 families support Bengali. Anek Bangla (variable width 75–125, weight 100–800), Noto Sans Bengali (width 62.5–100, weight 100–900), Tiro Bangla (one weight plus italic), Hind Siliguri (5 static weights) | Q1: the shortlist | Metadata only; rendering was not tested in browsers yet |
| [google/fonts repository](https://github.com/google/fonts) font files, measured with fontTools | repo | **Anek Bangla's Bengali digits have uneven widths (1124–1505 units) and its tabular-figures feature covers Latin digits only. Noto Sans Bengali's Bengali digits all share one width (592).** Bengali-subset WOFF2 sizes, measured locally: Anek Bangla, both axes ≈ 446 KB; Anek at weight 400–700 only ≈ 136 KB; Noto Sans Bengali at weight 400–600 ≈ 68 KB; Tiro Bangla ≈ 78 KB (Latin ≈ 29 KB) | Q1: prices and totals are set in Noto Sans Bengali so Bengali digits line up; the width axis is not shipped | Google's served subsets differ from local subsets; re-measure in the build |
| [r12a: Bangla orthography notes](https://r12a.github.io/scripts/bengali/bn.html) | docs | "Bengali requires slightly more vertical space than Latin text"; some marks extend beyond Latin ascenders. Native digits "are used regularly in text"; ৳ is U+09F3 | Q1: Bengali line heights sit at the top of the skill's ranges; Bengali digits are the default on Bengali pages | Draft notes by a W3C expert, not a normative standard |
| [W3C Bengali Layout Requirements](https://www.w3.org/TR/2024/DNOTE-beng-lreq-20240709/) and [gap analysis](https://www.w3.org/TR/beng-gap/) | docs | Line height and mixed-script baselines are tracked as open questions, with no browser test results published yet | Q1: Bengali rendering is tested ourselves at 375 px in Chrome for Android and Safari (contract §10 already requires it) | No concrete numbers to copy |
| [Next.js font module](https://nextjs.org/docs/app/api-reference/components/font) | docs | Variable fonts load only the weight axis by default; other axes must be listed. The automatic fallback that reduces layout shift is Arial- or Times-based. `display` defaults to `swap` | Q1: no extra axes; the Bengali fallback metrics are checked by hand for layout shift in the build | Says nothing about Bengali fallback fonts |
| Node 20 `Intl.NumberFormat` (ICU), measured | measured | `bn-BD` gives `১,২৫,০০০৳` (symbol **after** the number, lakh grouping). `en-BD` gives `BDT 125,000.00` | Q1: one store-owned price formatter puts ৳ before the number, uses lakh grouping in both languages, and omits poisha when they are zero | ICU output can change between Node and browser versions; the store's own formatter avoids depending on it |
| [Setka: product card design](https://getsetka.com/product-card-design/) | case study | "If an image is missing, preserve the card's structure and provide a calm fallback"; show a comparison price "only when valid"; test with unavailable images and long names | Q3: a label tile with the same footprint as a photo | A vendor's guide; general advice, not tested in Bangladesh |
| [Cashod: COD order form](https://cashod.ma/en/blog/cod-landing-page-order-form) | case study (vendor blog) | Show the full price including delivery before the form; say plainly that the buyer pays the courier in cash; say what happens next (a confirmation call); disable the button on tap to prevent double orders | Q4: a COD line next to the place-order button, a "what happens next" block, and one-tap submission backed by the existing idempotency key | Vendor blog from another market; it cites Baymard rather than testing itself |
| Skill library: `examples/sections/hero-studio-ledger.tsx`, archetype `ledger` (`structures/archetypes.md`) | library | Ruled rows, numbers aligned right, columns that collapse under 640 px. The archetype data says it fails when "imagery is the product; casual audiences who skim not scan" | Concept reference for ruled listing entries and cart rows; the failure case is handled by the contract's multi-column grid, where each entry has a 1:1 image slot | Studio example; its split-flap counter is decorative and not used |
| [Polaris](https://polaris.shopify.com/) (skill inspiration list, commerce) | gallery | The typography page fetched today gave no usable guidance | Not used | Nothing verifiable was retrieved |

**Techniques considered:**
- Anek Bangla's variable width axis for dense labels (measured): **not used**. It adds about 290 KB to the Bengali subset, and its Bengali digits don't line up.
- One self-hosted font subset preloaded per language: **used**. The Next.js font module ([Next.js docs](https://nextjs.org/docs/app/api-reference/components/font)) was tried first in B1 and **not used**: with two Noto Sans Bengali subsets it preloaded both files on both locales (measured, Link header on `/` and `/en`). B1 self-hosts the files in `public/fonts/v1/` and preloads exactly one per locale (proposed, implementation detail).
- An add button that turns into a quantity picker, with an editable quantity ([Baymard](https://baymard.com/research-articles/grocery-add-to-cart-buttons)): **used**.
- Unit price beside the pack price ([Shwapno](https://www.shwapno.com/)): **used**, computed from the variant's net quantity. It is hidden when the net quantity has not been verified.
- Auto-rotating hero banner carousel: **not used**. Banners stay as the contract's static section type.
- Infinite scroll: **not used**. A "load more" button with paginated, crawlable URLs is used instead.
- Popularity chips, "trending" headers, countdown timers: **not used** (contract ban; no real data in v1).
- A "figures" font swapped in only for digits: **not needed** once Noto Sans Bengali became the text face.

**Pattern being avoided:** the marketplace-template storefront, with an auto-rotating banner, red "-30%" badges, countdown timers, "Top Seller" chips and a wall of multicolour department tiles. It fails this product three ways: the contract forbids invented urgency and popularity; the store launches with no photos; and on a budget phone over a slow network it costs bytes and attention for no answer to the shopper's real question: what is this, what will it cost me at the door, and when.

## Directions

| | A **Khata** (shop ledger) | B **Shelf grid** | C **Haat stalls** |
|---|---|---|---|
| Idea | The store as a shopkeeper's ruled account book. Each product is a line with its pack, its unit price and its price; the cart is the running total | The familiar marketplace grid: photo-first cards, department colours, banner-led home | Each department is a stall at a weekly market, with its own illustrated sign and an editorial home |
| Structure per route family | Storefront listings: a ruled khata grid at the contract's column counts (2 at 375 px, 3 at 768 px, 4–5 at 1440 px). Cart, checkout summary and order lines: single-column ruled rows. Product page: a spec-sheet layout. Home: six section types in the same rows. Account and admin: tables | Two-column photo grid everywhere; product page photo-led; home with banners and tiles | Home is a market map; each department has a themed landing page; listings in each stall's style |
| Type mode and motion language | SERVICE STYLE; one HOUSE STYLE voice for titles only. MOTION 1: press, focus, stepper and sheet feedback | SERVICE STYLE, generic; MOTION 1–2 (carousel, hover zoom) | HOUSE STYLE; MOTION 2 (reveals, stall transitions) |
| Journeys survive? | Browse/search/deal → product → cart → checkout → order received: yes; adding from the list skips the product page. Admin confirm-and-ship: yes, the same row system in tables | Yes, but every card depends on a photo that does not exist yet | Browse is slower: the market map adds a step before products. Admin is unaffected |
| Suitability · audience · usability · distinction · motion · responsive · technical · originality | High · high (cheap phones, cash at the door) · high (dense, scannable, tabular prices) · medium-high (ledger rows, a calm serif title voice) · fits Tier 1 · strong at 375 px · light (≈146 KB fonts per locale, no images needed) · medium-high | Medium · medium · medium · low (looks like every marketplace) · fits · fine · heavy once photos land; broken without them · low | Low-medium · medium · low for repeat staple buying · high · heavier · weaker at 375 px · needs illustration assets that don't exist · high |

**Chosen:** **A, with one idea each from B and C.**
- From B: the contract's multi-column grid itself. Each entry has a 1:1 image slot that shows a real, rights-cleared photo when one exists and the LabelTile when not. This covers the ledger archetype's known failure ("imagery is the product") without a separate display mode.
- From C: the serif title voice, the one place where HorekBazar has a character of its own. No illustrated stalls.

Against the contract: A is the only direction that works with an empty or photo-less catalogue (D11, image conditions), shows the full cost before checkout (Q4), and does not lean on invented urgency (Q5).

### How each core journey survives

| Journey | Route sequence (from the Scope table) | What A does |
|---|---|---|
| Browse and buy | / → /c/[...slug] → /p/[slug] → /cart → /login → /checkout → /checkout/success/[orderNumber] | Grid entries let a shopper add straight from the category list. Categories in the bottom bar opens the department sheet. The running total bar leads to the cart. The sign-in step keeps the cart (contract: device cart before sign-in) |
| Search and buy | / → /search → /p/[slug] → /cart → /checkout → … | Search is persistent in the header on every storefront page (contract), and Search in the bottom bar moves focus to that field. Results use the same ruled grid; zero results offer category links and clearing filters |
| Deal to order | / → /deals → /p/[slug] → /cart → … | A deal row shows the real promotion price and the end time as a plain date (never a countdown). If the deal ends mid-journey, the cart re-prices and says so |
| Track, cancel or return | /account → /account/orders → /account/orders/[orderNumber] | The order page is a khata entry: lines, totals and a status timeline in the store's words ("waiting for the store to confirm") |
| Admin confirms and ships | /admin → /admin/orders → /admin/orders/[orderNumber] → /admin/shipments | Same token system, denser rows, tabular figures, status chips that carry a text label as well as colour |

## Divergence

- **Prior similar build:** none: first build ever. `node scripts/memory.mjs similar` reported "No log yet: first build, no divergence required."
- **Diverging from → chose:** none required.
- **Same, justified:** none.

## Concept

- **Tension:** হরেক ("a bit of everything") means nine unlike departments, from rice to earbuds, in a catalogue that may launch with no photos. The shopper on a budget phone, paying cash at the door, needs certainty: the exact item, the exact total, and what happens next.
- **Concept sentence:** HorekBazar reads like a shopkeeper's khata: every item a ruled line with its pack, its price and the running total in plain Bangla, so a shopper who pays cash at the door knows exactly what is coming and what it costs.
- **Structure:**
  - Overall IA comes from the approved contract.
  - Archetype `ledger`, mutated for commerce: the ruled entry is the product unit and the cart is the running sum. It shapes storefront listings (as a ruled grid at the contract's column counts), search, the cart, checkout summary and order pages (as ruled rows), and admin tables (card lists on a phone, full tables from 1024 px, per the contract).
  - Archetype `catalogue` (spec sheet) shapes the product page.
  - Home is the six-section builder from the contract, set in the same system.
- **Exploration tools used or rejected:**
  - Archetypes: used (ledger and catalogue, see above).
  - Skill palette search: considered "Saffron Market" and rejected it, because its saffron accent sits too close to the warning amber that order statuses need.
  - Collision and style recipes: not used. The concept came directly from the contract's tension.
  - Library sections: see Components.
- **Signature move:** the **running total bar** (the khata total). Once the cart has something in it, a slim bar on mobile sits directly above the contract's five-item bottom bar, in the same bottom dock. It shows item count, merchandise subtotal and "delivery fee at checkout, from ৳…" from the real delivery zones. It updates on every stepper change (with a polite screen-reader announcement) and opens the cart. It is real data and a real control, never decoration.
- **Dials:**
  - Storefront (home, listings, product, search): ENERGY 2 · RHYTHM 1 · MOTION 1.
  - Cart, checkout, account, admin: ENERGY 1 · RHYTHM 1 · MOTION 1.
  - Tier 1 everywhere.
- **Rejected:**
  - Department colour coding: noise, and it would steal the one accent.
  - Hero carousel: auto-rotating, and it hides content.
  - Countdown timers and popularity chips: banned by the contract.
  - Decorative illustration: no assets, and it adds weight.
  - Dark mode in v1: the contract doesn't require it, and the tokens are semantic, so it can be added later.
  - Anek Bangla's width axis: about 290 KB, and its Bengali digits don't line up.
  - Animated price or count-up figures: a price must never be mid-animation when read.

## Typography

Type mode: **SERVICE STYLE** (information-led) for every functional surface, because the shopper compares pack, price and total. A **HOUSE STYLE** voice is used only for page titles, home section titles, the wordmark and the order-received headline.

| Role | Family | Weight/axes | Size token | Notes |
|---|---|---|---|---|
| Display | Tiro Bangla (OFL; Bengali + Latin) | 400 (static; italic not loaded) | `--step-3` to `--step-5` | Page titles, home section titles, wordmark, order-received headline. Never prices, buttons, forms or card product names. Line height 1.2 in both languages (top of the skill's heading range, because Bengali marks need the room). Swap, not preloaded |
| Heading | Noto Sans Bengali (OFL; Bengali + Latin) | variable `wght` 400–600, width fixed at 100 | `--step-1` / `--step-2` | Product names on the product page (600), grid-entry and row titles (500, two lines maximum), sub-headings. Line height 1.3 in Bengali (above the skill's 1.05–1.2 heading range, because Bengali marks reach past Latin ascenders per r12a; confirmed in the prototype), 1.2 in English |
| Body | Noto Sans Bengali | 400 | `--step-0` (16 px floor) | Line height 1.6 in Bengali, 1.5 in English; measure ≤ 68ch. **The one preloaded file per locale** (the Bengali subset on `/`, the Latin subset on `/en`). Listing and product-text pages usually have text as the largest element, so the text face is preloaded instead of the display face; this is checked against measured LCP in the build |
| Mono / labels | none (no mono). Labels and meta use Noto Sans Bengali 500 | 500 | `--step--1` (14 px) and `--step--2` (12 px floor, captions only) | Unit price, pack size, status chips, legal small print |
| Figures | Noto Sans Bengali, `font-variant-numeric: tabular-nums` | 400 / 600 for totals | inherits | Bengali digits share one width natively; Latin digits are tabular in this face too (measured). Prices align in rows, the cart and admin tables |

**Scale** (compact, ratio ≈ 1.2, base 16 px): `--step--2` 12 · `--step--1` 14 · `--step-0` 16 · `--step-1` 19 · `--step-2` 23 · `--step-3` 28 · `--step-4` 33 · `--step-5` `clamp(33px, 4vw + 16px, 44px)`. Bengali and English share tokens; whether their visual sizes match is checked in the build prototype. Noto's x-height is 0.536 em and Tiro's 0.475 em, measured from the font files.

**Numbers and money:**
- One store formatter, not `Intl` defaults: ৳ goes before the number with no space (`৳১,২৫০` on `/`, `৳1,250` on `/en`).
- Lakh grouping (`১,২৫,০০০`) in both languages by default; poisha shown only when not zero.
- Settings `numerals: bengali | latin` (default `bengali` on `/`) and `grouping: south_asian | western` (default `south_asian`) are buyer-configurable through the existing `settings` document (`docs/domain-rules.md` §8).
- Admin defaults to Latin digits, configurable per staff user.

**Font budget (measured locally):** about 146 KB on a Bengali first view (Noto Bengali ≈ 68 KB preloaded + Tiro Bengali ≈ 78 KB swapped). The gate allows "≤ 1 preloaded file, `font-display: swap`" and this complies; the real figure is re-measured in the build.

**Font budget re-measured in B1 (shipped files, bytes):** Noto Sans Bengali instanced to `wght` 400–600 from the Google Fonts v33 files: Bengali 74,068, Latin 17,300, Latin Extended 9,756. Tiro Bangla 400 (Google v8): Bengali 81,932, Latin 26,892, Latin Extended 12,980. A Bengali first view loads 74,068 B (preset `plain`) or 156,000 B (preset `khata`, Tiro swapped, not preloaded). An English first view preloads 17,300 B. `৳` (U+09F3) is in the Bengali subset, so an English page that shows a price also downloads the Bengali Noto file (not preloaded) **[M]**. Licences: `public/fonts/OFL-*.txt`.

**Template presets** (`config/` font presets, `docs/domain-rules.md` §8):
- `khata`: Tiro Bangla + Noto Sans Bengali, the HorekBazar flagship.
- `plain`: Noto Sans Bengali only, the template default with the lightest load.
- Both are bundled at build; buyers pick one in settings.

**To verify in the build:**
- Conjunct and reph rendering (for example ক্ষ, ন্ত্র, র্য, ঙ্ক, স্ট্র) at 14 and 16 px in Chrome for Android and Safari on iOS, in both faces.
- Fallback-font layout shift with a Bengali system fallback.
- Mixed-script baselines (a Latin brand name inside a Bengali product name).

## Colour

Light theme only in v1. Tokens are semantic, and buyers set the brand colours (`settings`). Contrast was measured with the skill's `scripts/contrast.mjs`.

| Token | Value | Contrast vs ground | Use |
|---|---|---|---|
| `--ground` | `#FAF7F0` (khata paper) | — | page background |
| `--surface` | `#F1ECE1` | — | label tiles, summary panels, header search field, zebra rows in admin |
| `--raised` | `#FFFFFF` | — | inputs, sheets, dialogs |
| `--ink` | `#1B1A17` | 16.26:1 (14.77:1 on surface) | text, primary icons |
| `--muted` | `#5C574E` | 6.70:1 (6.08:1 on surface) | unit price, pack size, meta, helper text |
| `--line-strong` | `#8C857A` | 3.41:1 (3.65:1 on white) | input and stepper borders, focusable control outlines (≥ 3:1 for UI components) |
| `--line` | `#D9D2C3` | 1.40:1 | decorative row rules only, never the only boundary of a control |
| `--accent` | `#1E4E9C` (khata blue ink) | 7.47:1 (6.79:1 on surface) | the one action per view (Add, Checkout, Place order), focus ring, active filter, links. Footprint ≤ 5% |
| `--accent-ink` | `#FFFFFF` | 7.99:1 on accent | text on accent buttons |
| `--success` | `#1F6B3A` | 6.09:1 | confirmed and delivered statuses, success messages (always with an icon and text) |
| `--warning` | `#8A5A00` | 5.53:1 | awaiting confirmation, low stock (real counts only), price changed |
| `--danger` | `#B3261E` | 6.10:1 | errors, rejected and cancelled statuses, remove (always with an icon and text) |

- **Brand colour safety:** when a buyer saves a brand colour in `/admin/settings`, the server checks it against `--accent-ink` and `--ground` (≥ 4.5:1 each). If either fails, it refuses with the measured ratio, so a rebrand cannot ship unreadable buttons.
- **Rejected:** saffron/turmeric accent (too close to `--warning`); green accent (clashes with `--success` and reads as "confirmed"); gradients (nothing in the concept calls for one).

## Layout

- **Viewport bands (the single definition; Checkpoint 4, proposed).** The edges follow Tailwind's `md` 768, `lg` 1024 and `xl` 1280; each band starts **at** its lower edge, so exactly one layout applies at 768, 1024 and 1280 px. Other documents point here.

  | Band | Widths | Test width | Navigation | Listing columns | Filters | Context strips | Admin lists |
  |---|---|---|---|---|---|---|---|
  | S | 0–767 px (`width < 768px`) | 375 (also 320 reflow, 390) | **bottom dock**: five-item bottom bar + at most one context strip; sticky search row with the category button (opens the department sheet) | **2** | `FilterSheet` | StickyBuyStrip (`/p`), CheckoutSummaryStrip (`/checkout`), RunningTotalBar (other routes, cart not empty, not `/cart`) | cards |
  | M | 768–1023 px | **768** | **no dock**: header with persistent search, category button (department sheet), account and cart links | **3** | `FilterSheet` | none: buy box, checkout summary and cart total stay in the page flow | cards |
  | L | 1024–1279 px | 1024 | as M | 4 | `FilterSheet` | none | **tables** |
  | XL | ≥ 1280 px | **1440** | as M, with the **mega-menu** in place of the category button | **4** with the filter sidebar; **5** without | persistent `FilterSidebar` | none | tables |

  The contract's 1440 px behaviours (sidebar, mega-menu, 4–5 columns) begin at 1280 px, which includes 1440. Bands M–XL add no new feature; they only stop showing the mobile dock. Phones in landscape wider than 767 px get band M **[H: checked on devices]**.
- **Page layout grid** (not the listing columns): 4 columns under 640 px, 8 from 640 px, 12 from 1024 px; content max-width 1240 px.
- **Margins / gutters:** margins 16 / 24 / 32 px; gutters 12 / 16 / 24 px; 4 px spacing base (`4 8 12 16 24 32 48 64 96`).
- **Listing entry (ruled khata grid):** **2 columns at 375 px, 3 at 768 px, 4–5 at 1440 px** (contract).
  - Each entry: 1:1 image slot (photo or LabelTile) · name (two lines maximum) · pack and unit price in `--muted` · price in tabular figures · AddToCart, which becomes a stepper.
  - Entries are separated by 1 px `--line` rules (horizontal between rows, vertical between columns); no card boxes and no shadows.
  - At 375 px with 16 px margins and a 12 px gutter, each entry is about 165 px wide (arithmetic). The stepper (44 + 48 + 44 px) fits in it; this is checked in the 375 px prototype.
  - Touch targets are at least 44 × 44 px.
- **Ruled row (single column):** for cart lines, checkout summary, order lines and search suggestions: 64 px image or LabelTile · name · pack and unit price · price aligned right · stepper or quantity. At least 72 px tall.
- **Section spacing:** home sections 48 px mobile / 72 px desktop; within routes 24 / 32 px.
- **Nav (contract navigation, unchanged):**
  - Header on every storefront page: wordmark, **persistent search field** with the **category entry beside it**, language switch (`EN` / `বাংলা`, keeps the page per §10), account and cart on desktop.
  - At 375 px the search field is a full-width row under the wordmark, and the category button (বিভাগ) sits beside it. **Checkpoint 4 refinement (proposed):** the wordmark row scrolls away and the search row stays sticky (about 52 px **[H]**), so Search in the bottom bar can focus it without a scroll jump (`docs/BUILD-PLAN.md` §5).
  - Band S (below 768 px, tested at 375 px): **five-item bottom bar: Home (হোম), Categories (বিভাগ), Search (খুঁজুন), Cart (কার্ট, with a count), Account (অ্যাকাউন্ট)**.
    - Categories opens the department sheet (9 departments, then their sub-categories; up to 3 levels).
    - Search moves focus to the header search field (it scrolls into view if needed) and opens suggestions.
    - Cart and Account go to `/cart` and `/account`.
    - The current item has `aria-current="page"` and a text label, never an icon alone.
  - Bands M and L (768–1279 px): header navigation, no dock, filter sheet.
  - Band XL (≥ 1280 px, tested at 1440): **mega-menu** for categories and a persistent filter sidebar.
- **Bottom dock (band S only, below 768 px; tested at 375 px; proposed rules so the two bars coexist):**
  - **One fixed container at the bottom**, stacking from top to bottom:
    1. at most one **context strip**, chosen by priority: PDP sticky add-to-cart (contract) > checkout sticky summary with the place-order button (contract) > RunningTotalBar;
    2. then the five-item bottom bar.
  - So two strips are never shown together. The RunningTotalBar does not appear on `/p/[slug]` (the add-to-cart strip shows the price and stepper there), `/cart` (the page is the total) or `/checkout` (the checkout summary strip replaces it).
  - **Heights (proposed):** bottom bar 56 px, context strip 56 px, plus `env(safe-area-inset-bottom)` padding on the dock. The `env()` function returns the safe distance and is 0 on rectangular screens ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)). Whether iOS also needs `viewport-fit=cover` for a non-zero inset is not confirmed in MDN and is **checked in the build**.
  - **Never obscure content:**
    - The dock publishes its measured height as `--dock-h` (updated whenever its size changes).
    - `main` gets `padding-bottom: calc(var(--dock-h) + 16px)`, so the last content, the footer and form actions are never under it.
    - The page sets `scroll-padding-bottom: calc(var(--dock-h) + 16px)`, so keyboard focus and in-page jumps never land behind it. This follows WCAG 2.2 SC 2.4.11 technique C43, which names a sticky footer that hides focus as failure F110 ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
  - **Forms and the on-screen keyboard:**
    - While a text field is focused, the bottom bar and any context strip are removed from view and from the tab order. They return when focus leaves the field.
    - On `/checkout` the place-order button is always reachable: it lives in the checkout summary strip, which comes back when the field loses focus, and it is repeated at the end of the form in normal page flow.
  - **Stability:** the dock never hides on scroll. The RunningTotalBar enters with the dock's height reserved, so content does not jump (CLS). It announces changes politely and has no entry animation under reduced motion.
  - **Toasts** (for example "removed, undo") appear above the dock, never over the bottom bar.
- **Admin:** card lists on a phone, full tables from 1024 px (contract); the storefront bottom bar is not shown in `/admin`.
- **Footer (sign-off):** store contact and hotline, address, complaint channel (contract: 72-hour rule), policy links (terms, privacy, delivery, returns), and the plain statement "Payment: cash on delivery. Orders are confirmed by the store before dispatch." No payment logos for methods that are not offered (D15).
- **Checkout:** one column on mobile with the order summary as a collapsible khata at the top, two columns on desktop. The delivery fee is shown from the moment a zone is known. A COD line and a "what happens next" block sit beside the place-order button.

## Components

The stack is shadcn/ui on Radix primitives with Tailwind (Checkpoint 1). Choice per piece (`craft/components.md`); final list at Checkpoint 4.

- **Buttons:** reuse shadcn Button. Variants: `primary` (accent), `secondary` (ink outline using `--line-strong`), `quiet` (text), `danger`. Every state: default, hover, focus (2 px accent ring, 2 px offset), active, disabled, loading (label kept, spinner beside it, `aria-busy`).
- **Links:** accent and underlined in body text; ink in navigation, with the underline on hover and focus.
- **Cards (only if needed):** none on listings; grid entries and rows are separated by `--line` rules. Panels (cart summary, checkout summary, account blocks) use `--surface` with no shadow.
- **Forms:**
  - Reuse shadcn form primitives with Zod (the domain's validation).
  - Labels above fields; validation on blur and on submit; errors in `--danger` with an icon and text, linked by `aria-describedby`.
  - Phone field: one input, `inputmode="tel"`, Bangladeshi format validated as typed, with a line explaining why: "the store calls this number to confirm your order".
- **Build (custom, because they are the concept or no maintained equivalent exists in the stack):**
  - `QuantityStepper`: − / editable number (`inputmode="numeric"`) / +; minimum 0 removes the item (with an undo toast); maximum is the real available stock; changes announced politely. Pattern from [Baymard](https://baymard.com/research-articles/grocery-add-to-cart-buttons); Radix has no number field, so it is built rather than adding a second component library.
  - `AddToCart`, which becomes the stepper after the first add.
  - `PriceTag`: price, optional genuine compare-at price, unit price, formatter.
  - `LabelTile`: the honest no-photo tile.
  - `KhataEntry`: a ruled listing-grid entry (2 / 3 / 4–5 columns).
  - `KhataRow`: a ruled single-column row (cart, checkout summary, order lines, search suggestions).
  - `BottomDock`: the fixed bottom container; measures and publishes `--dock-h`, applies the safe-area inset, picks one context strip by priority, and hides while a text field is focused.
  - `BottomNav`: the contract's five-item bottom bar (Home, Categories, Search, Cart, Account), with text labels, `aria-current` and a cart count announced as text.
  - `RunningTotalBar`: the signature; a context strip inside `BottomDock`.
  - `StickyBuyStrip` (PDP) and `CheckoutSummaryStrip` (checkout): the contract's sticky add-to-cart and checkout summary, as context strips inside `BottomDock`.
  - `OrderTimeline`: status steps with text labels.
  - `DeliveryFeeLine`.
  - `SetupRequired` and `EmptyState` (contract D2 and D11 states).
- **Reuse from Radix/shadcn (never rebuilt):** Dialog and Sheet (department sheet from the bottom bar, filter sheet below 1280 px, cart on desktop), NavigationMenu (mega-menu from 1280 px, band XL), Select, RadioGroup (variant chips with an out-of-stock state), Checkbox, Tabs, Accordion, DropdownMenu, Toast.
- **Adapt from the skill library:** `loader-skeleton` without its moving shimmer; skeletons are static blocks matching the grid-entry or row layout, so reduced-motion users see no difference.
- **Rejected from the skill library:**
  - `gallery-shop-carousel`: carousel.
  - `testimonial-shop-notes`: the contract allows only real, verified-purchase reviews.
  - `count-up`, `split-flap`: prices and stock must never animate or look like a counter.
  - `confetti`, `shimmer-button`, `glow-border`, `rainbow-border`: no purpose in a COD flow.

## Imagery

- **Source:** only rights-cleared images of the exact item stocked: own photography, or supplier images with written permission (`catalogue/horekbazar/IMAGE-ACQUISITION.md`; Checkpoint 2 condition 3). No stock photos pretending to be products. No AI images presented as real products.
- **Treatment:**
  - 1:1 crop, neutral background, no added text or badges, consistent scale within a category.
  - Delivered as AVIF or WebP through the store's own Cloudinary account at 160 / 320 / 640 / 1200 px widths with `sizes`, always with width and height.
  - The main product-page image is not lazy-loaded; listing images below the first screen are lazy.
- **Missing image:** `LabelTile`, the same 1:1 footprint on `--surface`. It shows the verified net quantity large (for example "৫ কেজি") and the category name small. If the net quantity is unverified, it shows only the category name. It says nothing like "photo coming soon" and never shows a stand-in photo.
- **`[NEEDS ASSET]` list:**
  - Store logo (until supplied, the wordmark is set in Tiro Bangla as type).
  - Favicon and app icons.
  - Default Open Graph image (generated from tokens and the wordmark when no product image exists).
  - 144 product images (all missing, D11).
  - Optional banner images for the home banner section (owner-supplied, rights recorded in `MEDIA.md`).

## Restraint Gate record

- Concept survived: yes, after 2 changes (Anek Bangla's width axis was dropped on file size and digit alignment; after the owner's review the listings follow the contract's column counts as a ruled grid, and the bottom bar is restored with the RunningTotalBar above it in one dock). The identity comes from the ruled entries and rows, the serif title voice and the running total.
- Cut: department colour coding — fails Q1 and Q2 (no hierarchy, feedback or story; the brief doesn't need it)
- Cut: decorative marketplace badges and popularity chips — fails Q1 and Q2 (no hierarchy, feedback or story; the brief doesn't need it)
- Kept: the 1 px row rules (`--line`) — fails Q1, passes Q2: the khata concept and scannable comparison of pack and price need them
- Kept: the Tiro Bangla title voice — fails Q1, passes Q2: a reusable template still needs one recognisable HorekBazar character, and it costs no images
- Rejected animation: auto-rotating home banner — fails "does it give feedback or show state?" and "does the brief need it?"
- Rejected animation: count-up on prices, totals or stock — fails "does it give feedback or show state?" (a moving number is not a readable price)
- Rejected animation: shimmer on skeletons — fails "does the brief need it?" (static skeletons do the job; less motion for reduced-motion users)

## Verification status

Three labels, so that nothing proposed reads as proven. **No item in the build-check column has been run**: nothing has been built.

**Measured (2026-10-21, reproducible):**
- Bengali digit widths in the font files: Anek Bangla 1124–1505 units with no tabular alternates for Bengali digits; Noto Sans Bengali 592 units for every digit (fontTools on the google/fonts files).
- Bengali-subset WOFF2 sizes, made locally with fontTools: Anek Bangla, both axes ≈ 446 KB; Noto Sans Bengali, weights 400–600 ≈ 68 KB; Tiro Bangla ≈ 78 KB (Latin ≈ 29 KB).
- `Intl.NumberFormat` output in Node 20: `bn-BD` gives `১,২৫,০০০৳`; `en-BD` gives `BDT 125,000.00`.
- Contrast of 13 token pairs (`scripts/contrast.mjs`): text 5.03:1 to 16.26:1; control border 3.41:1; decorative line 1.40:1.
- Catalogue checker and Ajv schema check on the draft package, including the new 3-level depth rule and its negative test.
- Calculated, not measured: listing entry width at 375 px ≈ 165 px.

**Hypotheses (proposed; reasoned from research, not yet tested):**
- Product text, not a display title, will be the largest element on listing and product pages, so preloading the text face helps LCP more than preloading the display face.
- Bengali headings need line height 1.3 (r12a: Bengali needs more vertical space); the exact value is not tested.
- A ruled khata grid reads faster for staples than boxed cards (no user testing done).
- About 146 KB of fonts on a Bengali first view is acceptable on slow mobile networks.
- A 56 px bottom bar plus a 56 px context strip leaves enough content area at 375 × 667 px.
- About 165 px is enough for a two-line Bengali name, pack, unit price, price and stepper.

**Build checks (required later; each result is recorded in `GATE.md`/`CRITIQUE.md` before anything is claimed):**

| Area | Check | Pass condition |
|---|---|---|
| Bengali rendering | Conjuncts and reph (for example ক্ষ, ন্ত্র, র্য, ঙ্ক, স্ট্র) at 12, 14 and 16 px in Noto Sans Bengali and Tiro Bangla, in Chrome for Android and Safari on iOS | correct shaping, no clipping or collisions |
| Mixed script | A Latin brand name or unit inside Bengali text; Bengali and Latin digits side by side | shared baseline, no line-height jump |
| Fallback-font layout shift | Load with fonts blocked or slow; Bengali system fallback, then web font | CLS ≤ 0.1 from font swap; fallback metrics adjusted if not |
| Keyboard | Every core journey with keyboard only: header search, department sheet, mega-menu, filters, stepper, bottom bar, context strips, checkout | logical order, visible focus, focus never fully hidden by the dock (WCAG 2.4.11), sheets trap and return focus |
| Screen readers | TalkBack (Android Chrome), VoiceOver (iOS Safari), NVDA (desktop) in Bengali and English | names, roles and states announced; cart count, running total and stepper changes announced politely; Bengali digits read correctly |
| 375 px usability | Every storefront route at 375 × 667 px | no horizontal scroll; targets ≥ 44 × 44 px; the dock never covers content, form controls or checkout actions, including with the on-screen keyboard open |
| Safe area | iPhone with a home indicator, Android with gesture navigation | bars clear the inset; the `viewport-fit=cover` need confirmed |
| Reduced motion | `prefers-reduced-motion: reduce` | no entry or slide animations; state changes still visible |
| Performance budgets | Mid- and low-tier Android, throttled mobile network, field data once live | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; JS within the Tier 1 budget; ≤ 1 preloaded font; served font sizes re-measured |
| Contrast on rendered pages | Real rendered states (hover, focus, disabled, status chips, brand-colour presets) | text ≥ 4.5:1, UI components ≥ 3:1 |

## Build plan (Checkpoint 4)

Checkpoint 4 of 6. Status: **approved by the owner 2026-10-21 with conditions** (`docs/BUILD-PLAN.md`, `MOTION.md`, `SCHEMA.md` v0.2.2, and the canonical ledger-key format in domain-rules §4.1 as a design contract). Conditions: the approval does not authorise invented catalogue data, unapproved prices, unlicensed images or location data, or silently resolving open business, security or deployment decisions. D11, D12, D5, D17–D23 and coupon-usage restoration on cancellation stay open; D12 keeps blocking checkout behaviour that needs the location dataset. Security, concurrency, transaction, accessibility and performance guarantees are unverified until their checks pass.
- The full plan is in `docs/BUILD-PLAN.md`: route inventory, component architecture, state matrix, domain mapping, responsive plan, accessibility, SEO, performance, security, integrations, phases B0–B11, verification matrix with the k6 plan, risks and definition of done.
- Motion is in `MOTION.md`; the data and API contract is in `SCHEMA.md` v0.2.
- The plan adds no product scope and changes no approved rule.
- Contradictions are listed in `docs/BUILD-PLAN.md` §0 (C1–C11); the decisions the owner needs to make are D17–D23 (§13).

## Decision status (Checkpoint 2, approved with conditions)

| ID | Status |
|---|---|
| D5 Hosting / Vercel | **deferred** to the deployment checkpoint; does not block the product contract |
| D7 Staff 2FA | **approved** (Checkpoint 2) |
| D8 Promotions | **approved** (Checkpoint 2); the **[A]** defaults in `docs/domain-rules.md` §5 stay proposals |
| D9 Rewards | **approved as a proposal** (Checkpoint 2); disabled for a BD production store until legal review |
| D10 Localisation | **approved** (Checkpoint 2) |
| D11 Catalogue | **Owner authorized catalogue generation; generated catalogue pending owner review and approval.** The catalogue itself is **not approved** (package in `catalogue/horekbazar/`, workflow in `docs/domain-rules.md` §16) |
| D12 Location data | **open**: research done, selection pending verification of source, licence, attribution, completeness and version (`docs/domain-rules.md` §6.1); must be resolved before any location-data-dependent behaviour is implemented |
| D13 Customer verification | **approved** (Checkpoint 2) |
| D14 SMS | **approved**: excluded from v1 |
| D15 Online payments | **approved**: excluded from v1 |
| D16 Exclusions | **approved** (Checkpoint 2) |

---

## Open decisions (Checkpoint 1)

- ~~D1 Auth~~: **approved**: Better Auth + official Mongo adapter.
- ~~D2 Demo mode~~: **decided**: no mock fallback; real dev database; setup-required states (see Conflicts 1).
- ~~D3 Web Push library~~: **approved approach**: choose between `@block65/webcrypto-web-push`, `@pushforge/builder` or in-house after fit checks at the push phase.
- ~~D4 Live chat~~: **approved**: polling fallback by default, Ably adapter optional.
- **D5 Hosting for the flagship demo (deferred to the deployment checkpoint, owner 2026-10-21)**: Vercel Hobby (non-commercial demo only) vs. Vercel Pro. Also: which Vercel scope/team should own the project (current token cannot access `dev-choice`).
- ~~D6 Licence~~: **decided provisionally**: one basic commercial licence; no tiers, no enforcement mechanism. Notes for legal review in `docs/LICENSING.md`.

## Decision trace

| Date | Checkpoint | Decision | Status |
|---|---|---|---|
| 2026-10-21 | Setup | Private `dev-asfakul/horekbazar` created; skill repo inspected, not modified | done |
| 2026-10-21 | 1 Stack | Stack above approved ("Approval to Proceed"); open to override | approved |
| 2026-10-21 | 1 Stack · D1 | Better Auth + official Mongo adapter | approved as proposed |
| 2026-10-21 | 1 Stack · D2 | No mock/demo fallback; real dev DB; `data/` is seed input only | **owner decision** |
| 2026-10-21 | 1 Stack · D3 | Web Push library chosen at the push phase after fit checks (block65 / pushforge / in-house) | approved as proposed |
| 2026-10-21 | 1 Stack · D4 | Chat behind a `realtime` port: polling fallback, Ably adapter optional | approved as proposed |
| 2026-10-21 | 1 Stack · D5 | Vercel scope still blocked; hosting tier undecided | **deferred** to the deployment checkpoint (owner) |
| 2026-10-21 | 1 Stack · D6 | Basic commercial licence, provisional | **owner decision** |
| 2026-10-21 | 2 Contract | Product contract and Scope below | **proposed** |
| 2026-10-21 | Process | Push after every phase/change; summary in `docs/PROGRESS.md`; all `.md` delivered as one copy block | **owner decision** |
| 2026-10-21 | 2 · D7 | Staff 2FA mandatory for Owner and Store Manager; recovery and session revocation | approved in principle |
| 2026-10-21 | 2 · D8 | Promotion resolution and interactions (`docs/domain-rules.md` §5) | approved in principle |
| 2026-10-21 | 2 · D9 | HB Credit as configurable non-cash loyalty discount, legal review before launch | approved in principle (proposal) |
| 2026-10-21 | 2 · D10 | `/` Bengali, `/en` English, shared stable Latin slugs | approved in principle |
| 2026-10-21 | 2 · D11 | Catalogue only from the owner; empty dev DB acceptable; categories/merchandising proposed | superseded below |
| 2026-10-21 | 2 · D11 | Owner has no catalogue and authorized the agent to generate a proposed starter catalogue from scratch; generated records are drafts, zero stock, no images, every price for owner review; review/import input only, never runtime | **Owner authorized catalogue generation; generated catalogue pending owner review and approval.** |
| 2026-10-21 | 2 · D12 | Location dataset researched; selection pending verification | **open** |
| 2026-10-21 | 2 · D13 | Valid BD phone + admin confirmation; customer email verification optional; staff mandatory; no OTP | approved in principle |
| 2026-10-21 | 2 · D14–D16 | SMS and online payments excluded; Q&A, gift cards, subscriptions, POS, multi-warehouse excluded; wishlist disabled | approved in principle |
| 2026-10-21 | 2 Contract | **Checkpoint 2 approved with conditions** (catalogue stays an unapproved research artifact; prices unapproved and source-distinguished; images missing; compliance flags provisional; D12 open and resolved before dependent behaviour; D5 deferred; proceed to Checkpoint 3 only) | **approved** (owner) |
| 2026-10-21 | 3 Direction | Research record, directions A/B/C, chosen synthesis "Khata" (A with B's photo grid per category and C's serif title voice), dials, type and colour written | **proposed**, awaiting owner approval |
| 2026-10-21 | 3 Review | Owner accepted the "Khata" direction in principle and asked for amendments: restore the contract's five-item bottom bar, coexisting with the RunningTotalBar; reconcile category depth; label verification. Category depth resolved to **3 levels maximum**, source: the approved product contract; the generated taxonomy uses 2. Listings realigned to the contract's column counts | **proposed**, awaiting explicit approval; contract unchanged |
| 2026-10-21 | 4 Build plan | Build plan (B0–B11), MOTION.md, SCHEMA v0.2. Contradictions recorded: nonce CSP vs caching (D17), `middleware.ts` → `proxy.ts`, push workflow vs "main is the shipping truth" (D18), row-level security → repository scoping, D12 blocking checkout (D21), review content under D11 (D20), preview vs D5, first-Owner verification (D23), JS budget (D22) | **proposed**, awaiting owner approval |
| 2026-10-21 | 4 Plan review | Owner review asked for three corrections. (1) Scoped idempotency and concurrency contract (domain-rules §4.1) replacing the single reservation key. (2) D17 rewritten: SRI is unproven (B0 spike), and the fallback keeps the approved nonce rule. (3) Viewport bands S/M/L/XL with exact edges, so 768 px is band M: no dock, 3 columns | **proposed**, awaiting owner approval |
| 2026-10-21 | 2 · Correction | Atlas Free clusters do support backups (daily snapshot, up to 4 kept); earlier statement corrected | done |
| 2026-10-21 | 3 Direction | **Checkpoint 3 approved**: the amended "Khata" direction | **approved** (owner) |
| 2026-10-21 | 4 Build plan | **Checkpoint 4 approved with conditions**: `docs/BUILD-PLAN.md`, `MOTION.md`, `SCHEMA.md` v0.2.2, and the canonical ledger-key format (`order:<orderId>:<lineId>:<kind>`, `return:<returnId>:<lineId>:<kind>`, `rto:<orderId>:<lineId>:<kind>`, `stock:<adjustmentId>:<variantId>:<kind>`) as a design contract. The approval does not authorise invented catalogue data, unapproved prices, unlicensed images or location data, or silently resolving open business, security or deployment decisions. Proceed to Phase B0 only | **approved with conditions** (owner) |
| 2026-10-21 | B0 Toolchain | Pins chosen at install: TypeScript 6.0.3 (not 7.0.2, see §1), Node.js 24 LTS (`.nvmrc`, `engines >=24 <25`; Vitest 5.0.5 needs `^22.12.0 \|\| ^24.0.0 \|\| >=26`, Node 20 is end-of-life), ESLint 9.39.5 (eslint-plugin-react 7.37.5 supports ESLint up to 9), `npm start` runs the standalone server (`next start` does not support `output: "standalone"`) | **proposed** (implementation detail within the approved stack) |
| 2026-10-21 | B0 · D17 | CSP/caching spike run on local branch `spike/csp` (never merged). Result recorded in `docs/PROGRESS.md`: option (b) as specified fails (inline scripts blocked, no hydration) | **open**: owner decides D17 |
| 2026-10-21 | B0 · D18 | Build code is pushed to `preview/horekbazar-v1` after every phase; handoff to `design/horekbazar-v1` after the gate; only the owner merges to `main`. The throwaway `spike/csp` branch stays local and is not pushed | **approved** (owner) |
| 2026-10-21 | D17 | **Option (a): nonce-based CSP on every rendered page, including the public storefront.** No `'unsafe-inline'` to enable HTML caching. Server-side data caching stays where verified with the approved Next.js version and nonce rendering. Storefront HTML is rendered per request and is not claimed as cached. CSP and security-header regression tests stay in the plan. WebKit script-loading tests use HTTPS or an isolated test-only setup; production CSP is not weakened for HTTP tests. CSP hashes, CDN behaviour and `"use cache"` remain unverified unless separately tested. The B0 spike result (option (b) failed) is kept in BUILD-PLAN §9.1 | **approved** (owner), option (a) |
| 2026-10-21 | B1 approval | Phase B1 (shell) approved by the owner. B1 approval does not approve B2 | **approved** (owner) |
| 2026-10-21 | B1 Fonts | Self-hosted fonts in `public/fonts/v1/` with one manual preload per locale, instead of `next/font/google` (which preloaded both subsets on both locales, measured) | **proposed** (implementation detail) |
| 2026-10-21 | B1 Defaults | Fresh-install font preset `plain` (this record: "plain" is the template default with the lightest load); HorekBazar's own store selects `khata` in settings (B4). Numerals `bengali` on `/`, grouping `south_asian`; `/en` always Latin digits | **proposed** |
| 2026-10-21 | B1 Shell | Dock space reserved on `<body>` (not `<main>`), so the footer also ends above the dock. Wordmark reads "নতুন স্টোর" / "New store" until a store name exists in settings. Categories links to `/categories` until the department sheet (B5). The setup-required page shows missing variable names (never values) to everyone until staff sessions exist (B3). Maintenance: `MAINTENANCE_MODE=on` makes the proxy answer every storefront page with 503 and `Retry-After` (a rewrite cannot carry 503, measured) | **proposed** |
| 2026-10-21 | B1 CI | `actions/checkout` v4 → v7 and `actions/setup-node` v4 → v7 (Node 24 action runtime; release notes checked: no input used here changed); runner pinned to `ubuntu-24.04`; Playwright in Chromium, Firefox and WebKit, WebKit through the test-only HTTPS proxy | **proposed** |

### Design decision trace (Checkpoint 3, proposed)

| Decision | Traces to |
|---|---|
| Structure and IA | Contract Scope table (routes, journeys); archetype `ledger` for rows and `catalogue` for the product page; ledger's "imagery is the product" failure covered by the per-category grid view (research: skill archetype data) |
| Palette | Concept (khata paper and blue ink); `--warning` and `--success` kept distinct from the accent (research: Saffron Market rejected); contrast measured with `scripts/contrast.mjs` |
| Type pairing and mode | Research Q1: digit widths and file sizes measured from google/fonts files; r12a line-height note; Next.js font docs. SERVICE STYLE because the contract's success criteria are task completion on a 375 px phone |
| Preload text face instead of display face | Deviation from `principles/typography.md` ("preload only the display face used above the fold"): product text, not a display title, is the likely largest element on listing and product pages; the one-preload gate rule is still met; checked against measured LCP in the build |
| Motion language | Dials MOTION 1 / Tier 1; contract performance budget (LCP ≤ 2.5 s, INP ≤ 200 ms) on budget phones; reduced motion |
| Signature move (or none) | Running total bar: research Q4 (the full cost is never a surprise) and Baymard's quantity-picker finding (Q2) |
| Components: reuse / adapt / adopt / build | Stack (shadcn/Radix, Checkpoint 1); `craft/components.md`; QuantityStepper built because Radix has no number field and a second component library is not added |
| Mobile navigation and bottom dock | Contract navigation (five-item bottom bar at 375 px, sticky add-to-cart and checkout summary); WCAG 2.2 SC 2.4.11 technique C43 and failure F110 (W3C); MDN `env()` safe-area insets; owner review 2026-10-21 |
| Category depth (3 levels maximum) | Approved product contract ("category tree up to 3 levels"); `docs/domain-rules.md` has no depth rule; owner review 2026-10-21 |
| Listing columns (2 / 3 / 4–5) | Approved product contract, content density row |
| Heuristics ignored or adapted | Heading line-height above the 1.05–1.2 range for Bengali (script requirement, r12a); no other heuristic overridden |

