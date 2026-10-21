# HorekBazar: Domain Rules (part of the Product contract)

Checkpoint 2 of 6. Status: **proposed**, awaiting owner approval. Once approved this document is authority level 4 (`principles/authority.md`): only the owner, or a higher constraint (safety, accessibility, correctness, law), changes it.

Conventions: "must" = acceptance-tested; "configurable" = a store setting with the stated default; **[A]** = an assumption from type research, open to change; **[D#]** = an unresolved decision listed at the end.

---

## 1. Roles and permissions

Authentication is Better Auth (Checkpoint 1). Authorisation is enforced on the server for every action; hiding a button is never the control.

| Role | Who | Can |
|---|---|---|
| Guest | anyone | browse, search, build a device cart, read policies, contact page |
| Customer | registered shopper | everything a guest can, plus checkout, orders, addresses, reviews, rewards, messages, notification preferences, privacy requests |
| Support agent | staff | read customers and orders; reply to messages; add order notes; request cancellation (needs operator) |
| Order operator | staff | confirm/reject orders, partial cancel, book couriers, update shipment status, process returns and inspections |
| Catalogue editor | staff | products, variants, media, categories, collections, homepage, banners; use AI drafts; cannot change prices of live flash sales |
| Marketing manager | staff | promotions, flash sales, coupons, push campaigns, reward rules |
| Store manager | staff | everything above, plus inventory adjustments, reviews moderation, delivery settings, reports |
| Owner | installation owner | everything, plus staff and roles, integrations, feature flags, store identity, data export, danger-zone actions |

Rules:
- Permissions are **capabilities** (`orders.confirm`, `inventory.adjust`, `settings.integrations.write`, …) grouped into the roles above; a buyer can rename roles or create a custom role from capabilities without code changes.
- At least one Owner must always exist; the last Owner cannot be demoted or deleted.
- Staff accounts require email verification; two-factor authentication for staff is **[D7]**.
- Every staff write is written to the audit log (actor, capability, target, before/after summary, IP hash, time).
- Customers can only read and write their own records. Every repository function takes the session principal and scopes the query; there is no unscoped customer query outside `lib/db/`.

## 2. Modules and ownership

| Module | Owns (collections) | Depends on |
|---|---|---|
| Settings & config | `settings` (single document, versioned), `featureFlags` | — |
| Identity | Better Auth collections (`user`, `session`, `account`, `verification`), `staffRoles` | Settings, Email |
| Catalogue | `products`, `variants`, `categories`, `collections`, `brands` (flagged), `attributes` | Media, Search |
| Merchandising | `homeSections`, `banners` | Catalogue |
| Pricing & promotions | `promotions` (flash sale, product promo, quantity tier), `coupons`, `couponRedemptions` | Catalogue |
| Inventory | `stock` (per variant), `inventoryLedger`, `reservations` | Catalogue |
| Cart | `carts` | Pricing, Inventory |
| Orders | `orders`, `orderEvents`, `idempotencyKeys` | Cart, Pricing, Inventory, Delivery |
| Delivery | delivery zones in `settings`, BD location data (`locations`) | — |
| Fulfilment | `shipments`, `courierEvents` | Orders, Courier adapters |
| Returns | `returns` | Orders, Inventory |
| Rewards | `rewardLedger` | Orders |
| Reviews | `reviews` | Orders (verified purchase) |
| Messaging | `conversations`, `messages` | Identity, Realtime adapter |
| Notifications | `pushSubscriptions`, `campaigns`, `emailLog` | Email, Push adapters |
| AI assistant | `aiDrafts` | Gemini adapter, Catalogue |
| Platform | `outbox`, `auditLog`, `rateLimit` (Redis), `jobs` | — |

Each module is a folder in `lib/modules/<name>` with its schema (Zod), repository, service (business rules), and adapters. Route handlers and server actions call services only.

## 3. Order lifecycle (COD)

```
                ┌──────────── cancelled_by_customer ◄──┐
                │                                       │ (before processing)
placed ──► pending_confirmation ──► confirmed ──► processing ──► ready_to_ship ──► shipped ──► delivered ──► completed
   │                 │                  │              │                             │
   │                 └─► rejected       └──────────────┴─► cancelled_by_store        ├─► delivery_failed ──► returned_to_origin
   │                                                                                 │         └─► (re-ship) shipped
   └─► awaiting_stock (preorder) ──► pending_confirmation                             └─► (partial delivery: per-line status)
```

| State | Entered by | Stock effect | Customer sees | Allowed next |
|---|---|---|---|---|
| `pending_confirmation` | customer places order | reserve each line | "Order received, waiting for confirmation" | confirmed, rejected, cancelled_by_customer, cancelled_by_store |
| `awaiting_stock` | order contains preorder lines | reserve against preorder allocation | "Preorder received; expected ‹date›" | pending_confirmation, cancelled_* |
| `confirmed` | operator after verifying (phone call or other check) | none | "Confirmed" | processing, cancelled_* |
| `processing` | operator starts packing | none | "Being packed" | ready_to_ship, cancelled_by_store |
| `ready_to_ship` | packed, courier booked or awaiting pickup | none | "Ready to ship" | shipped, cancelled_by_store |
| `shipped` | handed to courier (consignment id stored) | **commit**: on-hand −qty, reserved −qty | tracking link | delivered, delivery_failed |
| `delivered` | courier event or operator | none (stays deducted) | "Delivered" + review prompt | completed, return flow |
| `delivery_failed` | courier event or operator | none yet | "Delivery attempt failed" | shipped (re-attempt), returned_to_origin |
| `returned_to_origin` | parcel received back at store | after inspection: **restock** or **write-off** per line | "Returned to store" | — (terminal) |
| `completed` | return window closed | none | — | — |
| `rejected` / `cancelled_by_customer` / `cancelled_by_store` | operator / customer / operator | **release** reservations | reason shown | — (terminal) |

Rules:
- Transitions are enforced by a single state-machine function; any other transition is rejected with `409`. Every transition writes an `orderEvents` row (who, when, from, to, reason) in the same transaction as the stock effect.
- Customer self-cancel is allowed only in `pending_confirmation` or `confirmed` **[A]**; later, the customer can request cancellation and an operator decides.
- **Partial cancellation**: lines carry their own status; cancelling a line releases (before shipping) or creates a return-to-stock task (after shipping) for that line only; order totals, coupon eligibility and delivery fee are recalculated and the customer is shown the change.
- **Auto-cancel**: `pending_confirmation` older than a configurable window (default 48 h, in line with the guideline's 48-hour notice for unavailable products) is flagged to operators; auto-cancel is configurable and off by default **[A]**.
- Delivery time promise shown at checkout comes from the zone settings and must respect the 5-day same-city / 10-day other-city rule for the BD demo; the template lets other stores set their own.
- Order numbers are human-readable, non-sequential across stores (prefix + date + random), and never expose the database id.

### Returns

`requested → approved | rejected → received → inspected → (restocked | written_off) → refunded | credited | closed`

- Return window configurable (default 7 days from delivery **[A]**, matching common BD practice observed at Chaldal for packaged goods); per-category non-returnable flag.
- COD refunds are recorded, not executed: the operator records the method (bKash/Nagad/bank transfer/store reward) and reference. No payment API in v1.
- Refund timing displayed to the customer must not promise less than the store can do; template default text cites the store's own setting.

## 4. Inventory rules

Per variant (`stock`): `onHand`, `reserved`, `available = onHand − reserved` (stored, updated atomically), `lowStockThreshold`, optional `preorderAllocation`.

| Movement | When | Effect | Idempotency key |
|---|---|---|---|
| `receive` | stock in | onHand +n | adjustment id |
| `adjust` | manual correction (reason required) | onHand ±n | adjustment id |
| `reserve` | order placed | reserved +n (guarded: `available ≥ n`) | `orderId:lineId:reserve` |
| `release` | cancel/reject before shipping, partial cancel | reserved −n | `orderId:lineId:release` |
| `commit` | shipped | onHand −n, reserved −n | `orderId:lineId:commit` |
| `restock` | verified return or returned-to-origin, inspected resellable | onHand +n | `returnId:lineId:restock` |
| `write_off` | inspected not resellable | ledger only (onHand already deducted) | `returnId:lineId:write_off` |

Rules (all must be tested, including under concurrency):
1. `available` never goes below zero. Reservation uses a single guarded update (`{variantId, available: {$gte: n}}` → `$inc`) inside the order transaction; if any line fails, the whole order fails with a clear "only N left" message.
2. Every movement is one `inventoryLedger` row with a **unique index on the idempotency key**; a retried request returns the original result and moves nothing.
3. Delivered goods stay deducted. Stock is restored only by `release` (never shipped) or `restock` (physically back and inspected).
4. Order, ledger, stock and outbox writes for one operation happen in one MongoDB transaction.
5. A nightly reconciliation job recomputes `onHand`/`reserved` from the ledger and reports (does not silently fix) any drift.
6. Displayed stock: exact counts when `available ≤ lowStockThreshold`, otherwise "In stock" (configurable); never fabricated scarcity.

## 5. Pricing, promotions, coupons, rewards

Price resolution per line, always on the server, snapshotted onto the order line:

1. **Base price** (variant) and optional **compare-at** price (shown struck through only if it is a genuine previous selling price **[A]**).
2. **One automatic price promotion** applies: the best of active flash sale or product promotion (no stacking between them) **[D8]**.
3. **Quantity tier** applies to the base price when no flash sale is active **[D8]**.
4. **One coupon** per order (percentage, fixed, free delivery), with min subtotal, eligible categories/products, start/end, total limit, per-customer limit, first-order-only option. Usage counted atomically at placement; released if the order is cancelled before shipping.
5. **Rewards redemption** last, capped at a configurable % of the subtotal.
6. **Delivery fee** from zone + free-delivery rules (order threshold, product flag, coupon).

Flash sales: start/end time (store timezone), optional per-sale quantity cap enforced like stock, countdown shown only for real end times. Ended sales re-price carts on next view and at placement.

Rewards (HorekBazar term: "HB Credit", configurable): earned on `completed` orders at a configurable rate; reversed on return; optional expiry; non-transferable, not withdrawable as cash, not convertible to money. Bangladesh rules restrict wallets and held cashback, so the legal shape of rewards is **[D9]**.

Preorders: product-level flag with expected availability date and optional cap; COD only, no advance payment taken (the guideline limits advance payment on goods not ready to ship to 10% without escrow, per [Mahbub & Co.](https://mahbub-law.com/ministry-of-commerce-issues-detailed-guidelines-on-e-commerce-business/)).

Reviews: only customers with a delivered line for that product; one review per order line; star rating + text + optional photos; moderation hides abusive, illegal or personal-data content with a recorded reason; negative reviews are never removed for being negative. Aggregate rating and `Review` structured data use only published real reviews.

## 6. Delivery

- Zones are configurable lists of districts/areas (BD default: Inside Dhaka, Dhaka suburbs, Outside Dhaka **[A]**) with fee, optional weight surcharge, delivery estimate text, and enabled flag.
- Address model: name, phone (BD format validated), division, district, upazila/thana, area, address line, landmark, label (home/office). Location list source and licence **[D12]**.
- Free delivery: order threshold, per-product flag, coupon type; the reason is shown on the cart.

## 7. Integration boundaries

Every integration lives behind a port in `lib/adapters/<port>`; core code never imports a vendor SDK directly. Each adapter reports `configured | healthy | failing` for `/admin/settings/integrations`.

| Port | v1 adapter | Required for | When missing | Failure handling |
|---|---|---|---|---|
| `db` | MongoDB driver | all database-backed routes | setup-required state; nothing faked | 503 page with retry; no partial writes |
| `cache` | Upstash Redis | rate limits and caches (staging/prod) | dev: in-process limiter with a startup warning; prod: refuse to start | fail closed for auth rate limits, fail open for read caches |
| `media` | Cloudinary signed upload | image upload in admin | upload disabled with notice; existing URLs render | retry upload; orphan cleanup job |
| `email` | Resend | verification, reset, order emails | those actions show "email not configured" to staff; customers see a neutral message and the action is not claimed as sent | outbox retry with backoff; `emailLog` |
| `push` | Web Push (VAPID) | push opt-in and campaigns | opt-in hidden | expired subscriptions pruned on 404/410 |
| `courier` | Steadfast, Pathao, RedX; "manual" (tracking URL template) | booking and status sync | manual mode: operator enters consignment id and tracking URL | webhook signature check, event-id dedupe, polling fallback, monotonic status |
| `realtime` | polling (default), Ably (optional) | live chat | polling | reconnect with backoff |
| `ai` | Gemini | product content drafts | buttons hidden | drafts never overwrite live text; errors shown in the editor |
| `payments` | COD only | checkout | — | port exists for later gateways |
| `jobs` | MongoDB outbox + cron drain | async side effects | — | at-least-once delivery, idempotent handlers, dead-letter after N attempts |

Gemini specifics: server-only; per-buyer key; generates or rewrites title, short description, long description, feature bullets, SEO title/description in Bengali and English; output stored in `aiDrafts` with a diff; an editor approves per field; approval writes a product version and an audit row; never auto-publishes; rate-limited per staff user; admin notice that free-tier API content may be used by Google.

## 8. Configuration model

Three layers, so buyers customise without editing core code:

| Layer | Holds | Edited by |
|---|---|---|
| Environment variables | secrets and per-environment endpoints only | deployer |
| `settings` document (database, versioned, cached) | store identity (name, logo, favicon, domain), brand colours, font preset, currency, locale defaults, timezone, contact, social links, policy content (bn/en), footer, delivery zones, feature flags, reward terminology and rates, notification toggles, SEO defaults | Owner/Manager in `/admin/settings` |
| `config/` (code, typed, small) | allowed font presets (fonts are bundled at build), section-type registry, default values for a fresh install | developer (rare) |

- First run with an empty database opens `/admin/setup`: create Owner, store identity, delivery zones, then optional integrations. Nothing is pre-filled with HorekBazar content unless the owner runs `npm run db:seed`.
- HorekBazar-specific content (copy, categories, seed catalogue, logo) lives in `data/` and `public/brand/` only; core code contains no HorekBazar strings.
- Settings changes invalidate cached pages by tag.
- Template upgrades: versioned database migrations (`migrations/NNNN_*.ts`) run by `npm run db:migrate`, recorded in a `migrations` collection; `CHANGELOG.md` with upgrade notes; core files vs. buyer-owned files documented.

## 9. Security requirements

- Sessions: HttpOnly, Secure, SameSite=Lax cookies; rotation on sign-in and privilege change; session list and revoke in `/account/security`.
- Passwords: Better Auth hashing; minimum length 10; breached-password check optional; reset tokens single-use, short-lived; generic responses that do not reveal whether an email exists.
- CSRF: same-origin checks on all mutations; server actions only.
- Validation: every input validated server-side with Zod (`sec-11`); output encoded; rich text sanitised with an allowlist.
- Rate limits (Redis): sign-in, registration, password reset, checkout placement, coupon validation, search suggestions, review posting, messages, AI drafting, webhook endpoints.
- Idempotency: checkout and every staff state transition take an idempotency key; duplicates return the first result.
- Uploads: server-signed, folder-scoped, type and size limited, no SVG uploads from users.
- Webhooks: signature or shared-secret verification, timestamp tolerance, replay protection by event id.
- Headers: CSP with nonces, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors none (admin) / self (storefront).
- Secrets: env only, never sent to the client, never logged; integration settings page shows configured/healthy only.
- Personal data: minimum collection; phone and address visible to staff with the capability only; data export and deletion request flows; retention settings for logs; no customer data in development seeds; logs redact PII.
- Backups: documented backup and restore procedure per hosting tier (Atlas M0 lacks managed backups; staging/production must use a tier that has them **[A]**).
- Dependencies: lockfile committed, `npm audit` in CI, Renovate/Dependabot optional.

## 10. SEO and accessibility (contract-level)

- Indexable: home, categories, collections, products, deals/new/preorder listings, information and policy pages. Noindex: cart, checkout, account, admin, search results, filtered combinations beyond the first facet **[A]**, flow pages.
- Canonicals: products have one canonical URL regardless of category path; paginated pages are self-canonical; filtered URLs canonicalise to the unfiltered category.
- `hreflang` for bn/en pairs; localised titles and descriptions; sitemap index split by type; robots rules per environment (staging disallows all).
- Structured data only where true: `Product`/`Offer` (real price, real availability), `AggregateRating` only with real reviews, `BreadcrumbList`, `Organization`, `WebSite` with search action.
- WCAG 2.2 AA throughout, including admin; keyboard paths for filters, variant pickers, cart and checkout; Bengali text rendering tested at all sizes.

## 11. Acceptance criteria (v1, testable)

| Area | Criterion |
|---|---|
| Setup | With no `MONGODB_URI`, every database-backed route shows the setup-required state and no product is rendered. |
| Setup | A new buyer can go from clone to a branded shop with one product using only the README and `/admin/setup`. |
| Catalogue | Category, collection, search, deals, new and preorder listings paginate, filter and sort on the server; results match the database. |
| Product | Selecting a variant updates price, stock and images; out-of-stock variants cannot be added. |
| Cart | Cart re-prices on every view; changes (price, stock, sale ended) are shown with a reason. |
| Checkout | Placing an order requires a signed-in, verified **[D13]** customer; fees and totals equal the server calculation; a double submit creates one order. |
| Inventory | 100 concurrent placements for 10 units create exactly 10 reservations and 90 clear failures (integration test on a replica set). |
| Inventory | Replaying any movement with the same key changes nothing. Cancel before ship releases; ship commits; delivered stays deducted; restock only after inspection. |
| Orders | Invalid transitions return 409; every valid transition writes one event and its stock effect atomically. |
| Courier | Duplicate or out-of-order webhooks do not regress status; tracking link shows on customer and admin order pages. |
| Coupons | Limits hold under concurrency; cancellation before ship returns the usage. |
| Rewards | Ledger balance equals the sum of entries; returns reverse earned credit. |
| Reviews | Only verified purchasers can review; aggregate equals published reviews. |
| AI | With no key, no AI control renders; with a key, nothing reaches live content without approval. |
| Email/Push | Missing provider never produces "sent" wording; sends go through the outbox and are retried. |
| Security | Every admin route and action rejects users without the capability (tested per capability). |
| SEO | Product pages emit valid Product JSON-LD with real values; filtered URLs carry the right canonical/noindex. |
| Performance | Mobile LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on product and category pages (lab, throttled), JS within the tier budget in `gates/rules.md`. |
| Scale | A k6 plan for 50K virtual users exists with traffic mix and thresholds; results reported honestly with the infrastructure used. |
| Gate | `scripts/completeness.mjs` passes (axis X) and every core journey passes axis J. |

## Open decisions (Checkpoint 2)

| ID | Question | Proposal |
|---|---|---|
| D5 | Vercel team/scope for the project, and Hobby vs. Pro for the flagship | Reconnect Vercel with access to the right scope; Hobby only while the demo sells nothing |
| D7 | Two-factor authentication for staff in v1? | Yes for Owner and Manager (TOTP), optional for others |
| D8 | Promotion stacking: flash sale vs. product promo vs. quantity tier vs. coupon | Best single automatic promotion; tiers only without a flash sale; one coupon; rewards last |
| D9 | Rewards legal shape in Bangladesh (wallet/cashback restrictions) | Non-cash loyalty discount only; review by a BD lawyer before launch |
| D10 | URL strategy: Bengali at `/` and English at `/en`, shared Latin slugs | Yes |
| D11 | What does HorekBazar actually sell, and is there a real catalogue (products, images, prices) for the development database? | Owner supplies or approves a real catalogue; otherwise we agree a realistic, honestly described seed set with licensed images |
| D12 | Bangladesh location dataset (division/district/upazila) and its licence | Pick an openly licensed dataset at the delivery phase |
| D13 | Must customers verify email (or phone) before ordering? Email is weak in BD; phone OTP needs an SMS provider not in scope | Email verification required for staff; customers verified by admin confirmation call, email verification optional **[A]** |
| D14 | SMS notifications (order confirmed/shipped) | Not in v1; port reserved |
| D15 | Online payments (bKash, Nagad, SSLCommerz) | Not in v1 (COD only); provider port and checkout step ready |
| D16 | Proposed exclusions: product Q&A, wishlist sharing, gift cards, subscriptions, POS, multi-warehouse | Excluded from v1 |
