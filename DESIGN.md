# HorekBazar: Design and Architecture Record

Status: **Checkpoint 1 (Stack) approved 2026-10-21 with amendments. Checkpoint 2 (Product contract) PROPOSED, awaiting approval.**
No application code exists yet.

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
| Language | TypeScript, `strict` | Pin to the version Next 16 supports (TS 7.0.2 is `latest`; compatibility verified at Phase 1 install, else 5.x/6.x) | Apache-2.0 | Brief requirement. |
| Styling | Tailwind CSS v4, CSS variables as theme tokens | 4.3.3 | MIT | Buyer rebranding = token file, not code edits. |
| Accessible primitives | Radix primitives via shadcn/ui source (copied in, owned) | radix-ui 1.8.1 | MIT | Dialog, sheet, menu, combobox, tabs, toast are solved a11y problems; skill says adopt, don't rebuild. Alternative: React Aria. |
| Validation + types | Zod (one schema → TS types, server validation, Mongo `$jsonSchema`) | 4.6.7 | MIT | Replaces an ODM; no second DB abstraction. |
| Database | MongoDB Atlas + **official driver only** | mongodb 7.7.0 | Apache-2.0 | Brief requirement. Multi-document transactions for order + stock + ledger writes; collection validators; atomic `$inc` with guards. |
| Auth | **Better Auth** + official Mongo adapter | better-auth 1.7.12 · @better-auth/mongo-adapter 1.7.12 | MIT | See decision D1. Email/password, Google, reset, verification, DB sessions, roles. |
| Cache / rate limit | Upstash Redis (HTTP) behind a `cache` port | @upstash/redis 1.39.0 · @upstash/ratelimit 2.2.0 | MIT | Serverless-safe (no TCP pool). Port lets a buyer swap to self-hosted Redis without touching features. |
| Background work | **Transactional outbox in MongoDB + cron drain** (no extra vendor). QStash adapter optional | @upstash/qstash 2.12.1 (optional) | MIT | Emails, push, courier sync, search reindex are retried from an `outbox` collection written in the same transaction as the order. |
| Media | Cloudinary, signed direct uploads | cloudinary 2.11.0 (server only) | MIT | Brief requirement. Server signs; browser uploads; no file passes through functions. |
| Email | Resend | resend 6.34.1 | MIT | Brief requirement. Plain, bilingual templates; no React Email dependency unless needed. |
| AI assistant | Gemini, server only, per-buyer key, drafts require admin approval | @google/genai 2.30.0 | Apache-2.0 | Brief requirement. Feature hidden when key unset. |
| Web Push | Standard Push API + VAPID; library TBD (D3) | — | — | `web-push` fails the skill's maintenance and licence checks (below). |
| Realtime chat | `realtime` port: polling/SSE fallback by default, Ably adapter optional (D4) | ably 2.29.0 (optional) | Apache-2.0 | Works on any host; vendor only when a buyer enables live chat. |
| i18n | next-intl, `/[locale]` segments, `bn` + `en` | 4.14.9 | MIT | Localised routes, metadata and `hreflang`. Alternative: hand-rolled dictionaries. |
| Tests | Vitest (unit/integration), Playwright (journeys, gate), mongodb-memory-server (transaction tests) | vitest 5.0.5 · @playwright/test 1.64.1 · mongodb-memory-server 11.3.0 | MIT | Playwright is also what the skill's `gate.mjs` needs. |
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
   - The skill's required `data/` folder is kept **only as seed input**: realistic catalogue content, typed by `data/schema.json`, imported into the development database by an explicit `npm run db:seed`. It is never read at runtime. It contains no personal customer data and no production records.
2. **Skill security rule sec-03 (RLS)**: MongoDB has no row-level security. Excused with the replacement control: every data access goes through a repository layer that takes the session's `userId`/role and scopes the query; direct collection access outside `lib/db/` is lint-banned.

### Alternatives considered

- **B. Next.js + PostgreSQL (Neon/Supabase) + Drizzle**: stronger relational integrity for orders/ledgers and RLS. Rejected because the brief fixes MongoDB; noted for buyers who ask.
- **C. Separate API service (NestJS/Hono) + Next.js frontend**: clearer scaling of write paths. Rejected for v1: two deployables for every buyer, against "no unnecessary microservices". The `lib/` domain layer is written framework-free so it can be extracted later.

---

## Product contract

Checkpoint 2 of 6. Status: **proposed**. Detailed domain rules (roles, order lifecycle, inventory, pricing, configuration, integrations, security, acceptance criteria) are in [`docs/domain-rules.md`](docs/domain-rules.md) and are part of this contract.

| Field | Answer |
|---|---|
| **Product** | A reusable, self-hosted, **single-store, multi-category online shop** template, sold to independent businesses. HorekBazar is the flagship installation: a Bangladeshi everyday-goods store, cash on delivery first, Bengali and English. Exact subtype: general retail with variants (not a marketplace, not a grocery quick-commerce app, not a SaaS). |
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
| **Constraints** | Stack from Checkpoint 1. Real data only (no mock fallback). Bangladesh Digital Commerce Operation Guidelines 2021: terms, delivery, return/refund conditions shown clearly and **in Bangla** ([Mahbub & Co.](https://mahbub-law.com/ministry-of-commerce-issues-detailed-guidelines-on-e-commerce-business/)); delivery within 5 days same city / 10 days other city, complaints resolved within 72 hours, stock quantity and full charges disclosed ([The Daily Star](https://www.thedailystar.net/law-our-rights/news/overview-the-digital-commerce-operation-guidelines-2021-2128871)). Personal data law: Bangladesh's Personal Data Protection Ordinance 2025 was replaced by an Act enacted on 10 April 2026 ([DataGuidance](https://www.dataguidance.com/jurisdictions/bangladesh?topic)); consent, retention limits and data-subject rights must be supportable. Low bandwidth: performance budgets in `gates/rules.md` (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1). Every buyer owns their own data and credentials. |
| **Explicit exclusions** | Multi-vendor marketplace and seller accounts (owner brief). Multi-tenant SaaS (owner brief). Guest checkout (owner brief: account required). Native mobile apps (not requested; PWA-level install and push only). Online payment gateways in v1 (owner brief specifies COD; payment method step still ships with a provider port). Multi-currency per store and multi-warehouse stock (one currency and one stock location per installation; schema leaves room). Product Q&A, wishlists sharing, gift cards, subscriptions, POS (not requested; proposed exclusions awaiting approval). Extended/tiered licences (owner decision). |
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

Evidence (file#pattern) is filled in during the build; Notes describe intent. Marks: requested = in the owner brief; required = the type or the law needs it; optional = feature-flagged, off by default unless noted. Level: the capability level the route or function ships at. Locale: Bengali at `/`, English at `/en/…` (proposal, D10).

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
| route | /account/security | required |  | backend | password change, sessions, linked Google |
| route | /account/rewards | requested |  | backend | reward balance and ledger (terminology configurable) |
| route | /account/reviews | requested |  | backend | my reviews, review prompts after delivery |
| route | /account/messages | requested |  | backend | support conversations |
| route | /account/notifications | requested |  | integration | push and email preferences |
| route | /account/privacy | required |  | backend | data export and deletion request (data protection law) |
| route | /about | required |  | backend | store information |
| route | /contact | required |  | backend | phone, email, address, complaint channel (72-hour rule) |
| route | /faq | optional |  | backend | editable FAQ |
| route | /offline | required |  | interface | offline fallback page |
| legal | /terms | required |  | backend | terms of sale, Bangla mandatory |
| legal | /privacy-policy | required |  | backend | privacy notice |
| legal | /delivery-policy | required |  | backend | zones, fees, timelines |
| legal | /return-policy | required |  | backend | return, refund and cancellation conditions |
| legal | /cookies | not required for this brief, reason: only strictly necessary cookies are used; disclosed in /privacy-policy |  |  |  |
| state | every database-backed route: setup required | requested |  | interface | owner decision D2 |
| state | every listing: loading, empty, error, filled | required |  | backend |  |
| state | /search: zero results with recovery | required |  | backend |  |
| state | /c/[...slug]: filters produce no results | required |  | backend |  |
| state | /p/[slug]: out of stock, preorder, flash sale ended mid-view, variant unavailable | required |  | backend |  |
| state | /cart: empty, item went out of stock, price changed, coupon invalid | required |  | backend |  |
| state | /checkout: zone not deliverable, stock lost at placement, duplicate submit, server error | required |  | backend |  |
| state | /account/orders: empty | required |  | backend |  |
| state | integration unavailable (email, push, courier, AI, chat) | requested |  | interface |  |
| state | 404, 500, maintenance | required |  | interface |  |
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
| function | /checkout: payment method step (COD only in v1) | requested |  | backend | provider port for later |
| function | push opt-in prompt after a meaningful action | requested |  | integration |  |
| function | live chat (realtime) | optional |  | integration | polling fallback ships |
| function | wishlist | optional |  | backend | not requested; flag off |
| function | brands as a facet and index | optional |  | backend | flag off for HorekBazar unless D11 says otherwise |
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
| admin | /admin/staff | requested |  | backend | staff accounts and roles |
| admin | /admin/audit | required |  | backend | audit log |
| admin | /admin/setup | requested |  | backend | first-run checklist |
| skeleton | product grid | required |  |  |  |
| skeleton | product detail | required |  |  |  |
| skeleton | search results | required |  |  |  |
| skeleton | cart and checkout summary | required |  |  |  |
| skeleton | account order list and detail | required |  |  |  |
| skeleton | admin tables and order detail | required |  |  |  |
| template | middleware.ts | required |  |  | auth gate, locale routing, rate limiting, security headers |
| template | data/ with schema.json | required |  |  | seed input only (owner decision D2) |
| template | README demo line | not required for this brief, reason: owner decision D2 (no mock data); README instead states that data/ is seed content for a development database, to be replaced before launch |  |  |  |
| template | README, DESIGN, MOTION, MEDIA, SCHEMA, CRITIQUE, GATE, LICENSE, CHANGELOG, .env.example | required |  |  |  |
| route | online payment return/callback routes | not required for this brief, reason: COD only in v1 (owner brief); interface: /checkout payment method step with provider port |  |  |  |
| route | seller/vendor routes | not required for this brief, reason: single-store template, marketplace excluded by owner |  |  |  |

## Open decisions (Checkpoint 2)

See the end of `docs/domain-rules.md` (D7–D16).

---

## Open decisions (Checkpoint 1)

- ~~D1 Auth~~: **approved**: Better Auth + official Mongo adapter.
- ~~D2 Demo mode~~: **decided**: no mock fallback; real dev database; setup-required states (see Conflicts 1).
- ~~D3 Web Push library~~: **approved approach**: choose between `@block65/webcrypto-web-push`, `@pushforge/builder` or in-house after fit checks at the push phase.
- ~~D4 Live chat~~: **approved**: polling fallback by default, Ably adapter optional.
- **D5 Hosting for the flagship demo (still open)**: Vercel Hobby (non-commercial demo only) vs. Vercel Pro. Also: which Vercel scope/team should own the project (current token cannot access `dev-choice`).
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
| 2026-10-21 | 1 Stack · D5 | Vercel scope still blocked; hosting tier undecided | **open** |
| 2026-10-21 | 1 Stack · D6 | Basic commercial licence, provisional | **owner decision** |
| 2026-10-21 | 2 Contract | Product contract and Scope below | **proposed** |
| 2026-10-21 | Process | Push after every phase/change; summary in `docs/PROGRESS.md`; all `.md` delivered as one copy block | **owner decision** |
