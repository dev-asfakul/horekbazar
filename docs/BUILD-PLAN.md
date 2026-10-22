# HorekBazar template: build plan (Checkpoint 4)

Status: **approved by the owner 2026-10-21 with conditions** (after amendments the same day for the idempotency contract, CSP and caching plan and exact breakpoints). Checkpoint 3 approved the same day. Conditions: the approval does not authorise invented catalogue data, unapproved prices, unlicensed images or location data, or silently resolving open business, security or deployment decisions. The owner authorised **Phase B0 only**; every later phase needs its own approval. Items labelled [H], [NV], [L] or [A] keep their labels. No application code, database migration, catalogue import, production data or deployment is authorised by it.

Authority and sources:
- **Approved:** product contract and Scope (`DESIGN.md`); domain rules (`docs/domain-rules.md`, authority level 4); stack (`DESIGN.md` §1).
- **Approved 2026-10-21:** the Checkpoint 3 direction "Khata" (`DESIGN.md` → Research record … Verification status); with conditions (Checkpoint 4): motion (`MOTION.md`), data contract (`SCHEMA.md` v0.2.2).
- **Workflow:** skill v3.0.2 (`thinking/sequence.md`, `gates/rules.md`, `adapters/next.md`, `craft/components.md`, `motion/*`).

Where this plan and an approved document differ, the approved document wins. Every such difference found is listed in §0.

Labels used throughout:
- **[M]** measured, or confirmed from repository or vendor documentation.
- **[H]** assumed or proposed: a hypothesis awaiting verification.
- **[NV]** not yet verified: needs browser, device, assistive-technology, integration or load testing.
- **[L]** needs authoritative verification and qualified Bangladeshi legal review.
- **[A]** an assumption in the approved rules.

---

## 0. Audit (2026-10-21)

### Repository state [M]
- Branch `main`, clean working tree, level with `origin/main` at `4a87a82` (verified with `git status` and the GitHub API).
- Tracked files: `.env.example`, `.gitignore`, `AGENTS.md`, `DATA.md`, `DESIGN.md`, `README.md`, `SCHEMA.md`, `docs/LICENSING.md`, `docs/PROGRESS.md`, `docs/domain-rules.md`, `skills-lock.json`, `catalogue/horekbazar/**`.
- **No application code exists.** There is no `package.json`, `app/`, `lib/` or tests.
- The skill v3.0.2 is installed under `.agents/` (gitignored, read-only).
- The Checkpoint 3 amendments are present in the files (bottom dock, 3-level depth, listing columns, Verification status); confirmed by reading `DESIGN.md`, `SCHEMA.md` and the catalogue checker source.

### Checkpoint status [M]
| Checkpoint | Status |
|---|---|
| 1 Stack | approved 2026-10-21 with amendments |
| 2 Product contract | approved 2026-10-21 with seven conditions |
| 3 Research and direction | the amended "Khata" direction: **approved** by the owner 2026-10-21 |
| 4 Build plan | this document, `MOTION.md`, `SCHEMA.md` v0.2.2 and the domain-rules §4.1 ledger-key format: **approved with conditions** by the owner 2026-10-21; Phase B0 only |

### Contradictions found and how this plan handles them
| # | Contradiction | Sources | Handling |
|---|---|---|---|
| C1 | **Nonce-based CSP vs cached storefront.** `docs/domain-rules.md` §9 requires "CSP with nonces". Next.js docs: with nonces "all pages must be dynamically rendered", and "Static optimization and Incremental Static Regeneration (ISR) are disabled" ([Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy)). That conflicts with the cached storefront in `SCHEMA.md` and with the scale goal | domain-rules §9 (approved), SCHEMA routes | **Not silently changed.** D17 (§9.1, owner-pending): the approved nonce rule stays in force and is the fallback; experimental SRI is considered only if a B0 spike proves it on the approved version; `'unsafe-inline'` on the storefront is rejected |
| C2 | **`middleware.ts` vs `proxy.ts`.** The skill's template list and `scripts/completeness.mjs` look for `middleware.ts`. Next.js 16 states "The `middleware` file convention is deprecated and has been renamed to `proxy`" ([Next.js proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)) | Scope row `template middleware.ts`; stack next 16.4.2 | Use `proxy.ts`, the framework's current convention (correctness outranks a template heuristic). The completeness item `middleware.ts` will report missing; it is recorded as an exception with this reason in `GATE.md`, and the Scope row is noted. No skill file is changed |
| C3 | **Push-every-update vs "main is the shipping truth".** The owner's standing rule says push every update. The skill says preview pushes go to "any temporary location that is **not main**" and "Nothing reaches main until the design is approved and the gate passes" | AGENTS.md process rule; skill `thinking/sequence.md` | Proposed decision **D18**: build code is pushed after every phase to `preview/horekbazar-v1` (this satisfies push-every-update); the handoff goes to `design/horekbazar-v1` after the gate; only the owner merges to `main`. Planning documents keep going to `main` |
| C4 | **Row-level security rule.** Skill `sec-03` requires row-level security "where the database supports it". MongoDB has no row-level security of that kind | `gates/rules.md`; domain-rules §1 (repository scoping) | Covered by domain-rules §1: every repository function takes the session principal and scopes the query, with no unscoped customer query outside `lib/db/`. Enforced by tests per repository and recorded in `GATE.md` as the equivalent control |
| C5 | **Template demo line.** The skill template wants the README line "All data in data/ is demo" | `templates/TEMPLATE.md`; D2 | Already excused in Scope (owner decision D2). Kept |
| C6 | **Checkout address vs D12.** `docs/domain-rules.md` §6 requires structured address levels with stable codes, and zones map districts and areas. D12 (location dataset) is open and must be resolved first (Checkpoint 2 condition 4) | domain-rules §6, §6.1 | The checkout phase is **blocked** on D12, or on an owner-approved interim (**D21**, §13). No dataset is bundled and no workaround is built without approval |
| C7 | **Design review needs real content.** Checkpoint 5 needs screenshots of filled listings, product pages and cart. D11 forbids importing the generated catalogue without record-level approval; an empty database shows only empty states | skill Checkpoint 5; D11; Checkpoint 2 condition 1 | Proposed decision **D20** (§13). Without it, Checkpoint 5 shows empty and setup states plus whatever products the owner enters by hand in the dev admin |
| C8 | **Preview URL vs D5.** Skill Path A needs a preview URL; hosting is deferred (D5) | skill delivery flow; D5 | Path B by default: a production build run in the agent's environment against the dev database, screenshots at 375 / 768 / 1440, and the `preview/` branch for the owner to run locally. A hosted preview needs D5 or a separate owner approval |
| C9 | **First Owner verification without email.** Staff email verification is mandatory (domain-rules §1). `/admin/setup` creates the first Owner, but email is an optional integration (§7) | domain-rules §1, §7, §8 | Proposed decision **D23** (§13). Until it is decided, setup requires a configured email provider and says so clearly |
| C10 | **JS budget.** Skill Tier 1 allows ≤ 30 KB gzipped JS beyond the framework per page. The admin (forms, tables, sheets) is likely to exceed it **[H]** | `gates/rules.md` | Storefront is designed to fit **[H]**; it is measured per route. If the admin exceeds the budget, the owner decides (**D22**); the budget is never quietly raised |
| C11 | **Rewards timing wording.** The Checkpoint 4 brief says "granted only after successful delivery"; domain-rules §5.7 says "earned only on `completed` orders" | brief; domain-rules §5.7 | Consistent: `completed` comes after `delivered` and after the return window. The plan uses the stricter approved rule (accrual at `completed`) |
| C12 | **Single reservation key.** `SCHEMA.md` v0.2 gave `reservations` one unique `idempotencyKey`, but an order reserves several variants. The ledger's "adjustment id" key collides when one adjustment covers several variants. The outbox fields in `SCHEMA.md` v0.2 also differed from the approved domain-rules §13 | SCHEMA v0.2; domain-rules §4, §13 | Scoped constraints per layer, defined once in **domain-rules §4.1** (proposed): request keys `{scope, principalId, key}`, orders `{userId, checkoutKey}`, reservations `{orderId, lineId}`, deterministic ledger and outbox keys, order compare-and-set with `orderEvents {orderId, seq}`. SCHEMA v0.2.1 now matches §13 |
| C13 | **SRI presented as viable.** v0 described "a strict static CSP plus experimental SRI" as the proposal. The Next.js 16.4.2 guide calls SRI experimental ("Feature may change or be removed") and does not say how the inline scripts Next.js puts in each page are allowed without nonces | [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy) (version label "Latest v16.4.2", fetched 2026-10-21) | D17 rewritten (§9.1): SRI is an **unverified option** that must pass a spike in B0. The fallback keeps the approved nonce policy (§9) and gives up HTML caching, not security |
| C14 | **Breakpoint edges.** v0 said "dock below 768 px" in one place and "filter sheet at 768 px and below" in another; the mega-menu and sidebar were placed at "1440 px" in one place and "≥ 1280 px" in another | DESIGN, SCHEMA, this plan | One definition: `DESIGN.md` → Layout → **Viewport bands** (S 0–767, M 768–1023, L 1024–1279, XL ≥ 1280). Each band starts at its lower edge, so 768 px is band M: no dock, 3 columns, filter sheet |

### Missing decisions and dependencies (detail in §13)
- **Open, owner-held:** D11 (catalogue), D12 (location data), D5 (hosting).
- **Proposed in this plan:** D17–D23.
- **Credentials needed later**, each only for its phase and never committed: MongoDB dev cluster, Resend, Cloudinary, Upstash, Google OAuth (optional), Gemini (optional), courier accounts (optional), VAPID keys (generated).

---

## 1. Route and page inventory

Every storefront route exists at `/…` (Bengali, default) and `/en/…` (English) with the **same Latin slug** (D10). next-intl uses a `[locale]` segment. **B1 (measured):** routing stays in `proxy.ts` (rewrite `/…` to the internal `bn` segment, `/bn/…` → 308, nonce CSP); next-intl's middleware and `localePrefix` are not used; the request locale comes from `next/root-params` in `i18n/request.ts` (proposed implementation detail). `/` is never auto-redirected by `Accept-Language` (domain-rules §10).

"Index" means whether the page appears in search engines: `idx` = indexable; `noidx` = `noindex`. Rendering options: `cache` (**D17 decided, option (a): HTML is rendered per request**; only server data reads are cached, §9.1. The label marks pages whose data reads are cached), `dyn` (rendered per request) and `static`.

### Storefront
| Route | Purpose | Render | Index | Auth | Phase |
|---|---|---|---|---|---|
| `/` | home: the six section types (contract) | cache, tag `home` | idx | — | B5 |
| `/categories` | department index (up to 3 levels) | cache | idx | — | B5 |
| `/c/[...slug]` | category listing (1–3 segments; more → 404) | cache + URL filters | idx (first facet only, §7) | — | B5 |
| `/collections`, `/collections/[slug]` | curated collections | cache | idx | — | B5 |
| `/p/[slug]` | product | cache; price and stock re-read on the client and at add-to-cart | idx | — | B5 |
| `/search` | search results | dyn | noidx | — | B5 |
| `/deals`, `/new`, `/preorder` | listings | cache | idx | — | B5/B6 |
| `/cart` | cart | dyn | noidx | — (device cart) | B6 |
| `/checkout` | checkout | dyn | noidx | **customer** | B7 |
| `/checkout/success/[orderNumber]` | order received | dyn | noidx | customer, owner of the order | B7 |
| `/about`, `/contact`, `/faq` | information | cache | idx | — | B10 |
| `/terms`, `/privacy-policy`, `/delivery-policy`, `/return-policy` | legal **[L]** | cache | idx | — | B10 |
| `/offline` | service-worker fallback | static | noidx | — | B10 |
| 404, 500, maintenance | errors | static | noidx | — | B1 |

### Authentication and account
| Route | Render | Index | Auth | Phase |
|---|---|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | dyn | noidx | — | B3 |
| `/account` | dyn | noidx | customer | B3 |
| `/account/security` | dyn | noidx | customer or staff | B3 |
| `/account/profile`, `/account/addresses` | dyn | noidx | customer | B3 / B7 (addresses depend on D12) |
| `/account/orders`, `/account/orders/[orderNumber]`, `/account/orders/[orderNumber]/invoice` | dyn | noidx | customer (own orders only) | B7 |
| `/account/rewards` | dyn | noidx | customer; hidden when rewards are disabled | B9 |
| `/account/reviews` | dyn | noidx | customer | B9 |
| `/account/messages` | dyn | noidx | customer | B9 |
| `/account/notifications` | dyn | noidx | customer | B9 |
| `/account/privacy` | dyn | noidx | customer | B10 |

### Admin (all `dyn`, `noidx`, staff only; capability checked on the server for every action; Owner and Store Manager need 2FA, D7)
| Route group | Routes | Capability (examples) | Phase |
|---|---|---|---|
| Setup and identity | `/admin/setup`, `/admin/staff`, `/admin/security` | `setup.*` (only while no Owner exists), `staff.manage` (step-up) | B3 |
| Settings | `/admin/settings`, `/admin/settings/delivery`, `/admin/settings/features`, `/admin/settings/integrations` | `settings.write`, `delivery.write`, `settings.integrations.write` (step-up) | B4 (delivery area mapping waits for D12) |
| Catalogue | `/admin/products`, `/admin/products/new`, `/admin/products/[id]`, `/admin/categories`, `/admin/collections`, `/admin/inventory` | `catalogue.write`, `inventory.adjust` | B4 |
| Merchandising | `/admin/homepage`, `/admin/banners` | `merch.write` | B4 |
| Pricing | `/admin/promotions`, `/admin/coupons` | `promotions.write` | B6 |
| Orders | `/admin`, `/admin/orders`, `/admin/orders/[orderNumber]`, `/admin/shipments`, `/admin/returns` | `orders.read`, `orders.confirm`, `fulfilment.write`, `returns.process` | B7/B8 |
| Customers and engagement | `/admin/customers`, `/admin/rewards`, `/admin/reviews`, `/admin/messages`, `/admin/notifications` | `customers.read`, `rewards.write`, `reviews.moderate`, `messages.reply`, `campaigns.send` | B9 |
| Platform | `/admin/health`, `/admin/audit` | `platform.read` | B2 (health), B10 (audit UI) |

### API and route handlers (not pages)
`/api/health`; `/api/jobs/drain` (bearer `CRON_SECRET`); `/api/webhooks/courier/[provider]`; `/api/auth/[...all]` (Better Auth); `/api/media/sign` (signed upload); `/sitemap.xml` (index plus per type and locale); `/robots.txt`; `/manifest.webmanifest`; `/sw.js`. Contracts in `SCHEMA.md` → API surface.

**Excluded by contract and not planned:** online payment callbacks (D15), SMS or OTP (D14), product Q&A, gift cards, subscriptions, POS, multiple warehouses, wishlist (D16), seller or vendor routes, guest checkout.

---

## 2. Component and layout architecture

Server components by default; client components only where interaction needs them (`adapters/next.md`). shadcn/Radix source is copied in and owned (Checkpoint 1). Per-piece choice follows `craft/components.md` (reuse / adapt / adopt / build).

```
app/
  [locale]/
    layout.tsx            ← html lang, fonts, tokens, NextIntl (server), SiteShell
    (store)/…             ← storefront routes: SiteHeader, main, SiteFooter, BottomDock
    (auth)/…              ← minimal shell, no dock context strips
    account/…             ← AccountShell (side nav ≥ 1024 px, list on mobile)
  admin/…                 ← AdminShell (Bengali/English via staff preference; no storefront dock)
  api/…
proxy.ts                  ← locale routing, security headers, auth gate for /account /checkout /admin (C2)
lib/modules/<module>/     ← schema.ts (Zod), repository.ts, service.ts (domain-rules §2)
lib/adapters/<port>/      ← db, cache, media, email, push, courier, realtime, ai, payments(cod), sms(reserved), jobs
lib/ui/                   ← tokens, formatters (price, numbers, dates)
components/               ← UI (shadcn-owned primitives + the custom pieces below)
config/                   ← font presets, section-type registry, defaults
```

| Area | Components | Choice |
|---|---|---|
| Shell | `SiteShell`, `SkipLink`, `SiteHeader`, `HeaderSearch` (persistent; sticky row below 768 px), `CategoryButton`, `LocaleSwitch`, `SiteFooter` | build (thin, server) + client islands for search and locale |
| Navigation | `BottomDock`, `BottomNav` (Home · Categories · Search · Cart · Account), `DepartmentSheet` (Radix Dialog), `MegaMenu` (Radix NavigationMenu, ≥ 1280 px) | build dock and nav; reuse Radix |
| Listings | `KhataGrid`, `KhataEntry`, `LabelTile`, `PriceTag`, `AddToCart` → `QuantityStepper`, `FilterSheet` (< 1280 px) / `FilterSidebar` (≥ 1280 px), `SortSelect`, `LoadMore`, `ListingEmpty`, `ListingSkeleton` | build (concept pieces); reuse Radix Dialog, Select, Checkbox |
| Product | `ProductGallery`, `VariantPicker` (Radix RadioGroup), `TierPriceTable`, `DeliveryFeeLine`, `SpecSheet`, `ReviewsList`, `StickyBuyStrip` | build + reuse |
| Cart | `KhataRow`, `CartSummary`, `CouponField`, `LineNotice` (price changed, out of stock) | build |
| Checkout | `AddressSelect` (radio cards), `AddressForm` (**blocked on D12/D21**), `DeliveryOption`, `RewardsRedeem` (flag), `PaymentMethodCOD`, `CheckoutSummary`, `CheckoutSummaryStrip`, `PlaceOrderButton` (two instances, one idempotency key), `WhatHappensNext` | build |
| Order | `OrderTimeline`, `OrderLines` (KhataRow), `InvoiceView` (print stylesheet) | build |
| Account | `AccountNav`, `SessionList`, `TwoFactorSetup` (Better Auth plugin), `NotificationPrefs` (transactional vs marketing toggles) | build + adopt Better Auth flows |
| Admin | `AdminShell`, `DataTable` (≥ 1024 px) / `RecordCards` (< 1024 px) from one column definition, `OrderActionBar` (state-machine-driven), `InventoryLedgerView`, `AiDraftDiff`, `IntegrationStatus`, `StepUpDialog` | build on shadcn table primitives; no new grid library |
| Feedback | `Toast` (Radix), `InlineError`, `ErrorSummary`, `SetupRequired`, `IntegrationUnavailable`, `EmptyState`, `Skeleton` (static) | reuse + build |

No new UI dependency beyond the approved stack. Push library choice (D3) happens in phase B9 after fit checks.

---

## 3. Interaction and state matrix

Every list ships empty, loading, error and filled states; every form ships default, validation error, submit loading, success and server error; every async action ships idle, pending, success and error (`gates/rules.md` micro-states). Specific cases:

| State | Where | Behaviour | Never |
|---|---|---|---|
| Setup required | every database-backed route when `MONGODB_URI` is missing or the deployment is not a replica set | shoppers see "store is being set up" plus contact if known; staff see the setup steps; HTTP 503 with `Retry-After` | render products, pretend success, or use an in-memory store |
| Empty database | listings with no published products (valid state, D11) | honest empty state with store name and contact | placeholder or fake products |
| Loading | listings, product, cart, checkout summary, account, admin tables | static skeletons in reserved boxes (CLS) | shimmer; spinners for whole pages |
| Validation | all forms | Zod on the server (`sec-11`); field errors linked by `aria-describedby`; on submit, focus moves to an `ErrorSummary` at the top of the form, in normal flow and never under the dock | client-only validation; colour-only errors |
| Authentication | `/checkout`, `/account/**` | `proxy.ts` redirects to `/login?next=…`; the device cart is kept and merged after sign-in | guest checkout |
| Permission | admin actions | 403 page or inline "you do not have permission for this action" naming the capability; audit row for denied sensitive actions | hiding the button as the only control |
| 2FA required | Owner and Store Manager | enrolment screen only until enrolled; step-up dialog for sensitive actions (10 min **[A]**) | access to admin without 2FA |
| Unavailable stock | `/p`, `/cart`, `/checkout` | out-of-stock variant cannot be added; cart line notice; at placement, `INSUFFICIENT_STOCK` with the lines named and the available quantity | invented scarcity ("only N left" shows only real counts at or below the threshold) |
| Price changed / sale ended | cart, checkout | re-priced with a reason; the customer confirms before placing | silent changes |
| Duplicate submit | checkout, staff transitions | idempotency key returns the first result | two orders |
| Integration not configured | email, push, media, courier, AI, chat | the feature is hidden or a clear notice is shown (domain-rules §7); unrelated features keep working | "sent" wording; simulated responses |
| Integration failing | same | health shows **failing**; outbox retries; dead letters visible | silent loss |
| Required integration missing for an action | e.g. password reset with no email provider | the action fails clearly: "Email is not configured for this store; contact the store" | claiming the email was sent |
| Server error | everywhere | safe message, error id, retry; details only in server logs (PII redacted) | stack traces to the client |
| Offline | storefront | `/offline` page from the service worker; the cart is not mutated offline | queued orders |

---

## 4. Data and domain mapping

Modules, collections and owners are as in `docs/domain-rules.md` §2. Field-level shapes are in `SCHEMA.md` v0.2. Zod is the single source of truth; generated MongoDB validators are committed (§14).

### Critical business rules → implementation → proof
| Rule (source) | Route / component | Domain operation (service) | Data | Verification |
|---|---|---|---|---|
| Checkout requires a signed-in customer (contract; domain-rules §3) | `/checkout`, `proxy.ts` | `orders.place` rejects a request without a customer session | `orders.userId` required | integration: anonymous placement → 401; Playwright: redirect to `/login` keeps the cart |
| COD orders need admin confirmation (D13) | `/admin/orders/[n]` `OrderActionBar` | state machine: only `pending_confirmation → confirmed` by `orders.confirm`; `processing` is unreachable before `confirmed` | `orders.status`, `orderEvents` | unit: transition table; integration: illegal transitions → 409 |
| Atomic, idempotent inventory (§4) | — | `inventory.move(kind, key, lines)` inside the order transaction; unique index on the ledger idempotency key | `stock`, `inventoryLedger`, `reservations` | integration: replay the same key → no change; validator rejects `available < 0` |
| No overselling under concurrency (§11) | checkout | guarded update `{variantId, available: {$gte: n}}` → `$inc`, in one transaction with order, coupon and outbox; majority write concern | `stock.available ≥ 0` validator | **concurrency proof**: 100 parallel reservations for 10 units → exactly 10 successes, 90 `INSUFFICIENT_STOCK`, 10 ledger rows, `available` never negative; on a real replica set |
| Cancel or reject before dispatch releases stock | admin and account order pages | `release` per line, key `order:<orderId>:<lineId>:release` | ledger | integration per terminal state |
| Shipped stock is deducted | `/admin/shipments` | `commit` on `shipped` (on-hand −qty, reserved −qty) | ledger | integration |
| Returns restock only after receipt and inspection | `/admin/returns` | `restock` or `write_off` only from `inspected` | `returns`, ledger | integration: restock before `inspected` → 409 |
| Rewards only after delivery (accrual at `completed`, §5.7) | `/account/rewards` | outbox job on `completed`; reversal on return | `rewardLedger` | integration; feature disabled for a BD production store until legal review **[L]** |
| Marketing push needs explicit opt-in | push prompt after a meaningful action (Scope); `/account/notifications` | in-page ask first, then browser permission; separate toggles for order updates and marketing; marketing **off by default**; consent timestamp stored | `pushSubscriptions` (`topics`, `consentAt`) | integration: a campaign targets only marketing-opted-in subscriptions; Playwright: no browser prompt on first load |
| Gemini creates drafts only (§7) | `/admin/products/[id]` `AiDraftDiff` | `ai.draft` writes `aiDrafts`; approval per field writes a product version and an audit row, with a version check | `aiDrafts`, `products.version` | integration: no live field changes without approval; concurrent edit → conflict |
| Missing optional credentials don't break unrelated features (§7) | all | ports report `configured / healthy / failing`; feature gating reads the port status | — | integration per port with env unset |
| No fake or in-memory fallback (D2) | all | db port throws `SetupRequired`; replica-set check on boot (§12) | — | integration: no `MONGODB_URI` → setup page, no product rendered |

### Category depth: one definition [M from the contract]
- **Definition:** depth = the number of categories on the path from the root to the node, inclusive. A top-level category has depth 1. **Maximum depth is 3** (approved contract: "category tree up to 3 levels").
- **Validation:**
  - Zod checks `parentId` shape.
  - The service checks the rule on **create and on move**: it walks the ancestors with cycle detection, then requires `depth(new parent) + height(moved subtree) ≤ 3`, so moving a branch can't push a descendant to level 4.
  - Parent cycles are rejected.
  - MongoDB validators can't express ancestry, so the rule lives in the service, with tests.
- **Draft package:** the catalogue checker applies the same definition. Existing 2-level data stays at 2 levels.
- **Routes:** `/c/[...slug]` accepts 1–3 segments.

### Order lifecycle
State machine exactly as domain-rules §3. One `transition(order, to, actor, reason, idempotencyKey)` function, called inside a transaction. It writes the `orderEvents` row, the stock effect and the outbox rows in that transaction, and returns 409 for illegal transitions.

### Idempotency, concurrency and transactions
The contract is defined once in **`docs/domain-rules.md` §4.1** (proposed at Checkpoint 4). This plan does not restate it. In summary:
- **Each layer has its own key:** request key (`idempotencyKeys {scope, principalId, key}` + fingerprint), order (`{userId, checkoutKey}`), cart (compare-and-set), reservation (`{orderId, lineId}`), ledger (canonical `<namespace>:<entityId>:<lineRef>:<kind>`: `order:`, `rto:`, `return:` with the order line's `lineId`; `stock:<adjustmentId>:<variantId>:<kind>`), transition (compare-and-set on `version`, `orderEvents {orderId, seq}`), coupon (`couponRedemptions {orderId}`, guarded counters), outbox (`<type>:<aggregateId>:<seq>`).
- **Transaction boundary:** one transaction per placement or transition, on a replica set with majority concern.
- **Retries:** `TransientTransactionError` retries the body in a bounded loop (5 attempts / 3 s **[A]**, then `503 CHECKOUT_BUSY`, nothing written). `UnknownTransactionCommitResult` retries the commit only.
- **Conflicts:** `200 replayed`; `409 IDEMPOTENCY_KEY_REUSED`, `CART_CHANGED`, `INSUFFICIENT_STOCK`, `PRICE_CHANGED`, `COUPON_LIMIT`, `STATE_CHANGED`, `ILLEGAL_TRANSITION`.
- **Status:** nothing here is proven. The tests in §12 ("Idempotency and concurrency") decide it.

---

## 5. Responsive implementation plan

Mobile-first. Tailwind breakpoints: `md` 768, `lg` 1024, `xl` 1280 (all [M] Tailwind defaults). The contract widths 375 / 768 / 1440 are the test widths.

### Viewport bands (single definition in `DESIGN.md` → Layout → Viewport bands)
Each band starts **at** its lower edge, so exactly one layout applies at 768, 1024 and 1280 px. CSS uses `width < 768px` (Tailwind `max-md:`) for band S, and `md:`, `lg:` and `xl:` for the others.

| Band | Widths (test width) | Navigation | Columns | Filters | Context strips | Admin |
|---|---|---|---|---|---|---|
| S | 0–767 px (**375**, 390; 320 reflow) | bottom dock (five-item bar + ≤ 1 strip); sticky search row + `CategoryButton` → `DepartmentSheet` | **2** | `FilterSheet` | yes (below) | `RecordCards` |
| M | 768–1023 px (**768**) | no dock; header with search, `CategoryButton` → `DepartmentSheet`, account and cart links | **3** | `FilterSheet` | none; buy box, checkout summary and cart total stay in the page flow | `RecordCards` |
| L | 1024–1279 px (1024) | as M | 4 | `FilterSheet` | none | `DataTable` |
| XL | ≥ 1280 px (**1440**) | as M, with `MegaMenu` instead of the category button | **4** with `FilterSidebar` (category, search and filtered listings); **5** without (home sections, collections) | persistent `FilterSidebar` | none | `DataTable` |

Within a 1240 px container this gives entries of about 240 px with the sidebar and about 248 px without **[H: arithmetic; checked in the build]**. At 375 px an entry is about 165 px wide **[H]**.

### Ruled grid
Rules are drawn as 1 px `--line` borders on the grid cells (the row separator is the cell's bottom border, the column separator its inline-end border, the last column has none) **[H: technique]**. No card boxes, no shadows. Cart, checkout and order lines are single-column `KhataRow`s at every width.

### Bottom dock (band S only: width < 768 px; at 768 px there is no dock)
- **Structure:** one `position: fixed` container at `bottom: 0`. Inside it, from top to bottom: an optional **context strip**, then `BottomNav` (five items, each with an icon and a text label).
- **Context strip, by priority (one at most):**
  1. `StickyBuyStrip` on `/p/[slug]`, shown only while the in-page `#buy` section is out of view (IntersectionObserver).
  2. `CheckoutSummaryStrip` on `/checkout` (total + Place order).
  3. `RunningTotalBar` when the cart is not empty, on any other storefront route except `/cart`.
- **Heights [H]:** nav 56 px, strip 56 px. The dock adds `padding-bottom: env(safe-area-inset-bottom)` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/env)) plus left and right insets in landscape. The viewport export sets `viewportFit: "cover"` **[NV: whether iOS needs it for a non-zero inset is confirmed in the build]**.
- **Space reservation:**
  - A `ResizeObserver` on the dock writes `--dock-h` on `<html>`.
  - `main` has `padding-bottom: calc(var(--dock-h) + 16px)`, and `html` has `scroll-padding-bottom` set to the same value. This follows WCAG 2.2 SC 2.4.11 technique C43, which names failure F110 ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)).
  - The initial `--dock-h` is server-rendered from the known route state (nav only, or nav + strip), so first paint has the right padding and no layout shift **[H]**.
- **Text entry:**
  - When a text-entry control gets focus (`input` of type text, search, tel, email, password or number; `textarea`; `contenteditable`), the dock becomes `inert` and is translated out of view. Under reduced motion it is hidden instantly.
  - `--dock-h` is **not** reduced while it is hidden, so content does not jump.
  - The dock returns when focus leaves text-entry controls.
  - Radio, checkbox and select controls do not hide it.
- **Checkout:** the primary `PlaceOrderButton` sits at the end of the form in normal flow. The strip's button submits the same form (`form` attribute) with the same idempotency key, and both disable together while submitting.
- **Never stacked:** the toast region sits above the dock; Radix sheets cover the dock while open; there is no second fixed bar anywhere.

### Header (band S)
- The wordmark row scrolls away. The **search row is sticky** (about 52 px **[H]**), with `CategoryButton` beside the search field.
- "Search" in the bottom bar focuses that field and opens suggestions. Because the field is always on screen, there is no scroll jump.
- Hypothesis to test **[H]**: about 52 px at the top plus 56–112 px at the bottom leaves enough content at 375 × 667 px.
- From band M (768 px) the header, including the persistent search field, sits at the top of the page in normal flow. With no dock in M–XL there is no Search button to coordinate with.

### Admin
Below 1024 px, `RecordCards` (one card per record, priority fields, actions in a menu). From 1024 px, `DataTable`, built from the same column definition. The order detail page works on a phone (contract: order confirmation and messaging on a phone). The storefront dock is not used in `/admin`.

---

## 6. Accessibility plan (WCAG 2.2 AA, domain-rules §10)

| Area | Plan | Verification |
|---|---|---|
| Structure | landmarks (`header`, `nav` "প্রধান মেনু"/"Main", `main`, `footer`), one `h1`, no skipped levels, skip link to `main` | gate `a`, `S`; axe in Playwright |
| Keyboard | DOM order: header → main → footer → dock (the dock's actions duplicate in-page ones, so content comes first). All Radix overlays trap focus and return it to the trigger. Mega-menu keyboard pattern from Radix NavigationMenu. Stepper: − and + are buttons, the number is a labelled text field with `inputmode="numeric"` and range validation | Playwright keyboard-only run of every core journey **[NV]** |
| Focus | 2 px accent outline with 2 px offset; never removed; `scroll-padding-bottom` keeps focus clear of the dock (SC 2.4.11) | gate focus-ring check; manual 375 px check **[NV]** |
| Forms | visible labels; error summary on submit; `aria-invalid` + `aria-describedby`; `autocomplete` tokens (name, tel, address-line1, …); the phone field explains why it is needed | Playwright + screen readers **[NV]** |
| Live regions | **one** polite region in the shell announces cart changes ("কার্টে ৩টি পণ্য, মোট ৳১,২৫০"); the badge and RunningTotalBar do not announce separately; errors use `role="alert"` only on submit | screen-reader checks **[NV]** |
| Names | the cart count is text inside the label ("কার্ট, ৩টি পণ্য"); icon-only controls are not used in the bottom bar | gate `a` |
| Contrast | tokens measured at Checkpoint 3 **[M]**; brand colour save is blocked below 4.5:1 | rendered contrast in the gate at 375 / 390 / 768 / 1440 **[NV]** |
| Reduced motion | `MOTION.md`: no travel, instant or ≤ 150 ms fades | gate `rm` **[NV]** |
| Bengali text | `lang="bn"` or `lang="en"` on `<html>`; mixed-language fragments carry their own `lang`; line heights from `DESIGN.md` → Typography; no letter-spacing on Bengali; no `text-transform` on Bengali | conjunct and mixed-script test page in Playwright (a fixture rendered with `page.setContent`, not an app route) **[NV]** |
| Zoom and reflow | 200 % zoom and 320 px reflow without loss (gate) | gate **[NV]** |
| Admin | same standard (domain-rules §10) | axe + keyboard on admin journeys **[NV]** |

---

## 7. SEO and internationalisation

| Item | Plan (domain-rules §10) |
|---|---|
| Metadata | `generateMetadata` per route; title ≤ 60 characters, description ≤ 160, both localised; unique per page |
| Canonical | one per page; locale pages are self-canonical; a product has one canonical regardless of category path; paginated pages are self-canonical; filtered URLs canonicalise to the unfiltered category; a page without English content canonicalises `/en/…` to the Bengali page and is left out of the English sitemap |
| hreflang | `bn`, `en`, `x-default` → Bengali, only when both versions have real content |
| Structured data | `Product`/`Offer` with real price and availability only; `AggregateRating` only with published real reviews; `BreadcrumbList`, `Organization`, `WebSite` with a search action. No structured data for draft or unpublished products |
| Indexability | idx and noidx per §1; filtered combinations beyond the first facet are noindex **[A]**; search results noindex |
| Sitemap | `sitemap.xml` index split by type (products, categories, collections, pages) and locale; only published, indexable URLs |
| robots | per environment: staging and preview disallow everything; production allows storefront and disallows `/account`, `/checkout`, `/cart`, `/admin`, `/api`, `/search` |
| Slugs | stable lowercase Latin, shared by both locales; editing a name never changes the slug; slug changes write a 301 redirect record |
| Open Graph | 1200 × 630 `og:image`: the product image when rights are cleared, otherwise a generated typographic image from tokens and the wordmark (`app/opengraph-image.tsx`) |
| Locale switch | keeps path and query; sets a preference cookie; no `Accept-Language` redirect on `/` |

Verification: gate `S` rules (seo-03 … seo-18); a JSON-LD parse test; a canonical and hreflang test per route type; a sitemap test that every URL returns 200 and is indexable **[NV]**.

---

## 8. Performance strategy

| Area | Plan | Status |
|---|---|---|
| Fonts | Self-hosted in `public/fonts/v1/` (B1, proposed; `next/font/google` preloaded both subsets on both locales, measured): Noto Sans Bengali (weight 400–600, no width axis), one file preloaded per locale; Tiro Bangla 400, `display: swap`, not preloaded. Preset `plain` = Noto only | shipped sizes **[M]** in B1: Noto Bengali 74,068 B, Noto Latin 17,300 B, Tiro Bengali 81,932 B, Tiro Latin 26,892 B; one preload per locale **[M]** (Playwright, three engines); `Cache-Control: public, max-age=31536000, immutable` |
| Images | `next/image` with a **Cloudinary loader** (host-portable, no host image-optimisation dependency); `sizes` per layout; AVIF/WebP; widths 160 / 320 / 640 / 1200; `priority` only on the product-page main image; 1:1 reserved boxes | **[H]** |
| JS | server components by default; client islands: header search, locale switch, dock, AddToCart/stepper, sheets, variant picker, checkout form, admin tables; client components receive only the strings they need (no full message catalogue on the client) | Tier 1 budget ≤ 30 KB gzipped beyond the framework per storefront page **[NV]**; admin per D22 |
| Caching | **D17 decided, option (a):** storefront HTML is rendered per request and is not cached. Server data reads are cached and revalidated by tag (`settings`, `home`, `category:<id>`, `product:<id>`) with an API verified under nonce rendering on the installed version (`unstable_cache` worked in the B0 spike; `"use cache"` / `cacheTag` untested). The data-cache API is chosen and tested where data first exists (B2/B5); B1 has no data | data caching under nonce **[M]** in the B0 spike only; `"use cache"`, CSP hashes and CDN behaviour **[NV]** |
| Server/client data | prices, stock and totals are always re-resolved on the server at add-to-cart and at placement; the cached product page shows cached price and stock, then refreshes them on the client | **[H]** |
| Layout stability | reserved image boxes, server-rendered `--dock-h`, static skeletons with final dimensions, fallback-font metrics adjusted for Bengali | CLS ≤ 0.1 **[NV]** |
| Database | per-process singleton driver client; indexes defined with the schema (`SCHEMA.md`); projections on listing queries; listing pages 24 items | **[H]** |
| Measurement | Lighthouse and WebPageTest-style lab runs on a throttled mobile profile (4× CPU, slow 4G) for `/`, `/c/…`, `/p/…`, `/cart`; the gate's JS budget check reads `.next/build-manifest.json`; field data (CrUX) only after a real launch | targets LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 **[NV]** |

---

## 9. Security and reliability

Mapped from domain-rules §9 and skill `craft/security.md`; nothing is new scope.

| Concern | Plan |
|---|---|
| Authentication | Better Auth: database sessions, HttpOnly, Secure, `SameSite=Lax` cookies; rotation on sign-in and privilege change; the session list and revoke in `/account/security` |
| Authorisation | capability checks inside every service call (not only in `proxy.ts`); repository functions take the principal and scope queries (C4); price, role and user id never taken from the client (`sec-20`) |
| 2FA and step-up | Better Auth two-factor plugin; mandatory for Owner and Store Manager; step-up within 10 min for staff and role changes, integration secrets, data export and danger-zone actions **[A]** |
| Input | Zod on every server action and route handler; rich text sanitised with an allow-list; output encoded; no `innerHTML` with user data |
| CSRF | server actions only for mutations, same-origin checks; route handlers that mutate (webhooks, jobs) use signatures or bearer secrets instead of cookies |
| Rate limits | Upstash: sign-in, registration, reset, checkout placement, coupon checks, search suggestions, reviews, messages, AI drafting, webhooks. Auth limits fail closed; read caches fail open (domain-rules §7) |
| Secrets | env only; validated at boot by a Zod env schema; never in client bundles (gate `sec-07`); never logged; the integrations page shows only configured / healthy / failing |
| Errors | safe messages with an error id; PII redacted in logs; no stack traces to the client; `sec-17` (no debug build or public source maps in production) |
| Headers | HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` (admin) / `'self'` (storefront); CSP per **D17**, decided: option (a), nonce on every rendered page (§9.1) |
| Uploads | server-signed Cloudinary uploads, folder-scoped, type and size allow-list, no SVG from users |
| Webhooks | signature or shared secret, timestamp tolerance, replay protection by event id, monotonic courier status |
| Admin protection | 2FA, step-up, audit log for every staff write, last-Owner protection, `noindex`, no admin in the sitemap |
| Personal data | minimum collection; phone and address visible only with the capability; export and deletion requests (`/account/privacy`); retention settings **[L]** |
| Reliability | outbox with leases, backoff and dead letters; real scheduler (`JOBS_TRIGGER`); replica-set check on boot; backups and a rehearsed restore before launch (§9) |

### 9.1 CSP and caching plan (D17, decided: option (a))

**Owner decision (2026-10-21): D17 approved, option (a).** Nonce-based CSP on every rendered page, including the public storefront. The strict policy is kept; `'unsafe-inline'` is not used to enable HTML caching. Server-side data caching is kept where it is verified to work with the approved Next.js version and nonce rendering. Storefront HTML is rendered per request and is not claimed as cached. CSP and security-header regression tests stay in the plan. WebKit browser tests that check script loading use HTTPS or a clearly isolated test-only setup that accounts for `upgrade-insecure-requests`; production CSP is not weakened for HTTP tests. CSP hashes, CDN behaviour and `"use cache"` remain unverified unless separately tested. The options, the spike result and the failure of option (b) are kept below as the record.

**B1 implementation of the WebKit condition [M]:** Playwright runs WebKit through `scripts/e2e-https-proxy.mjs`, a test-only HTTPS front with a throwaway self-signed certificate that forwards requests unchanged; a test asserts the real response still carries `upgrade-insecure-requests`. Chromium and Firefox run over HTTP against the same production server.

**Approved rule:** domain-rules §9 says "CSP with nonces". Nothing below weakens a route's policy to gain caching.

**What the framework documents [M: Next.js CSP guide, version label "Latest v16.4.2", the approved version, fetched 2026-10-21]:**
- Nonces: "you **must use dynamic rendering** to add nonces"; "Static optimization and Incremental Static Regeneration (ISR) are disabled"; "Pages cannot be cached by CDNs without additional configuration"; "Partial Prerendering (PPR) is incompatible with nonce-based CSP". A page can opt into dynamic rendering with `await connection()`. These are **stable** features.
- SRI: "experimental support for hash-based CSP using Subresource Integrity (SRI)", enabled with `experimental.sri`; limits are "Feature may change or be removed" and "Cannot handle dynamically generated scripts". Its example policy uses `script-src 'self'` without `'unsafe-inline'`.
- **Not documented:** how the inline scripts Next.js puts in each App Router page are allowed under that policy without nonces. **SRI is therefore not proven viable for this app [NV].**
- CSP without nonces: the documented example needs `script-src 'self' 'unsafe-inline'`. That is weaker against injected inline script.

**Route requirements:**

| Route class | Personal data in the HTML | Caching need | CSP requirement | `frame-ancestors` |
|---|---|---|---|---|
| Public storefront (`/`, `/categories`, `/c`, `/collections`, `/p`, `/deals`, `/new`, `/preorder`, information and legal) | none (cart, account and live stock come from client calls) | high: this is where the scale goal applies | strict: no `'unsafe-inline'` for scripts; `object-src 'none'`; `base-uri 'self'`; `img-src` self + Cloudinary; first-party scripts only (no analytics in v1) | `'self'` |
| `/search` | none | low (dynamic, noindex) | nonce + `'strict-dynamic'` | `'self'` |
| `/cart` | yes | none | nonce + `'strict-dynamic'` | `'self'` |
| `/checkout`, `/checkout/success` | yes | none (`Cache-Control: private, no-store`) | nonce + `'strict-dynamic'` | `'none'` |
| Auth (`/login` … `/verify-email`) | session-adjacent | none (`no-store`) | nonce + `'strict-dynamic'` | `'none'` |
| `/account/**` | yes | none (`no-store`) | nonce + `'strict-dynamic'` | `'none'` |
| `/admin/**` | yes | none (`no-store`) | nonce + `'strict-dynamic'` | `'none'` |

Private routes already need dynamic rendering, so a nonce costs them nothing **[M from the docs]**. The conflict is only on the public storefront.

**D17 options for the public storefront:**
- **(a) Nonces everywhere** (the approved rule as written; stable).
  - Every storefront page renders per request, with no ISR or CDN caching of HTML.
  - Data reads can still be cached on the server **[NV: which data-cache API works with nonce rendering on 16.4.2, given that PPR is incompatible, is checked in the B0 spike]**.
  - Cost: more server load and slower first byte. The 50,000-user goal (§12) becomes harder and more expensive.
  - **This is the fallback whenever (b) is not proven.**
- **(b) Experimental SRI with a strict static CSP** on public storefront routes, and nonces on all other routes.
  - Keeps static generation, ISR and CDN caching.
  - **Viable only if the B0 spike proves it:** a production build of the approved versions, with every inline script either covered or absent, zero CSP violations in Chromium, WebKit and Firefox, and pages still cached.
  - If it is adopted, it is re-checked at every Next.js upgrade (R10).
- **(c) Not proposed:** a static CSP with `script-src 'unsafe-inline'` on the storefront. It weakens the approved policy to gain caching, so it is listed only so the owner can see why it is rejected.

**Proposal (B0, superseded by the owner decision above):** run the B0 spike, report its real result, then the owner chooses (a) or (b). Until then, (a) is the working assumption, because it matches the approved rule. B5's caching design is written so that it works under (a) (data caching only) and gets faster under (b) (HTML caching).

**B0 spike result (2026-10-21) [M on the spike only; the decision stays with the owner]:**
- Setup: local throwaway branch `spike/csp` (never merged, not pushed). Next.js 16.4.2 with `experimental.sri` (`sha256`), standalone production build with zero environment variables, served on `127.0.0.1` over HTTP. Browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2 (Playwright 1.64.1).
- **Option (b) as specified fails.** The prerendered route (`●` SSG, `revalidate = 60`) was cached (`x-nextjs-cache` STALE on the first request, then HIT; `Cache-Control: s-maxage=60, stale-while-revalidate=31535940`). But its HTML has **3 inline scripts**, and `script-src 'self'` blocked all three in all three browsers (3 `script-src-elem` violations each). The client component did not hydrate and `window.next` was undefined. SRI put `integrity` on 5 of 7 `<script src>` tags; 2 `async` chunk tags had none.
- **Option (a) works on the spike.** On the nonce route (`await connection()`), all inline and chunk scripts carried the nonce, with 0 CSP violations in all three browsers, and `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. `unstable_cache` (revalidate 300) returned the same value on 3 requests while the per-request render time changed, so server data caching works under nonce rendering.
- **WebKit over plain HTTP:** the production CSP's `upgrade-insecure-requests` makes WebKit upgrade script requests to HTTPS on `127.0.0.1`. The scripts fail with TLS errors and the app does not boot. With that one directive removed by the test harness, WebKit had 0 errors, 0 violations and booted. Chromium and Firefox were not affected. Browser tests that check scripts in WebKit therefore need HTTPS, or a test-only policy without that directive **[H, proposed; to be decided where those tests are added]**.
- **Not tested:** CSP hashes for the inline scripts. Their content is the per-page data payload, so it changes per page and per revalidation, and the proxy sets the header before the page is rendered **[H]**. Also not tested: `"use cache"` / `cacheTag` (they need the `cacheComponents` setting; whether that works with nonces was not checked), CDN behaviour and production hosting (D5).
- Raw results: `spike/result-2026-10-21.json` and `spike/webkit-no-uir-2026-10-21.json` on the local `spike/csp` branch.

**Verification in implementation (all [NV]):**
- Playwright collects `securitypolicyviolation` events and console CSP errors on every route class at all four bands. Pass: zero.
- Response-header assertions per route class: CSP directives, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`, `Cache-Control`.
- Nonce tests: a fresh nonce per request; never present in cached HTML; never reused.
- Under (b): every `<script src>` carries `integrity`, and cached responses are actually served from the cache.
- An injected inline `<script>` test is blocked on every route class.
- The skill gate's `K` axis on the local production build.
- Optional production reporting (`report-to`) needs its own owner decision; it is not part of v1 scope.

---

## 10. Integration plan

| Integration | Required? | Phase | Credential needed | When missing | Verification |
|---|---|---|---|---|---|
| MongoDB (replica set) | **required** for every database-backed feature | B2 | dev cluster URI (D19) | setup-required state; nothing faked | integration tests on a disposable test replica set (Docker, or `mongodb-memory-server` in replica-set mode, test-only, domain-rules §12) |
| Better Auth | **required** | B3 | `AUTH_SECRET` (generated) | sign-in disabled with a notice | integration + Playwright |
| Resend (email) | required for verification, reset and order emails; otherwise optional | B3 | API key + verified sender domain | staff see "email not configured"; customers see a neutral message; nothing claimed as sent; first-Owner setup per D23 | outbox tests with a stub provider in tests only; one real send in dev with the owner's key **[NV]** |
| Upstash Redis | required in staging and production; dev uses an in-process limiter with a warning | B2 | REST URL + token | production refuses to start | integration with a test instance or the dev limiter |
| Cloudinary | optional (needed for image upload) | B4 | cloud name, key, secret | upload disabled with a notice; LabelTile everywhere | signed-upload test **[NV]** |
| Courier (Steadfast, Pathao, RedX) | optional | B8 | per courier | manual mode (consignment id + tracking URL) | webhook signature, dedupe and out-of-order tests with recorded fixtures; live calls only with the owner's sandbox credentials **[NV]** |
| Web Push (VAPID) | optional | B9 | generated VAPID keys; library per D3 fit check | opt-in hidden | subscription and consent tests; a real push to a test browser **[NV]** |
| Gemini | optional | B9 | owner's API key | AI controls not rendered | drafts never touch live fields; with the key, one real draft **[NV]** |
| Realtime (Ably) | optional (live chat) | B9 | Ably key | polling | polling tests |
| Scheduler | required for the outbox in production | B2 | `CRON_SECRET`, or a worker process | health shows **failing** | drain and lease tests |
| Payments | COD only (D15) | B7 | — | — | — |
| SMS | none (D14) | — | — | no SMS UI | — |

Tests never use a production or development database, and never call a paid provider without the owner's explicit credentials for that purpose.

---

## 11. Implementation sequence

Small, dependency-ordered phases. The template foundation comes first. Each phase ends with:
- its checks run and their real results recorded in `docs/PROGRESS.md`;
- a push to `preview/horekbazar-v1` (D18) and a verified push status.

Nothing goes to `main` before Checkpoint 6. **Checkpoint 5 (design review) follows phase B11.**

| Phase | Builds | Why now | Depends on | Verified by | Blocked by |
|---|---|---|---|---|---|
| **B0 Toolchain** | `package.json` (approved stack, pinned), strict TS (version compatible with Next 16, Checkpoint 1 note), Tailwind v4, ESLint, Vitest, Playwright, CI (lint, typecheck, unit, build), Zod env schema, `proxy.ts` skeleton (locale + headers), `/api/health`; **CSP/caching spike** on a throwaway `spike/csp` branch, never merged (§9.1) | everything else needs it; the spike decides D17 before B5 depends on it | Checkpoint 4 approval; D18 | CI green; `next build` succeeds; no secrets in the bundle; spike report (violations, headers, cache status) in `docs/PROGRESS.md` | D18 (where to push) |
| **B1 Tokens, fonts, shell** | CSS tokens (Checkpoint 3 palette), font presets, the `[locale]` layout with next-intl, `SiteHeader` + sticky search row, `BottomDock`/`BottomNav` (Home, Categories, Search, Cart, Account), footer, skip link, error pages (404 / 500 / maintenance / offline), `SetupRequired`, `PriceTag` formatter, `LabelTile`, button and focus states | the design system and the dock are used by every later screen; testable without a database (every page shows setup-required) | B0 | unit (formatter: `৳১,২৫,০০০`, Latin option, poisha); Playwright at 375 / 768 / 1440: dock, safe-area padding, focus not obscured, Search focuses the header field; conjunct and mixed-script fixture; font preload count; reduced motion | — |
| **B2 Platform** | db port (singleton, replica-set check, `SetupRequired`), Zod → `$jsonSchema` generator, committed validators, idempotent `db:migrate`, outbox + worker + HTTP drain, audit log, cache/rate-limit port, integration health registry, `/admin/health` (read-only) | every module writes through these; schema consistency must exist before the first collection | B0; D19 | CI: validator diff check, live-validator compare, invalid-insert test per collection (§14); replica-set refusal test; outbox lease and retry tests | D19 (dev database) |
| **B3 Identity** | Better Auth (email/password, optional Google), email verification, reset, sessions, roles and capabilities, 2FA for mandatory roles, step-up, `/login` … `/verify-email`, `/account`, `/account/security`, `/account/profile`, `/admin/setup`, `/admin/staff`, `/admin/security` | every customer and staff feature needs a principal | B2; email decision D23 | integration per capability (allowed and denied); 2FA forced enrolment; session revocation; rate limits; Playwright register → verify → sign in | D23; Resend credentials for real email |
| **B4 Settings and catalogue admin** | settings document (identity, theme preset, locale numerals, features), delivery zones (fees and estimates; **area mapping waits for D12**), categories (depth ≤ 3, move rule, cycles), products and variants, attributes, media (Cloudinary signed upload), collections, homepage sections (six types), banners, inventory `receive`/`adjust` with ledger | the storefront needs real data entered through the admin, never through fixtures | B3 | integration: depth-4 rejected, cycle rejected, subtree-move rule; ledger idempotency; Playwright: add a product with a LabelTile, publish it | D12 (zone area mapping only); Cloudinary credentials (upload only) |
| **B5 Storefront catalogue** | `/`, `/categories`, `/c/[...slug]`, `/collections/**`, `/p/[slug]`, `/search` (MongoDB text index with `default_language: "none"` plus prefix suggestions **[H]**, see R9), `/deals`, `/new`, `/preorder`, KhataGrid (2 / 3 / 4–5), filters (sheet and sidebar), mega-menu, metadata, canonical, hreflang, JSON-LD, sitemap, robots | browsing is the first core journey; it needs B4 data | B4 | Playwright browse and search journeys at 3 widths; SEO tests (§7); empty-database states; gate J for browse | D17 decides whether storefront HTML is cached (built for option a until decided); content for review per D20 |
| **B6 Cart and pricing** | device cart + server cart + merge, pricing engine (domain-rules §5 steps 1–9), quantity tiers, promotions, flash sales (real end times only), coupons (eligibility, allocation, usage), free-delivery rules, `KhataRow`, `RunningTotalBar`, `StickyBuyStrip`, `/admin/promotions`, `/admin/coupons` | checkout depends on correct totals | B5 | unit: every §5 rule, largest-remainder allocation, rounding; integration: coupon limit under concurrency; Playwright: cart states (price changed, sale ended, out of stock) | — |
| **B7 Checkout and orders** | addresses, checkout, placement transaction (reserve + coupon + order + outbox + idempotency), `/checkout/success/[n]`, account orders, customer cancel, invoice; admin orders list and detail with the state machine; `CheckoutSummaryStrip` and the repeated Place order | the core transaction | B6; **D12 or D21** | the §12 "Idempotency and concurrency" tests (I1–I10); Playwright: browse → checkout → success at 375 with the keyboard open | **D12 / D21** (addresses and zones) |
| **B8 Fulfilment and returns** | shipments, courier port (manual first; thin clients from official docs), webhooks (signature, dedupe, monotonic), `/admin/shipments`, returns with inspection, restock and write-off, `/admin/returns` | completes the order lifecycle and the stock rules | B7 | integration: commit on ship, restock only after inspection, duplicate and out-of-order webhooks | courier credentials (live calls only) |
| **B9 Engagement** (part 1 on `feat/b9-engagement`, 2026-10-22: reviews, rewards ledger, messaging; see HANDOFF) | rewards (flag, accrual at `completed`, reversal), reviews (verified purchase, moderation), messaging (polling, optional Ably), notifications (email via outbox; push opt-in with separate marketing consent; D3 library fit check), AI drafts (Gemini, per-field approval), `/account/rewards`, `/account/reviews`, `/account/messages`, `/account/notifications`, matching admin pages | depends on orders and on the identity and outbox platform | B7, B8 | integration per acceptance row (§11 of domain-rules); push consent tests; AI "no live change without approval" | D3 fit check; optional credentials; rewards stay disabled for BD production **[L]** |
| **B10 Information, privacy, audit** | `/about`, `/contact`, `/faq`, legal pages (Bangla mandatory), `/offline` + service worker, `/account/privacy` (export and deletion requests), `/admin/audit`, `/admin/customers` | content and compliance surfaces; legal text is owner-supplied **[L]** | B3 | Playwright; legal pages show `[NEEDS COPY]` until the owner supplies text | owner legal copy **[L]** |
| **B11 Hardening and docs** | security headers and CSP per D17; rate-limit review; full a11y pass; performance budget pass; SEO validation; `README` (buyer setup), `MEDIA.md`, `LICENSE` (per `docs/LICENSING.md`), `CHANGELOG.md`, `GATE.md` draft; the k6 scripts (§12) | final quality before review | B0–B10 | §12 matrix; the skill gate run on a local production build | D17; D22 if the admin is over budget |
| **Checkpoint 5** | preview (Path B unless D5 resolves) + 375 / 768 / 1440 screenshots of every core journey | skill workflow | B11; D20 for filled states | owner review | D20; D5 for a hosted URL |
| **Checkpoint 6** | gate + critique on the approved design; handoff to `design/horekbazar-v1`; the owner merges | skill workflow | Checkpoint 5 approval | `scripts/handoff.mjs` status shown as it is | — |

**Load testing (§12)** needs a staging environment that matches production, so it is blocked by D5 and by an owner-approved infrastructure budget. It is not part of B11's pass criteria. A result is reported only if it was actually run.

---

## 12. Verification matrix

| Kind | Tool | What | Phase | Status |
|---|---|---|---|---|
| Unit | Vitest | formatters, pricing engine, coupon allocation, state machine table, depth and move rules, env schema, Zod → `$jsonSchema` converter | B1–B9 | not run |
| Integration | Vitest + disposable test replica set | repositories (scoping), services, transactions, idempotency and concurrency (I1–I10 below), ledger, outbox, webhooks, capabilities | B2–B9 | not run |
| Schema/domain | CI scripts | validator diff, live-validator compare, invalid-insert per collection; catalogue checker for `catalogue/` | B2+ | catalogue checker run **[M]**; app checks not run |
| Accessibility | axe (Playwright), keyboard-only scripts, screen readers TalkBack / VoiceOver / NVDA (manual) | every core journey, admin included | B1+ | **[NV]** |
| Responsive | Playwright at 320 (reflow), 375, 390, 767, 768, 1023, 1024, 1279, 1280 and 1440 (both sides of every band edge); touch emulation; on-screen-keyboard simulation is limited, so real devices are needed for that | dock never obscures content or focus; columns 2 / 3 / 4–5; admin cards < 1024 | B1+ | **[NV]**; real-device checks need the owner's devices or a device cloud |
| Browser | Chromium, WebKit, Firefox (Playwright); real iOS Safari and Android Chrome for Bengali shaping and safe area | Bengali conjuncts (ক্ষ, ন্ত্র, র্য, ঙ্ক, স্ট্র) at 12 / 14 / 16 px; mixed script; fallback-font CLS | B1, B11 | **[NV]** |
| SEO | gate `S`, JSON-LD parse, canonical and hreflang tests, sitemap crawl | indexable vs noindex per §1 | B5, B11 | **[NV]** |
| Performance | Lighthouse lab (throttled), gate `P`, bundle check | LCP / INP / CLS, JS budget, ≤ 1 preloaded font | B1, B11 | **[NV]** |
| Security | gate `K`, `npm audit`, header checks, capability tests | §9 | B11 | **[NV]** |
| Production build | `next build` + `next start` locally; the skill gate on the built site | every route builds; no dev flags | every phase (build), B11 (gate) | **[NV]** |

### Idempotency and concurrency tests (domain-rules §4.1; phase B6–B8; all **not run**)
All run against a disposable real replica set, with the parallel requests launched together.

| # | Case | Pass condition |
|---|---|---|
| I1 | Same checkout key submitted 20 times in parallel | one order, one set of reservations and ledger rows; 19 responses `200 replayed` with the same `orderNumber` |
| I2 | Same key, changed cart or total | `409 IDEMPOTENCY_KEY_REUSED`; nothing written |
| I3 | Two tabs, different keys, same cart | one order; the other gets `409 CART_CHANGED` |
| I4 | Order with 5 variants, one short of stock | whole order aborted; no reservation, ledger, coupon or outbox row; response names the short line |
| I5 | 100 customers in parallel for 10 units of one variant | exactly 10 orders, 90 `INSUFFICIENT_STOCK` or `CHECKOUT_BUSY`, 10 `reserve` rows, `available` never negative, reconciliation clean |
| I6 | Fault injection: commit succeeds, response dropped; client retries | the original result is returned; nothing is executed twice |
| I7 | Fault injection: `UnknownTransactionCommitResult` | only the commit is retried; one order |
| I8 | Cancel and reject sent concurrently for one order | one terminal state; one `release` per line; the other request gets `409 STATE_CHANGED` |
| I9 | Repeated and out-of-order transitions (replay, stale `expectedVersion`, skip-ahead, older courier event) | replay → first result; stale → `409 STATE_CHANGED`; skip-ahead → `409 ILLEGAL_TRANSITION`; older courier event → ignored, logged |
| I10 | Coupon with a usage limit of 5, 20 parallel placements; then cancellations; outbox drain run twice | ≤ 5 redemptions; counters released once per cancelled order; each outbox key delivered at most once per consumer record |

### k6 load-test plan: 50,000 concurrent users (goal, **not a capacity claim**)
- **Target:** 50,000 concurrent virtual users. This is an unverified goal from the brief; no result exists and none will be claimed without a real run and its infrastructure listed.
- **Environment:** a staging deployment equal to the intended production tier (blocked by D5), its own replica set (never production data), Upstash on a paid plan, the worker or scheduler running. Atlas Free clusters (100 operations per second, 500 connections, domain-rules §12) cannot be used for this.
- **Generators:** k6 is an external binary (AGPL, tool only, not distributed). 50,000 VUs need distributed generators (k6 Cloud or several cloud machines with `k6-operator`); generator CPU and network are recorded.
- **Traffic mix [H]** (to be confirmed against real analytics later):
  - 55 % cached browse (`/`, `/c/…`);
  - 20 % product pages;
  - 10 % search;
  - 8 % cart actions;
  - 4 % sign-in;
  - 2 % checkout placement against a pool of seeded test SKUs;
  - 1 % account order views.
- **Stages:** ramp 0 → 5k (5 min) → 20k (10 min) → 50k (10 min); hold 50k for 15 min; ramp down. A separate **spike** test (0 → 50k in 2 min) and a **soak** test (10k for 2 h).
- **Thresholds [H]:**
  - cached pages p95 ≤ 800 ms; dynamic pages p95 ≤ 1.5 s;
  - placement p95 ≤ 2 s;
  - HTTP error rate < 1 %;
  - **zero oversold units** (stock ledger reconciliation after the run);
  - zero duplicate orders per idempotency key;
  - outbox lag < 60 s.
- **Data:** synthetic test accounts and SKUs created only in the staging database by a load-test setup script, deleted afterwards; never the generated catalogue and never customer data.
- **Report:** infrastructure, versions, mix, per-endpoint latency, errors, database metrics, the reconciliation result, and an honest pass or fail.

---

## 13. Risk register and decisions

### Decisions needed from the owner (none is assumed)
| ID | Decision | Options | Blocks | If left open |
|---|---|---|---|---|
| **D17** | CSP and caching for the public storefront (§9.1, C1, C13) | **approved by the owner 2026-10-21: option (a)**, nonce CSP on every rendered page; storefront HTML rendered per request; data caching only where verified; no `'unsafe-inline'`. Spike record: (b) as specified failed (inline scripts blocked, no hydration in Chromium, Firefox and WebKit); (a) worked with data caching (§9.1); (c) `'unsafe-inline'` rejected | B5 (data caching), B11 (headers) | decided |
| **D18** | Branch and push workflow (C3) | **approved by the owner 2026-10-21** (B0 push): build pushes to `preview/horekbazar-v1` after every phase; handoff to `design/horekbazar-v1` after the gate; the owner merges to `main`; planning docs stay on `main`. The `spike/csp` branch stays local (owner) | B0 | decided |
| **D19** | Development database | (a) owner-provided Atlas dev cluster (URI through the secure credential form, never committed); (b) a local single-node replica set in the agent's environment (real `mongod`, data lost when the environment ends) | B2 onward | B2–B11 cannot run their integration checks against a development database (tests still use disposable replica sets) |
| **D20** | Content for the Checkpoint 5 filled-state review (C7) | (a) the owner approves a named subset of D11 drafts for **dev-database-only** import, prices still unapproved and labelled, images missing; (b) the owner enters a few real products in the dev admin; (c) empty and setup states only | Checkpoint 5 | the review shows only empty and setup states |
| **D21** | Addresses and zones until D12 is resolved (C6) | (a) block B7 until D12 is resolved; (b) interim: the customer chooses a configured zone and types district and area as free text, checked by the operator at confirmation | B7 (and B8, B9, which follow it) | checkout and everything after it wait for D12 |
| **D22** | JS budget for the admin (C10) | (a) hold the admin to Tier 1 (≤ 30 KB) and simplify; (b) accept a measured higher budget for `/admin` only, recorded in `GATE.md` | B11 (gate) | the gate fails on admin routes if they are over budget |
| **D23** | First-Owner email verification without an email provider (C9) | (a) require email to be configured before `/admin/setup` completes; (b) a server-side command (`npm run owner:verify -- <email>`) run by the deployer, audited | B3 | setup requires a configured email provider (option a is the default until decided) |
| Coupon on cancel **[A]** | Whether a cancelled or rejected order restores coupon usage (domain-rules §4.1, case 7) | restore (proposed) / do not restore | B6 | the proposed behaviour (restore) is built |
| Checkpoint 3 | explicit approval of the "Khata" direction as amended | approve / redirect | B1 (design basis) and every later phase | no design work starts |
| Checkpoint 4 | approval of this plan | approve / amend | B0 and all implementation | nothing is built |

### Risks
| # | Risk | Likelihood / impact | Mitigation | Owner input |
|---|---|---|---|---|
| R1 | Overselling or duplicate orders under load | medium / high | guarded `$inc` in transactions, unique idempotency keys, validators, concurrency proof, reconciliation job | — |
| R2 | CSP and caching conflict (C1) | certain / high | D17 | D17 |
| R3 | D12 unresolved blocks checkout | high / high | D21 or resolve D12 | D12, D21 |
| R4 | No approved catalogue: review shows only empty states | high / medium | D20 | D11, D20 |
| R5 | Hosting deferred: no hosted preview, no load test | certain / medium | Path B preview; load test deferred and honestly reported | D5 |
| R6 | Missing credentials (MongoDB, Resend, Cloudinary, Upstash) stall phases | medium / medium | each phase lists its credential; features fail clearly | credentials when each phase starts |
| R7 | JS budget exceeded (admin, checkout) | medium / medium | islands, no new libraries, measure early in B1 | D22 |
| R8 | Bengali rendering problems (conjuncts, fallback CLS) | medium / medium | B1 fixture tests; Noto fallback; metric overrides | real devices |
| R9 | MongoDB text search is weak for Bengali (no Bengali stemming; `default_language: "none"`) **[H]** | medium / medium | prefix suggestions, transliteration-insensitive normalisation; Atlas Search only if the tier allows and the owner approves | possible later decision |
| R10 | Experimental SRI is unproven, or changes or is removed (if D17 b; **not applicable**: D17 decided (a)) | medium / medium | B0 spike before any reliance; re-check at B11 and at every Next.js upgrade; fallback to option (a), which keeps the approved nonce policy | D17 |
| R16 | Write-conflict contention on a hot SKU under load (many transactions on one `stock` document) | medium / medium | bounded retry with `503 CHECKOUT_BUSY` (nothing written); measured only in the k6 run | — |
| R11 | Next 16 caching API details differ from the plan | medium / low | verified against installed-version docs in B1 before use | — |
| R12 | Courier APIs change; unofficial SDKs rejected | medium / low | thin clients from official docs; manual mode always available | courier sandbox credentials |
| R13 | Legal items (rewards, delivery times, data protection, VAT, reviews) | — / high | every **[L]** item stays flagged; rewards disabled for BD production; legal copy owner-supplied | qualified local review |
| R14 | Generated catalogue misused as production data | low / high | `catalogue/` never read by app code (CI check: no import of `catalogue/`), import only via `catalogue/horekbazar/IMPORT.md` after approval | D11 |
| R15 | Single developer agent; large scope | high / medium | small phases, pushes per phase, PROGRESS entries, no phase starts without its blocker cleared | phase-by-phase approval if wanted |

---

## 14. Definition of done

### Every phase
- [ ] The listed scope is built, nothing outside it.
- [ ] `npm run lint`, `npm run typecheck` and `npm test` (unit + integration for that phase) pass, run in CI, with the run linked in `docs/PROGRESS.md`.
- [ ] `next build` succeeds.
- [ ] Every new route renders its empty, loading, error and filled states (and setup-required when the database is missing).
- [ ] No mock data, no in-memory persistence, no simulated integration success, no fabricated content.
- [ ] No secrets committed (secret scan); `.env*` ignored.
- [ ] No HorekBazar-specific strings in core code; `catalogue/` not imported.
- [ ] `docs/PROGRESS.md` entry with what was done, the checks actually run and their results, and what is open.
- [ ] Pushed to the agreed branch (D18) and the push verified with the GitHub API.

### Phase-specific pass/fail
| Phase | Passes when |
|---|---|
| B0 | CI green on a clean clone; `next build` works with zero env vars and the app shows setup-required |
| B1 | at 375 / 767 / 768 / 1024 / 1280 / 1440: the dock with five labelled items appears at 375 and 767 and is absent at 768 and above; exactly one band layout applies at each edge (768, 1024, 1280); Search focuses the header field; no content, focused control or error message is hidden behind the dock (automated check over every focusable element); the formatter tests pass; one preloaded font file per locale; reduced-motion emulation shows no travel |
| B2 | validator diff, live compare and invalid-insert tests pass; a standalone `mongod` is refused; outbox jobs survive a worker crash (lease reclaim) |
| B3 | every capability has an allowed and a denied test; Owner and Store Manager cannot reach the admin without 2FA; password change revokes other sessions |
| B4 | depth-4 create and move rejected, cycles rejected; ledger replay changes nothing; a product can be created, given a LabelTile and published |
| B5 | listings show 2 / 3 / 4–5 columns at the test widths; canonical, hreflang and JSON-LD tests pass; noindex on search; empty-database states shown |
| B6 | every §5 rule has a unit test; I10 (coupon part) passes; cart notices for price change, sale end and stock |
| B7 | tests I1–I8 pass (I5: 10 orders, never negative); double submit creates one order; anonymous checkout is impossible; no order reaches `processing` before `confirmed` |
| B8 | I9 passes; stock committed on ship; restock only after inspection; duplicate and out-of-order webhooks do not regress status |
| B9 | rewards accrue only at `completed` and reverse on return; marketing push reaches only opted-in subscribers; no AI text reaches a live field without approval |
| B10 | legal pages are Bangla-first and show `[NEEDS COPY]` until the owner supplies text; privacy requests are recorded |
| B11 | skill gate run on the local production build with its real output pasted; every failure fixed or recorded with an owner-approved exception |

### Complete template
- [ ] Every Scope row is present or excused with a reason; every core journey passes axis J.
- [ ] Every acceptance criterion in `docs/domain-rules.md` §11 has a passing automated test, except the Scale row: the k6 plan exists, and results appear only if it was run.
- [ ] The gate and critique are run on the approved design, and the handoff status is shown as it is.
- [ ] `README.md` lets a buyer go from clone to a branded shop with one product (acceptance §11, Setup).
- [ ] `MEDIA.md`, `LICENSE`, `CHANGELOG.md`, `GATE.md` and `CRITIQUE.md` are present.
- [ ] All open decisions (D5, D11, D12, D17–D23) are resolved, or listed as known limitations in `README.md`.
- [ ] Nothing is claimed (tests, accessibility, performance, load, deployment) without its evidence.
