# SCHEMA.md: HorekBazar template

> The data contract, written together with `DESIGN.md` as the skill requires (`templates/SCHEMA.md`).
>
> **Status: draft v0.2.2, Checkpoint 4 (approved by the owner 2026-10-21 with conditions, after amendments the same day).** Nothing in this contract is implemented yet; no data has been imported. v0.2.2 defines the order-line `lineId` explicitly and uses the canonical ledger-key format everywhere (domain-rules §4 and §4.1). v0.2.1 replaced the single reservation key with scoped constraints (domain-rules §4.1), aligns `outbox` with domain-rules §13 and makes the breakpoints exact. v0.2 added the remaining entity fields, the API surface, the admin section contracts and the category-depth definition with its move rule (see `docs/BUILD-PLAN.md`). v0.1 had set category depth to up to 3 levels (from the approved contract), removed the per-category `display` field and added the bottom dock section.
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
`categories` collection; a tree **up to 3 levels deep**. The source is the approved product contract (`DESIGN.md` → Product contract: "category tree up to 3 levels"). `docs/domain-rules.md` has no depth rule, so v0's citation of §2 was wrong and is withdrawn. The generated draft taxonomy uses 2 levels. The rule is enforced on save: a category whose ancestor chain would exceed 3 levels is rejected.

| Field | Type | Required | Example | Appears at |
|---|---|---|---|---|
| `id` | string | required | ObjectId | — |
| `slug` | slug | required, unique | `rice-and-flour` | `/c/[...slug]`, `/en/c/[...slug]` |
| `parentId` | ref(Category) | optional (depth ≤ 3) | — | breadcrumb, department sheet, mega-menu |
| `name` | LocalizedText | required | `{ bn: "চাল ও আটা", en: "Rice & Flour" }` | departments sheet, `/c` title, breadcrumbs |
| `description` | LocalizedText | optional | — | `/c` intro |
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
| `primaryCategoryId` | ref(Category) | required (a leaf, at any depth ≤ 3) | — | breadcrumb, canonical |
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
| `status` | enum(active\|converted) | required | `active` | placement marks it `converted` (domain-rules §4.1) |
| `version` | int | required | `0` | compare-and-set at placement (§4.1) |
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
| `checkoutKey` | string (UUID) | required; unique with `userId` (`{userId, checkoutKey}`) | — | duplicate-submit protection that survives request-key expiry (domain-rules §4.1) |
| `version` | int | required | `0` | compare-and-set for transitions (§4.1) |
| `placedAt` | datetime | required | — | timeline |

OrderLine is a snapshot. Later edits to the product never change it.

| Field | Type | Required | Notes |
|---|---|---|---|
| `lineId` | string (ObjectId hex) | required; unique within the order | **the line's stable identity** (domain-rules §4.1). Created by the server in the placement transaction, one per line. Never regenerated, reused, renumbered or removed: cancelled and returned lines keep it. Referenced by `reservations {orderId, lineId}`, ledger keys (`order:`, `rto:` and `return:` namespaces), partial cancellation, `returns.lines[].lineId`, and line status changes. Never substituted by `variantId`, because one order may contain separate lines for the same variant |
| `variantId`, `sku`, `name` (LocalizedText), `options` | snapshot | required | — |
| `unitPrice`, `quantity`, `lineTotal`, `appliedPromotion` | money / int / money / ref? | required (promotion optional) | — |
| `status` | enum (line states: active\|cancelled\|shipped\|delivered\|returned) **[A]** | required | partial cancellation and partial delivery (domain-rules §3) |

The cart is different: cart lines are keyed by `variantId` inside one cart (the cart merges a variant into one line). Cart operations use `variantId`; the order `lineId` is created only at placement.

### Address (customer, embedded in User profile; snapshotted onto orders)
Fields as in §6: `name`, `phone` (Bangladeshi format, required), `division`, `district`, `upazila`, `area`, `line`, `landmark`, `label` (home or office). The structured location fields (codes plus bn and en names) are **pending D12**. Until then they are not implemented, and no dataset is bundled.

### Category depth (definition and validation)
- **Depth:** the number of categories on the path from the root to the node, inclusive; a top-level category has depth 1. **Maximum depth is 3** (approved contract).
- **On create:** the service checks `depth(parent) + 1 ≤ 3`.
- **On move:** the service requires `depth(new parent) + height(subtree) ≤ 3` and rejects any move that would put a node under itself or one of its descendants (a cycle).
- Ancestors are walked with a visited set, so a corrupt cycle in stored data is detected rather than looped on.
- MongoDB validators can't express ancestry, so the rule lives in `catalogue.service` and is covered by tests. The catalogue checker (`catalogue/horekbazar/tools/catalogue.mjs`) uses the same definition.

### Other entities (proposed fields, Checkpoint 4)
Shared rules for every entity:
- Every document has `_id` and `createdAt`/`updatedAt` (UTC).
- Money is integer poisha; localised text is `{bn, en?}` (`LT`).
- Owners, invariants and lifecycles are in `docs/domain-rules.md`; these lists add field shapes only.

| Collection | Fields (type; constraint) | Key indexes |
|---|---|---|
| `collections` | `slug` (unique, Latin), `name` LT, `description` LT, `kind` enum(manual\|rule), `productIds` ref[] (manual), `rule` {categoryIds, tagIds, priceMax} (rule), `status` enum(draft\|published), `seo` | `slug` unique |
| `homeSections` | `type` enum(hero\|categoryTiles\|productRail\|banner\|collectionGrid\|richText) (six types, contract), `order` int, `data` (type-specific, Zod discriminated union), `visibleFrom`/`visibleTo` date?, `status` | `order` |
| `banners` | `image` (Cloudinary public id; rights note required), `alt` LT (required), `href` (internal path), `placement` enum, `visibleFrom`/`visibleTo`, `status` | `placement, status` |
| `promotions` | `kind` enum(percent\|fixed\|flashSale\|freeDelivery), `value` int, `scope` {all\|categoryIds\|productIds\|variantIds}, `startsAt`, `endsAt` (required for flash sales; real end time only), `minSubtotal` int?, `status` | `status, startsAt, endsAt` |
| `coupons` | `code` (unique, upper case), `kind` enum(percent\|fixed\|freeDelivery), `value`, `maxDiscount`?, `minSubtotal`?, `usageLimit`?, `perCustomerLimit`?, `used` int (guarded `$inc`), `startsAt`, `endsAt`, `eligibility` {firstOrderOnly, categoryIds?}, `status` | `code` unique |
| `couponRedemptions` | `couponId`, `userId`, `orderId`, `amount` int, `status` enum(held\|consumed\|released) (compare-and-set) | `{orderId}` unique (one coupon per order) |
| `couponCustomerUsage` (proposed, §4.1) | `couponId`, `userId`, `count` int ≥ 0 (guarded `$inc`, `count < perCustomerLimit`) | `{couponId, userId}` unique |
| `reservations` | `orderId`, `lineId`, `variantId`, `qty` int > 0, `status` enum(active\|committed\|released) (compare-and-set from `active` only) | `{orderId, lineId}` unique; `variantId, status` (domain-rules §4.1: no shared per-request key) |
| `inventoryLedger` | `variantId`, `kind` enum(receive\|adjust\|reserve\|release\|commit\|restock\|write_off), `qty` int, `onHandAfter`, `reservedAfter`, `actor` {type, id}, `reason`?, `refType` enum(order\|rto\|return\|stock), `refId` (orderId, returnId or adjustmentId), `lineRef` (`lineId`, or `variantId` for `stock`), `idempotencyKey` (canonical `<refType>:<refId>:<lineRef>:<kind>`, domain-rules §4 and §4.1) | `idempotencyKey` unique; `variantId, createdAt` |
| `stock` | `variantId` (unique), `onHand` int ≥ 0, `reserved` int ≥ 0, `available` int ≥ 0 (validator), `lowStockThreshold` int, `version` int | `variantId` unique |
| `orderEvents` | `orderId`, `seq` int (= the order's new `version`), `from`, `to`, `actor`, `reason`?, `requestKeyId`? | `{orderId, seq}` unique |
| `idempotencyKeys` | `scope` enum(checkout\|order_transition\|customer_cancel\|return_transition\|inventory\|rewards_adjust), `principalId`, `key` (client UUID), `fingerprint` (hash of the normalised request), `resultRef`, `result` (stored response), `expiresAt` (TTL 7 days **[A]**) | `{scope, principalId, key}` unique; TTL on `expiresAt` |
| `shipments` | `orderId`, `courier` enum(manual\|steadfast\|pathao\|redx), `consignmentId`?, `trackingUrl`?, `status` (monotonic), `codAmount` int, `events` summary | `orderId`; `courier, consignmentId` unique (sparse) |
| `courierEvents` | `provider`, `eventId`, `consignmentId`, `status`, `occurredAt`, `raw` (redacted) | `provider, eventId` unique |
| `returns` | `orderId`, `lines` [{lineId (the order line's `lineId`; each at most once per return), qty, reason}], `status` enum(requested\|approved\|rejected\|received\|inspected\|restocked\|written_off\|refunded\|credited\|closed) (domain-rules §3 returns), per-line `outcome` enum(restock\|write_off), `inspection` {result, note, by, at}?, `refund` {method enum(bkash\|nagad\|bank\|store_reward), amount, ref} (recorded, not executed)? | `orderId` |
| `rewardLedger` | `userId`, `kind` enum(accrue\|redeem\|reverse\|expire), `points` int, `orderId`?, `idempotencyKey` (`order:<orderId>:accrue\|redeem`, `return:<returnId>:reverse`) | `idempotencyKey` unique; `userId, createdAt` |
| `reviews` | `productId`, `userId`, `orderId` (verified purchase, required), `rating` int 1–5, `body` (sanitised), `status` enum(pending\|published\|rejected), `reply`? | `productId, status`; `{userId, productId}` unique |
| `conversations` / `messages` | `userId`, `orderId`?, `status` enum(open\|closed) / `conversationId`, `from` enum(customer\|staff), `body` (sanitised), `readAt`? | `userId`; `conversationId, createdAt` |
| `pushSubscriptions` | `userId`?, `endpoint` (unique), `keys` {p256dh, auth}, `topics` {orders bool, marketing bool (default **false**)}, `consentAt` date, `consentSource` | `endpoint` unique; `topics.marketing` |
| `campaigns` | `title` LT, `body` LT, `url`, `audience` (marketing opt-in only), `status` enum(draft\|scheduled\|sent\|failed), `sentAt`? | `status` |
| `emailLog` | `outboxKey` (unique), `to` (hashed for search, masked in display), `template`, `providerId`?, `status` enum(queued\|sent\|failed), `error`? | `createdAt` (TTL per retention setting **[L]**) |
| `aiDrafts` | `targetType` enum(product\|category\|collection), `targetId`, `targetVersion` int, `fields` {name?, description?, seo?} (LT), `model`, `status` enum(pending\|partially_applied\|applied\|discarded), `appliedFields` [] | `targetType, targetId, status` |
| `outbox` | as approved in domain-rules §13: `type`, `payload`, `idempotencyKey` (deterministic `<type>:<aggregateId>:<seq>`, §4.1), `status` enum(pending\|processing\|done\|failed\|dead), `attempts` int, `availableAt`, `leaseUntil`?, `lastError`?, `providerRef`? | `idempotencyKey` unique; `status, availableAt` |
| `auditLog` | `actor` {id, role}, `action`, `target` {type, id}, `before`/`after` (redacted diff), `ip` (truncated), `at` | `at`; `target.type, target.id` |
| `jobs` | `name`, `lastRunAt`, `lastResult`, `lockUntil`? | `name` unique |
| `staffRoles` | `key` (unique), `name` LT, `capabilities` string[] (from the capability list), `builtIn` bool (the six roles of domain-rules §1: owner, store_manager, marketing_manager, catalogue_editor, order_operator, support_agent; renamable), `twoFactorRequired` bool (true and locked for owner and store_manager, D7); staff users carry `staffRoleKey` | `key` unique |
| `redirects` | `from` (path), `to` (path), `code` 301 | `from` unique |
| Better Auth (`user`, `session`, `account`, `verification`, `twoFactor`) | per Better Auth's MongoDB adapter; extended fields `locale`, `phone`?, `staffRoleKey`? on `user` | per adapter |

### Data files
There is no mock data (owner decision D2; see `DATA.md`).

| Entity | File | Entries | Loader |
|---|---|---|---|
| Category, Product, Variant | `data/categories.json`, `data/products.json` (owner-approved records only) | **0** (empty is valid) | `npm run db:seed` (development database only, explicit confirmation; built at Checkpoint 4 or later) |
| Generated draft catalogue | `catalogue/horekbazar/` | 39 categories, 144 products (draft) | **none**: never read at runtime, never imported without record-level approval (D11) |

## Routes

> "ISR" below is conditional on D17 (`docs/BUILD-PLAN.md` §9.1); under the approved nonce rule those pages render per request.

All storefront routes exist twice: `/…` (Bengali) and `/en/…` (English), with the same slug (D10). The full route list is the Scope table in `DESIGN.md`. Rendering for the main families:

| Route | Page | Reads | Rendering | Notes |
|---|---|---|---|---|
| `/` | Home | Settings; HomeSection (published, by position) and the products each section references | ISR, revalidated by tag on admin save | Setup-required state when the database is not configured (D2) |
| `/c/[...slug]` | Category | Category by slug path (1–3 segments; more is a 404); published Products in it, 24 per page, sorted by position then newest | ISR + client filters in the URL | 404 for an unknown slug; filtered URLs canonicalise to the category |
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

### Every storefront route (global)
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#site-header` | Settings, top categories | wordmark only if Settings cannot be read | static | — | wordmark, **persistent search field with the category entry beside it** (contract), language switch; mega-menu at 1440 px |
| `#bottom-dock` (below 768 px only) | Cart (count, subtotal), delivery zones | the bottom bar always shows; no context strip when the cart is empty | count reserved | count hidden; the bar still works | **five-item bottom bar** (Home, Categories, Search, Cart, Account; contract), with **at most one context strip** above it, by priority: `StickyBuyStrip` on `/p/[slug]` > `CheckoutSummaryStrip` on `/checkout` > `RunningTotalBar` (cart not empty; not on `/p`, `/cart` or `/checkout`). It publishes `--dock-h`; `main` padding-bottom and `scroll-padding-bottom` = `--dock-h` + 16 px; safe-area inset applied; hidden while a text field is focused (proposed rules, `DESIGN.md` → Layout → Bottom dock) |

### `/`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#setup-required` | db port status | — | — | — | shown instead of all sections when the database is not configured; staff see setup steps, shoppers see "store is being set up" |
| `#home-sections` | HomeSection list | honest empty state: store name, "no products yet", contact; **never placeholder products** (D11) | static row skeletons, reserved height | section omitted, error logged | the six section types in order |

### `/c/[...slug]`
| Section id | Reads | Empty | Loading | Error | Filled |
|---|---|---|---|---|---|
| `#category-header` | Category | never empty: a 404 instead | static | — | title (display face), breadcrumb, product count |
| `#filters` | facets from the products in the category | hidden when there are no products | — | filters disabled with a message | `FilterSheet` below 1280 px (so at 375 and 768 px); persistent `FilterSidebar` from 1280 px (so at 1440 px, contract) |
| `#product-list` | Products (24 per page) | "no products in this category yet", with a link to other departments; when filters give no results, "no matches" with a clear-filters action | static KhataEntry skeletons | message and retry | KhataEntries in the ruled grid: 2 columns at 375 px, 3 at 768 px, 4–5 at 1440 px (contract); "load more" button with a paginated URL |

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
| `#place-order` | — | — | loading button (idempotency key; double-tap safe); shown in `CheckoutSummaryStrip` below 768 px and always at the end of the form in normal flow | stock lost, duplicate submit, server error, invalid phone (Scope states) | COD line, "what happens next", place-order button |

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
| Bottom dock (below 768 px) | empty cart · cart filled · text field focused (bars hidden) · PDP strip · checkout strip · reduced motion | `#bottom-dock` |
| Micro-states | button, form, list, image and async-action states (`gates/rules.md`) | `DESIGN.md` → Components |

## API surface (proposed, Checkpoint 4)

Rules for every entry:
- Mutations are **server actions** that call module services only (domain-rules §2), except webhooks, jobs and auth, which are route handlers.
- Every input is parsed by Zod. Errors are `{code, message (localised), fields?}` with no stack traces.
- The capability is checked in the service. RL means rate limit (Upstash) with fixed windows **[A]**. IK means idempotency key required.

### Storefront and customer
| Operation | Input | Output | Errors | Auth / RL / IK |
|---|---|---|---|---|
| `cart.add` | `variantId`, `qty` (1–99) | cart summary | `NOT_FOUND`, `UNAVAILABLE`, `INSUFFICIENT_STOCK`, `QTY_RANGE` | device or customer; RL 60/min |
| `cart.setQty` / `cart.remove` | `variantId` (the cart line's key; not the order `lineId`), `qty` | cart summary | `NOT_FOUND`, `INSUFFICIENT_STOCK` | same |
| `cart.applyCoupon` / `removeCoupon` | `code` | cart summary + discount lines | `COUPON_INVALID`, `COUPON_EXPIRED`, `COUPON_LIMIT`, `COUPON_INELIGIBLE` | customer; RL 10/min |
| `cart.merge` | (session) | cart summary | — | on sign-in |
| `checkout.quote` | `addressId`, `zoneId` | priced totals (domain-rules §5) | `ADDRESS_INVALID`, `ZONE_UNAVAILABLE` (**D12 / D21**) | customer |
| `checkout.place` | `addressId`, `zoneId`, `note`?, `rewardsToRedeem`?, `expectedTotal`, `idempotencyKey` (UUID) | `{orderNumber}` | `PRICE_CHANGED` (with new totals), `INSUFFICIENT_STOCK` (lines), `COUPON_*`, `CART_CHANGED`, `IDEMPOTENCY_KEY_REUSED`, `CHECKOUT_BUSY` (503), `NOT_SIGNED_IN`, `SETUP_REQUIRED`; a replay returns `200` with `replayed: true` (domain-rules §4.1) | **customer**; RL 5/min; **IK** |
| `orders.cancelByCustomer` | `orderNumber`, `reason` | order | `NOT_CANCELLABLE` (from `processing` onward; allowed from `pending_confirmation`, `awaiting_stock` and `confirmed`, per §3) | customer, owner of the order; IK |
| `returns.request` | `orderNumber`, `lines`, `reason` | return | `WINDOW_CLOSED`, `NOT_RETURNABLE` | customer; RL 5/h |
| `reviews.submit` | `productId`, `rating`, `body` | review (pending) | `NOT_VERIFIED_PURCHASE`, `DUPLICATE` | customer; RL 5/h |
| `messages.send` | `conversationId`?, `orderNumber`?, `body` | message | `TOO_LONG` | customer; RL 20/h |
| `push.subscribe` / `push.updateTopics` / `push.unsubscribe` | subscription, `topics` {orders, marketing} | prefs | `UNSUPPORTED`, `NOT_CONFIGURED` | customer; marketing only with an explicit `true` |
| `privacy.requestExport` / `requestDeletion` | — | request record | — | customer; step-up re-auth |
| `search.suggest` (GET handler) | `q` (1–64 chars), `locale` | ≤ 8 suggestions | — | public; RL 30/10 s |

### Admin (all staff; capability in brackets; step-up where marked)
| Operation | Capability | Notes |
|---|---|---|
| `settings.update`, `settings.updateTheme` | `settings.write` | brand colour rejected below 4.5:1 |
| `settings.updateIntegrations` | `settings.integrations.write` + **step-up** | secrets never returned |
| `delivery.upsertZone` | `delivery.write` | area mapping waits for **D12** |
| `catalogue.upsertCategory` / `moveCategory` | `catalogue.write` | depth and cycle rules above |
| `catalogue.upsertProduct` / `upsertVariant` / `publish` / `archive` | `catalogue.write` | optimistic `version` check |
| `media.sign` (route handler) | `catalogue.write` | signed, folder-scoped, type and size allow-list |
| `inventory.receive` / `inventory.adjust` | `inventory.adjust` | **IK**; reason required for adjust |
| `merch.upsertSection` / `upsertBanner` / `upsertCollection` | `merch.write` | |
| `promotions.upsert` / `coupons.upsert` | `promotions.write` | flash sales need a real end time |
| `orders.transition` | `orders.confirm` / `fulfilment.write` (by target state) | state machine; **IK**; input includes `expectedVersion`; `409 STATE_CHANGED` / `409 ILLEGAL_TRANSITION` (domain-rules §4.1) |
| `shipments.create` / `shipments.update` | `fulfilment.write` | manual mode or courier port |
| `returns.transition` / `returns.inspect` | `returns.process` | restock only from `inspected` |
| `reviews.moderate`, `messages.reply` | `reviews.moderate`, `messages.reply` | |
| `rewards.adjust` | `rewards.write` | **IK**; audit |
| `campaigns.send` | `campaigns.send` | audience = marketing opt-in only |
| `ai.draft` / `ai.applyField` / `ai.discard` | `catalogue.write` | apply per field; version check; RL 20/h |
| `staff.invite` / `staff.setRole` / `staff.remove` | `staff.manage` + **step-up** | last-Owner protection |
| `data.export` | `customers.export` + **step-up** | audit |

### Route handlers
| Handler | Auth | Behaviour |
|---|---|---|
| `GET /api/health` | public (summary) / `platform.read` (detail) | database and port status; never secrets |
| `POST /api/jobs/drain` | bearer `CRON_SECRET` | drains due outbox rows with leases |
| `POST /api/webhooks/courier/[provider]` | provider signature or secret + timestamp | dedupe by `(provider, eventId)`; monotonic status; 200 on duplicates |
| `/api/auth/[...all]` | Better Auth | RL on sign-in, registration and reset (fail closed) |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`, `/sw.js` | public | per environment (`docs/BUILD-PLAN.md` §7) |

### Admin section contracts (proposed)
Every admin list works with **RecordCards below 1024 px and DataTable from 1024 px**, from one column definition. Every admin list has these states:
- **empty:** a "create the first …" action;
- **loading:** static rows;
- **error:** retry plus an error id;
- **permission:** 403 naming the missing capability.

| Route | Sections | Primary action |
|---|---|---|
| `/admin` | `#needs-action` (orders awaiting confirmation, low stock, dead letters), `#today` (real counts only) | open the oldest pending order |
| `/admin/orders` | `#filters` (status, date, zone), `#list` | open an order |
| `/admin/orders/[n]` | `#summary`, `#lines`, `#customer` (masked until opened, with audit), `#timeline`, `#actions` (only legal transitions), `#messages` | confirm / reject with a reason |
| `/admin/products`, `/[id]` | `#list`; `#basics`, `#variants`, `#media` (rights note), `#seo`, `#ai-drafts` (diff), `#publish` | save draft / publish |
| `/admin/categories` | `#tree` (depth ≤ 3, drag-free move dialog), `#editor` | move with the depth check |
| `/admin/inventory` | `#stock` (on hand, reserved, available), `#ledger` | receive / adjust |
| `/admin/settings/**` | `#identity`, `#theme` (preset, colour with a live contrast check), `#delivery`, `#features`, `#integrations` (configured / healthy / failing) | save |
| `/admin/health` | `#ports`, `#outbox`, `#jobs` | retry dead letters |

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
- **Caching and revalidation:** "ISR" in the route table means HTML cached and revalidated by tag (`settings`, `category:<id>`, `product:<id>`, `home`). That holds **only under D17 option (b)**. Under the approved nonce rule (option a, the fallback) these pages render per request and only data reads are cached (`docs/BUILD-PLAN.md` §9.1, owner-pending); prices and stock are always re-resolved on the server at add-to-cart and at order placement.
- **Auth flow, rate limits, security items:** `docs/domain-rules.md` §9 and Checkpoint 4.
- **Open decisions affecting this file:** D12 (location dataset: address codes and zone mapping); D5 (hosting: caching specifics); D11 (no catalogue content approved).
- **Assumptions:** the order number format `HB-YYMM-NNNNN` is a proposal **[A]**. Dock heights (56 px bar, 56 px strip) are proposals, checked at 375 px in the build.
