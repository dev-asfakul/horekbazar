# SCHEMA.md: HorekBazar template

> The data contract, written together with `DESIGN.md` as the skill requires (`templates/SCHEMA.md`).
>
> **Status: draft v0, Checkpoint 3 (proposed 2026-10-21, awaiting owner approval).** This version fixes the storefront entities, the routes and their rendering, the section contract for the core journey routes and the environment variables. Not yet complete: the field-level API surface, the admin section contracts and the remaining entity fields are finished at Checkpoint 4 (build plan), before any code.
>
> Business rules live in `docs/domain-rules.md` (approved at Checkpoint 2). Where this file and the rules differ, the rules win until this file is corrected.

Conventions:
- money = integer minor units (poisha) + `currency` (`docs/domain-rules.md` §5.1).
- `LocalizedText` = `{ bn: string, en?: string }`; Bengali is required, English is optional (§10: a page without English is not indexed in English).
- All datetimes are ISO 8601 UTC and are displayed in `STORE_TIMEZONE`.
- Zod is the single source of truth; MongoDB `$jsonSchema` validators are generated from it (§14).

## Data model

### Settings
A single versioned document in `settings`, edited in `/admin/settings`. It holds store identity, theme and locale (§8).

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `store.name` | LocalizedText | required | `{ bn: "হরেকবাজার", en: "HorekBazar" }` | header wordmark, `<title>`, emails |
| `store.logo` | image | optional | `null` `[NEEDS ASSET]` | header (falls back to the wordmark set in type) |
| `store.contact` | object (phone, email, address LocalizedText, hours) | required for launch | `[NEEDS COPY]` | footer, `/contact` |
| `theme.fontPreset` | enum(khata\|plain) | required | `khata` | every route (`DESIGN.md` → Typography) |
| `theme.accent` | string (hex) | required | `#1E4E9C` | primary actions; saved only if ≥ 4.5:1 against white and against the page background |
| `locale.default` | enum(bn\|en) | required | `bn` | routing |
| `locale.numerals` | enum(bengali\|latin) | required | `bengali` | every price and number on `/` |
| `locale.grouping` | enum(south_asian\|western) | required | `south_asian` | price formatter |
| `delivery.zones` | list<DeliveryZone> | required for checkout | see below | `/checkout`, `/p/[slug]` delivery line, running total bar |
| `pricing.roundingUnit` | int (minor units) | required | `100` | server pricing (§5.1) |
| `features` | map<string,bool> | required | `{ wishlist: false, brands: false, reviews: true }` | feature flags (D16) |
| `version` | int | required | `7` | optimistic concurrency |

### DeliveryZone (embedded in Settings)
| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `id` | string | required | `inside-dhaka` | — |
| `name` | LocalizedText | required | `{ bn: "ঢাকার ভেতরে", en: "Inside Dhaka" }` | checkout, product delivery line |
| `fee` | money | required | `{ amountMinor: 0, currency: "BDT" }` `[NEEDS OWNER VALUE]` | checkout summary, running total bar ("from ৳…") |
| `estimate` | LocalizedText | required | `[NEEDS COPY]` | product delivery line, checkout |
| `areas` | list<location code> | required | **pending D12** (no location dataset chosen) | address → zone mapping |
| `enabled` | bool | required | `true` | — |

> Location codes, address pickers and area-to-zone lookup depend on **D12 (open)**. They will not be implemented until D12 is resolved (Checkpoint 2 condition 4).

### Category
`categories` collection; tree of maximum depth 2 (§2).

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `id` | string | required | ObjectId | — |
| `slug` | slug | required, unique | `rice-and-flour` | `/c/[...slug]`, `/en/c/[...slug]` |
| `parentId` | ref(Category) | optional | — | breadcrumb, departments sheet |
| `name` | LocalizedText | required | `{ bn: "চাল ও আটা", en: "Rice & Flour" }` | departments sheet, `/c` title, breadcrumbs |
| `description` | LocalizedText | optional | — | `/c` intro |
| `display` | enum(rows\|grid) | required | `rows` | `/c` listing mode (`DESIGN.md` → Layout) |
| `position` | int | required | `1` | sort order |
| `seo` | object (title, description per locale) | optional | — | `<head>` |
| `status` | enum(draft\|published\|archived) | required | `draft` | only `published` is listed |

### Product
`products` collection.

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `id` | string | required | ObjectId | — |
| `slug` | slug | required, unique, stable (§10) | `miniket-rice` | `/p/[slug]` |
| `name` | LocalizedText | required | `{ bn: "মিনিকেট চাল", en: "Miniket Rice" }` | row title, product title, cart line, order line snapshot |
| `shortDescription` | LocalizedText | optional | — | product page under the title |
| `description` | LocalizedText (rich text, sanitised) | optional | — | product page `#details` |
| `primaryCategoryId` | ref(Category) | required (a leaf) | — | breadcrumb, canonical |
| `categoryIds` | list<ref(Category)> | required | — | listings |
| `brandId` | ref(Brand) | optional (brands flag off) | `null` | product page |
| `attributes` | list<{ key, label LocalizedText, value LocalizedText }> | optional | net quantity, material | product page `#specs` |
| `media` | list<image + alt LocalizedText + rights ref> | optional | `[]` | row thumbnail or LabelTile, product gallery |
| `status` | enum(draft\|published\|archived) | required | `draft` | only `published` is visible; products in past orders are archived, never deleted |
| `seo` | object | optional | — | `<head>`, structured data (real price and availability only) |
| `version` | int | required | `3` | concurrent edit check (AI draft approval) |

### Variant
`variants` collection; one or more per product.

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `id` | string | required | ObjectId | cart and order line keys |
| `productId` | ref(Product) | required | — | — |
| `sku` | string | required, unique | `HB-GRC-001-5KG` | admin, invoice |
| `options` | map<string, LocalizedText> | optional | `{ size: { bn: "৫ কেজি", en: "5 kg" } }` | variant chips, cart line |
| `netQuantity` | { value: decimal, unit: enum(g\|kg\|ml\|l\|pc) } | optional | `{ value: 5, unit: "kg" }` | pack label, unit price, LabelTile |
| `price` | money | required | `{ amountMinor: 42500, currency: "BDT" }` | PriceTag |
| `compareAt` | money | optional | `null` (only a genuine previous selling price, §5.2) | PriceTag strike-through |
| `barcode` | string | optional | `null` | admin |
| `weightGrams` | int | optional | `5100` | delivery weight surcharge |

### Stock and InventoryLedger
Defined in `docs/domain-rules.md` §4: `onHand`, `reserved` and `available` per variant, plus a ledger with a unique idempotency key. Storefront reads `available` only. Exact counts are shown only at or below `lowStockThreshold`; there is never invented scarcity.

### Cart
`carts` collection, server-persisted for signed-in shoppers; a device cart exists before sign-in and merges on sign-in.

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `id` | string | required | — | — |
| `userId` | ref(User) | optional | — | — |
| `lines` | list<{ variantId, quantity int ≥ 1 }> | required | — | `/cart`, running total bar |
| `couponCode` | string | optional | — | `/cart` coupon row |
| `updatedAt` | datetime | required | — | — |

Prices are **never stored on the cart**; they are re-resolved on every read (§5.2) and snapshotted only onto the order.

### Order and OrderLine
`orders` collection; lifecycle in §3.

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `orderNumber` | string | required, unique | `HB-2611-00042` | success page, account, admin, invoice |
| `userId` | ref(User) | required (account required) | — | — |
| `status` | enum (the §3 states) | required | `pending_confirmation` | OrderTimeline |
| `lines` | list<OrderLine> | required | — | khata on success, account and admin pages |
| `address` | Address snapshot | required | — | order page, invoice, courier booking |
| `deliveryZoneId` + `deliveryFee` | string + money | required | — | totals |
| `totals` | { merchandise, discounts, rewards, delivery, grandTotal } money | required | — | totals block |
| `paymentMethod` | enum(cod) | required | `cod` | COD line (D15) |
| `idempotencyKey` | string | required, unique | — | duplicate-submit protection |
| `placedAt` | datetime | required | — | timeline |

OrderLine is a snapshot: `variantId`, `sku`, `name` (LocalizedText), `options`, `unitPrice`, `quantity`, `lineTotal`, `appliedPromotion`, and a line `status`. Later edits to the product never change it.

### Address (customer, embedded in User profile; snapshotted onto orders)
Fields as in §6: `name`, `phone` (Bangladeshi format, required), `division`, `district`, `upazila`, `area`, `line`, `landmark`, `label` (home or office). The structured location fields (codes plus bn and en names) are **pending D12**. Until then they are not implemented, and no dataset is bundled.

### Other entities (fields completed at Checkpoint 4)
`collections`, `homeSections` (six types), `banners`, `promotions`, `coupons`, `couponRedemptions`, `reservations`, `orderEvents`, `shipments`, `courierEvents`, `returns`, `rewardLedger`, `reviews`, `conversations`, `messages`, `pushSubscriptions`, `campaigns`, `emailLog`, `aiDrafts`, `outbox`, `auditLog`, `jobs`, `staffRoles`, and the Better Auth collections. Owners, invariants and rules for each are already in `docs/domain-rules.md` §2–§14.

### Data files
There is no mock data (owner decision D2; see `DATA.md`).

| Entity | File | Entries | Loader |
|---|---|---|---|
| Category, Product, Variant | `data/categories.json`, `data/products.json` (owner-approved records only) | **0** (empty is valid) | `npm run db:seed` (development database only, explicit confirmation; built at Checkpoint 4 or later) |
| Generated draft catalogue | `catalogue/horekbazar/` | 39 categories, 144 products (draft) | **none**: never read at runtime, never imported without record-level approval (D11) |

## Routes

All storefront routes exist twice: `/…` (Bengali) and `/en/…` (English), with the same slug (D10). The full route list is the Scope table in `DESIGN.md`. Rendering for the main families:

| Route | Page | Reads | Rendering | Notes |
|---|---|---|---|---|
| `/` | Home | Settings; HomeSection (published, by position) and the products each section references | ISR, revalidated by tag on admin save | Setup-required state when the database is not configured (D2) |
| `/c/[...slug]` | Category | Category by slug path; published Products in it, 24 per page, sorted by position then newest | ISR + client filters in the URL | 404 for an unknown slug; filtered URLs canonicalise to the category |
| `/p/[slug]` | Product | Product by slug, its Variants, Stock.available, active promotions, delivery zones | ISR (price and stock re-read on the client and at add-to-cart) | 404 for unknown or unpublished; 301 from old slugs |
| `/search` | Search | Products by text query (bn and en) | dynamic | noindex |
| `/deals`, `/new`, `/preorder` | Listings | Products by active promotion, newest, preorder flag | ISR | — |
| `/cart` | Cart | Cart, re-priced | dynamic | noindex |
| `/checkout` | Checkout | Cart, Addresses, delivery zones, rewards | dynamic, signed-in only | noindex |
| `/checkout/success/[orderNumber]` | Order received | Order (owner only) | dynamic | noindex |
| `/account/**` | Account | User-scoped data | dynamic, signed-in only | noindex |
| `/admin/**` | Admin | Staff-scoped data (capability checks on the server) | dynamic, staff only | noindex; 2FA for Owner and Store Manager (D7) |
| `/about`, `/contact`, `/faq`, legal pages | Information | Settings policy content | ISR | Bangla mandatory for terms |
| `/offline` | Offline | none | static | service-worker fallback |
| 404 / 500 / maintenance | Errors | none | static | — |

- **Redirects:** old product and category slugs → current, 301.
- **Sitemap:** split by type and locale (§10).
- **noindex:** cart, checkout, account, admin, search, flow pages.

## Section contract

Core journey routes. Section ids match the markup `id`. The other routes follow at Checkpoint 4.

### `/`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#setup-required` | db port status | — | — | — | shown instead of all sections when the database is not configured; staff see setup steps, shoppers see "store is being set up" |
| `#home-sections` | HomeSection list | honest empty state: store name, "no products yet", contact; **never placeholder products** (D11) | static row skeletons, reserved height | section omitted, error logged | the six section types in order |

### `/c/[...slug]`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#category-header` | Category | never empty: a 404 instead | static | — | title (display face), breadcrumb, product count |
| `#filters` | facets from the products in the category | hidden when there are no products | — | filters disabled with a message | sheet on mobile, sidebar on desktop |
| `#product-list` | Products (24 per page) | "no products in this category yet", with a link to other departments; when filters give no results, "no matches" with a clear-filters action | static KhataRow skeletons | message and retry | KhataRows or grid (per `Category.display`); "load more" button with a paginated URL |

### `/p/[slug]`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#gallery` | Product.media | LabelTile (never a stand-in photo) | reserved 1:1 box | LabelTile | 1:1 images, swipe on mobile |
| `#buy` | Variant, price, Stock.available, promotion | — | price area reserved | "price could not be loaded", add disabled | title, PriceTag with unit price, variant chips, AddToCart/stepper; out-of-stock, preorder and variant-unavailable states (Scope) |
| `#delivery` | delivery zones | "delivery fees are set at checkout" when no zones exist | static | hidden | fee and estimate per zone; COD statement |
| `#specs` | Product.attributes | section omitted | — | — | ruled spec sheet |
| `#details` | Product.description | section omitted | — | — | rich text, measure ≤ 68ch |
| `#reviews` | Reviews (verified purchase, approved) | "no reviews yet"; never an invented rating | static | hidden | real reviews only; AggregateRating only when they exist (§10) |

### `/cart`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#cart-lines` | Cart, re-priced | "your cart is empty" with a link to the departments | static rows | message and retry | KhataRows with stepper; notices per line for "price changed" and "now out of stock" |
| `#cart-summary` | resolved totals, delivery zones | hidden | reserved | "totals unavailable", checkout disabled | merchandise subtotal, discounts, delivery "from ৳…", coupon row, checkout button |

### `/checkout`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#address` | Addresses | address form | — | field errors | saved addresses as radio cards plus "add new" |
| `#delivery` | zone for the address | "this area is not delivered to", with contact | — | — | fee and estimate |
| `#summary` | cart totals | redirects to `/cart` | reserved | — | collapsible khata on mobile |
| `#place-order` | — | — | loading button (idempotency key; double-tap safe) | stock lost, duplicate submit, server error, invalid phone (Scope states) | COD line, "what happens next", place-order button |

### `/checkout/success/[orderNumber]`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#order-received` | Order | never empty: a 404 if not the owner's order | — | — | headline (display face), order number, OrderTimeline at "waiting for the store to confirm", lines, totals, "the store will call ‹phone›" |

## States

| Route or surface | States | Where defined |
|---|---|---|
| Every database-backed route | setup required (D2) | section contract `#setup-required` |
| Listings (`/`, `/c`, `/search`, `/deals`, `/new`, `/preorder`) | empty · loading · error · filled · empty database (D11) · filters with no results | section contract above |
| `/p/[slug]` | out of stock · preorder · flash sale ended mid-view · variant unavailable · image missing | `#buy`, `#gallery` |
| `/cart` | empty · out of stock · price changed · invalid coupon | `#cart-lines`, `#cart-summary` |
| `/checkout` | area not delivered to · stock lost · duplicate submit · server error · invalid phone | `#place-order`, `#delivery` |
| Integrations (email, push, courier, AI, chat) | configured · healthy · failing · not configured | `docs/domain-rules.md` §7 |
| Micro-states | button, form, list, image and async-action states (`gates/rules.md`) | `DESIGN.md` → Components |

## API surface

To be completed at Checkpoint 4. Planned shape: server actions and route handlers that call module services only (§2). Webhooks: `POST /api/webhooks/courier/[provider]` (signature check, event-id dedupe). Jobs: `POST /api/jobs/[name]` (bearer `CRON_SECRET`). Health: `GET /api/health`. Each will get its request, response, errors, validation and rate limit here before it is built.

## Environment variables

From `.env.example`. The app starts with none set and shows setup-required states. It never substitutes fake data.

| Variable | Server / public | Required in production | Placeholder | Used by | When unset |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public | yes | `http://localhost:3000` | canonicals, sitemap, emails | localhost |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | public | yes | `bn` | routing | `bn` |
| `STORE_TIMEZONE` | server | yes | `Asia/Dhaka` | dates | `Asia/Dhaka` |
| `MONGODB_URI`, `MONGODB_DB` | server | yes | empty | db port | setup-required state |
| `AUTH_SECRET` | server | yes | empty | auth | sign-in disabled with a notice |
| `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` | server | no | empty | Google sign-in | button hidden |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | server | yes (staging and production) | empty | rate limits, caches | dev: in-process limiter with a warning; production refuses to start |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | server | for uploads | empty | media port | upload disabled with a notice |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | for email | empty | email port | "email not configured"; nothing claimed as sent |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | public / server | no | empty | push port | opt-in hidden |
| `GEMINI_API_KEY` | server | no | empty | ai port | AI buttons hidden |
| `STEADFAST_*`, `PATHAO_*`, `COURIER_WEBHOOK_SECRET` | server | no | empty | courier port | manual tracking mode |
| `ABLY_API_KEY` | server | no | empty | realtime port | polling |
| `CRON_SECRET` | server | yes | empty | jobs endpoints | job endpoints refuse requests; health shows **failing** |

## Handoff notes

- **Content source:** MongoDB, edited in `/admin`. `data/` holds only owner-approved seed records; `catalogue/horekbazar/` is a draft research artifact and is never a content source.
- **Images and media:** Cloudinary (the store's own account); 1:1 product images, AVIF or WebP at 160 / 320 / 640 / 1200 px; rights recorded in `MEDIA.md`.
- **Caching and revalidation:** ISR by tag (`settings`, `category:<id>`, `product:<id>`, `home`); prices and stock are always re-resolved on the server at add-to-cart and at order placement.
- **Auth flow, rate limits, security items:** `docs/domain-rules.md` §9 and Checkpoint 4.
- **Open decisions affecting this file:** D12 (location dataset: address codes and zone mapping); D5 (hosting: caching specifics); D11 (no catalogue content approved).
- **Assumptions:** the order number format `HB-YYMM-NNNNN` is a proposal **[A]**.
