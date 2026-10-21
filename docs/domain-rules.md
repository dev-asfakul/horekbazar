# HorekBazar: Domain Rules (part of the Product contract)

Checkpoint 2 of 6. Status: **approved by the owner 2026-10-21 with conditions** (listed in `DESIGN.md` → Product contract). This document is now authority level 4 (`principles/authority.md`): only the owner, or a higher constraint (safety, accessibility, correctness, law), changes it. Items still open are marked **open**; **[A]** defaults stay proposals; every **[L]** item still needs qualified local legal review.

Conventions: "must" = acceptance-tested; **[L]** = a legal interpretation that requires qualified Bangladeshi legal review before launch (see §15); "configurable" = a store setting with the stated default; **[A]** = an assumption from type research, open to change; **[D#]** = an unresolved decision listed at the end.

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
- Staff accounts require **email verification** (mandatory, D13).
- **Two-factor authentication (D7, approved at Checkpoint 2):** mandatory for **Owner** and **Store Manager**, optional for other staff roles. Implemented with Better Auth's two-factor plugin (TOTP authenticator apps; the plugin is exported by `better-auth@1.7.12` as `better-auth/plugins/two-factor`).
  - Enrolment is forced at the next sign-in for any account that holds a mandatory-2FA role; until enrolled, the account can reach only the enrolment screen.
  - **Recovery:** ten single-use backup codes generated at enrolment, stored hashed, shown once, regenerable after re-authentication. If a staff member loses both factor and codes, an Owner (with 2FA) resets their 2FA from `/admin/staff`; the action is audited and the user must re-enrol. If the **last Owner** is locked out, recovery is a documented server-side command (`npm run admin:recover-owner`) that requires direct server/database access, writes an audit row and forces re-enrolment; there is no email-only bypass.
  - **Session revocation:** enabling, disabling or resetting 2FA, changing a password, or changing a role revokes all other sessions of that user. Users can view and revoke sessions in their security page; Owners can revoke any staff session.
  - **Step-up:** sensitive actions (staff and role changes, integration secrets, data export, danger-zone actions) require a fresh 2FA check within the last 10 minutes **[A]**.
- Every staff write is written to the audit log (actor, capability, target, before/after summary, IP hash, time).
- Customers can only read and write their own records. Every repository function takes the session principal and scopes the query; there is no unscoped customer query outside `lib/db/`.

## 2. Modules and ownership

| Module | Owns (collections) | Depends on |
|---|---|---|
| Settings & config | `settings` (single document, versioned), `featureFlags` | — |
| Identity | Better Auth collections (`user`, `session`, `account`, `verification`), `staffRoles` | Settings, Email |
| Catalogue | `products`, `variants`, `categories`, `collections`, `brands` (flagged), `attributes` | Media, Search |
| Merchandising | `homeSections`, `banners` | Catalogue |
| Pricing & promotions | `promotions` (flash sale, product promo, quantity tier), `coupons`, `couponRedemptions`, `couponCustomerUsage` (proposed, §4.1) | Catalogue |
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
| `pending_confirmation` | customer places order (signed in, valid BD phone number on the delivery address) | reserve each line | "Order received, waiting for confirmation" | confirmed, rejected, cancelled_by_customer, cancelled_by_store |
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
- **Customer verification for COD (D13, approved at Checkpoint 2):** checkout requires a signed-in account and a **format-valid Bangladeshi mobile number** (`01[3-9]` followed by 8 digits, stored in E.164 as `+8801…`) on the delivery address. A valid format is not proof of ownership; ownership is checked by the **mandatory admin confirmation** step (`pending_confirmation → confirmed`) before any processing. Customer email verification is optional; **no phone OTP** until an SMS provider is explicitly approved (D14).
- Customer self-cancel is allowed only in `pending_confirmation` or `confirmed` **[A]**; later, the customer can request cancellation and an operator decides.
- **Partial cancellation**: lines carry their own status and are identified by their `lineId` (§4.1, `SCHEMA.md` → OrderLine); cancelling a line releases (before shipping) or creates a return-to-stock task (after shipping) for that line only; order totals, coupon eligibility and delivery fee are recalculated and the customer is shown the change.
- **Auto-cancel**: `pending_confirmation` older than a configurable window (default 48 h, in line with the reported guideline's 48-hour notice for unavailable products **[L]**) is flagged to operators; auto-cancel is configurable and off by default **[A]**.
- Delivery time promise shown at checkout comes from the zone settings and, for the BD demo, is set to respect the reported 5-day same-city / 10-day other-city guideline **[L]**; the template lets other stores set their own.
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
| `receive` | stock in | onHand +n | `stock:<adjustmentId>:<variantId>:receive` |
| `adjust` | manual correction (reason required) | onHand ±n | `stock:<adjustmentId>:<variantId>:adjust` |
| `reserve` | order placed | reserved +n (guarded: `available ≥ n`) | `order:<orderId>:<lineId>:reserve` |
| `release` | cancel/reject before shipping, partial cancel | reserved −n | `order:<orderId>:<lineId>:release` |
| `commit` | shipped | onHand −n, reserved −n | `order:<orderId>:<lineId>:commit` |
| `restock` | verified customer return, inspected resellable | onHand +n | `return:<returnId>:<lineId>:restock` |
| `restock` | returned to origin (failed delivery), inspected resellable | onHand +n | `rto:<orderId>:<lineId>:restock` |
| `write_off` | inspected not resellable (customer return or returned to origin) | ledger only (onHand already deducted) | `return:<returnId>:<lineId>:write_off` or `rto:<orderId>:<lineId>:write_off` |

**Key format: Checkpoint 4 amendment, proposed and awaiting owner approval.**
- **What changed:** the Checkpoint 2 table used `orderId:lineId:<kind>` for order movements, `returnId:lineId:<kind>` for returns (including returned-to-origin goods) and "adjustment id" for `receive` and `adjust`. The canonical format is now `<namespace>:<entityId>:<lineRef>:<kind>`, defined in §4.1.
- **What did not change:** the rule itself. There is still one unique key per logical movement, and a retry reuses it.
- **Why:**
  - The namespace keeps orders, returned-to-origin goods, customer returns and stock documents apart.
  - `<lineRef>` lets one adjustment cover several variants.
  - Returned-to-origin goods have no return record, so they cannot use a `returnId` key.

Rules (all must be tested, including under concurrency):
1. `available` never goes below zero. Reservation uses a single guarded update (`{variantId, available: {$gte: n}}` → `$inc`) inside the order transaction; if any line fails, the whole order fails with a clear "only N left" message.
2. Every movement is one `inventoryLedger` row with a **unique index on the idempotency key**; a retried request returns the original result and moves nothing.
3. Delivered goods stay deducted. Stock is restored only by `release` (never shipped) or `restock` (physically back and inspected).
4. Order, ledger, stock and outbox writes for one operation happen in one MongoDB transaction.
5. A nightly reconciliation job recomputes `onHand`/`reserved` from the ledger and reports (does not silently fix) any drift.
6. Displayed stock: exact counts when `available ≤ lowStockThreshold`, otherwise "In stock" (configurable); never fabricated scarcity.

### 4.1 Idempotency and concurrency contract (proposed at Checkpoint 4, awaiting owner approval)

This section makes the keys in §4, §9 and §13 precise. It changes only one key format (receive and adjust, below). Nothing here is proven: every guarantee becomes a claim only when its test in `docs/BUILD-PLAN.md` §12 has run and passed.

**Why the change.** The draft `SCHEMA.md` v0.2 put one unique `idempotencyKey` on `reservations`. One order reserves several variants, so a single per-request key would either collide between lines or need ad-hoc suffixes. A single "adjustment id" on the ledger has the same problem when one adjustment covers several variants. **Each layer below therefore has its own scope and its own uniqueness constraint; no key is shared between unrelated operations.**

| Layer | Protects against | Uniqueness constraint | Key or value |
|---|---|---|---|
| Request key | the same request processed twice (double tap, both Place order buttons, client retry) | `idempotencyKeys` unique `{scope, principalId, key}`; stores `fingerprint` (hash of the normalised request) and `resultRef` | client UUID. Checkout: generated once per checkout view, renewed after success or when the cart changes. Staff: one per action dialog |
| Order | a second order for the same checkout request, including after the request key has expired | `orders` unique `{userId, checkoutKey}` | the checkout request key |
| Cart | two different checkout requests (two tabs) both ordering the same cart | compare-and-set on the customer's cart `{userId, version}`; placement marks the cart `converted` | — |
| Order line | ambiguous line identity | every order line has a `lineId`: a server-generated ObjectId (hex string) created in the placement transaction, unique within the order (and in practice globally), **never regenerated, reused, renumbered or removed**; cancelled and returned lines keep their `lineId` and change only their status. Lines are never identified by `variantId`: one order may contain separate lines for the same variant, and services must not assume otherwise | — |
| Reservation | two reservations for one order line | `reservations` unique `{orderId, lineId}` | — |
| Ledger movement | the same stock movement twice | `inventoryLedger.idempotencyKey` unique. **Canonical format `<namespace>:<entityId>:<lineRef>:<kind>`** (the §4 table uses it): `order:<orderId>:<lineId>:reserve\|release\|commit`; `return:<returnId>:<lineId>:restock\|write_off`; `rto:<orderId>:<lineId>:restock\|write_off`; `stock:<adjustmentId>:<variantId>:receive\|adjust` | the namespace keeps unrelated operations apart. A retry of the same logical movement rebuilds the same key; a separate movement has a different entity or kind. Each order line is reserved, released, committed and returned-to-origin at most once in its lifetime. A re-ship after `delivery_failed` does not commit again. Separate customer returns of one line differ by `returnId`. `adjustmentId` is the inventory request's client key (request-key scope `inventory`), so a retried submission reuses it and a new submission gets a new one. One adjustment lists each variant at most once |
| Order transition | lost updates and transitions applied twice | compare-and-set on `{_id, status: from, version: v}` → `version: v + 1`; `orderEvents` unique `{orderId, seq}` with `seq = v + 1` | plus the request key for the request itself |
| Coupon | the order's one coupon counted twice; usage limits exceeded under concurrency | `couponRedemptions` unique `{orderId}` (one coupon per order, §5); `coupons.used` guarded `$inc` with `used < usageLimit`; per-customer counter `couponCustomerUsage` unique `{couponId, userId}`, updated with a guarded `$inc` (`count < perCustomerLimit`) | — |
| Outbox | the same side effect queued twice | `outbox.idempotencyKey` unique, deterministic `<type>:<aggregateId>:<seq>`, for example `email.order_confirmed:<orderId>:3` | consumers dedupe on it (for example `emailLog` unique `outboxKey`) and pass it to providers that support idempotency **[NV per provider]** |
| Rewards | accrual or reversal twice | `rewardLedger.idempotencyKey` unique: `order:<orderId>:accrue`, `return:<returnId>:reverse` | — |

**Transaction boundary.** One MongoDB transaction, on a replica set with majority read and write concern, holds all the writes of one operation:
- **Checkout placement:** request-key insert, cart compare-and-set, every line's guarded stock update with its reservation and ledger rows, coupon writes, the order insert, the `orderEvents` row and the outbox rows.
- **Transition:** the order compare-and-set, its event, its stock and coupon effects, and its outbox rows.

Lines are processed in `variantId` order, so concurrent orders touch shared documents in a consistent sequence **[H]**.

**Retry behaviour** (driver error labels):
- `TransientTransactionError` (including write conflicts between concurrent transactions): the whole transaction body is retried in a **bounded** loop (5 attempts or 3 s, whichever comes first) **[A]**. When the bound is reached the request returns `503 CHECKOUT_BUSY` with `Retry-After` and nothing is written.
- `UnknownTransactionCommitResult`: only the commit is retried. The body is never re-executed after a commit that may have succeeded.
- Lost response (browser timeout, server crash after commit): the client retries with the same key. The request-key lookup, or the order's `{userId, checkoutKey}` index once the key has expired, returns the original result. The work is never repeated.

**The seven cases:**
1. **Same customer submits twice:**
   - If the first request has committed, the second returns `200` with the same `orderNumber` and `replayed: true`.
   - If both are in flight, they conflict on the request-key document. The loser retries, finds the committed result and returns it. If the first request aborted (for example on stock), the second runs fresh.
   - The same key with a different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED` and writes nothing.
   - A second tab with a new key fails `409 CART_CHANGED` once the cart is converted.
2. **One order with several variants:** each line gets its own reservation `{orderId, lineId}` and ledger key. If two lines use the same variant, both guarded updates run on that variant's `stock` document in sequence inside the same transaction. If any line fails its guard, the whole transaction aborts, with no partial reservation, and the response names the lines with their real `available` quantity (`409 INSUFFICIENT_STOCK`).
3. **Two customers, the same stock:** each transaction applies the guarded update `{variantId, available: {$gte: n}}`.
   - Concurrent writers to the same stock document conflict, and one retries.
   - On retry the guard sees the committed value, so the request either succeeds within the remaining stock or returns `409 INSUFFICIENT_STOCK`.
   - The validator `available ≥ 0` is the backstop.
4. **Retry after an uncertain result:** the retry rules above apply. The request key and the order index make "commit happened, response lost" return the original result.
5. **Cancel or reject releases stock exactly once:** the release step updates each reservation with `{orderId, lineId, status: "active"}` → `released`. It changes `stock` and writes the `release` ledger row **only if that update matched**. The ledger key is a second guard. The order compare-and-set lets only one terminal transition win; the other gets `409 STATE_CHANGED`.
6. **Repeated or out-of-order transitions:**
   - The same request key returns the first result.
   - A different key, when the order has already moved, returns `409 STATE_CHANGED` with the current state.
   - A transition not allowed from the current state (§3) returns `409 ILLEGAL_TRANSITION`.
   - Courier events are applied only if they move the shipment forward in a fixed order of statuses; older and duplicate events are recorded in `courierEvents` and ignored (`200`).
7. **Coupon and outbox duplication:**
   - Coupon writes happen inside the placement transaction, so an aborted placement leaves no redemption and no usage.
   - A cancel or reject before dispatch releases the redemption once (compare-and-set `held → released`) and decrements both counters once **[A: usage is restored on cancellation; owner may change]**.
   - Outbox rows are inserted in the same transaction with deterministic keys, so a retried transaction cannot duplicate them.
   - Delivery from the outbox is at least once; consumers dedupe by the outbox key.

**Conflict responses:**
- `200 replayed` (same request, same result).
- `409`, each with a localised message and the data needed to recover: `IDEMPOTENCY_KEY_REUSED`, `CART_CHANGED`, `INSUFFICIENT_STOCK` (lines and available quantities), `PRICE_CHANGED` (new totals), `COUPON_LIMIT`, `STATE_CHANGED` (current state), `ILLEGAL_TRANSITION`.
- `503 CHECKOUT_BUSY` (retry bound reached, nothing written).

**Retention.** Request keys expire after 7 days (TTL) **[A]**. The order's `{userId, checkoutKey}` index is permanent, so expiry cannot create a duplicate order.

## 5. Pricing, promotions, coupons, rewards (D8 approved; D9 approved as a proposal pending legal review; Checkpoint 2)

### 5.1 Money

- All amounts are stored as **integers in the currency's minor unit** (BDT: poisha, 1/100 taka). No floating-point money anywhere.
- Store setting `roundingUnit` (default **1 taka = 100 poisha** for the BD demo **[A]**, configurable down to 1 minor unit) and `roundingMode` (default **half-up**). Rounding happens at defined points only (below), never on display.

### 5.2 Resolution order (server only, snapshotted onto the order)

For each line, then for the order:

1. **Base unit price** of the variant. An optional **compare-at** price is shown struck through only when it is a genuine previous selling price **[A]**.
2. **One automatic promotion per line**: the single best of active flash sale and product promotion for that variant (lowest resulting unit price; ties go to the flash sale). Automatic promotions never stack with each other.
3. **Quantity tier**: applies only when **no flash sale** is active on that line. If a product promotion and a tier both apply, the line takes whichever gives the lower unit price (they never stack).
4. Line total = resolved unit price × quantity, rounded to `roundingUnit`.
5. **Merchandise subtotal** = sum of line totals.
6. **One coupon per order** (types: percentage, fixed amount, free delivery).
7. **Delivery fee** from the zone and free-delivery rules.
8. **Rewards redemption** last.
9. **Total payable (COD)** = merchandise subtotal − coupon discount + delivery fee − rewards redeemed. Never below zero.

### 5.3 Coupon rules

| Rule | Definition |
|---|---|
| Eligibility | Optional lists of included/excluded categories and products, customer conditions (first order only, per-customer limit), date window, total usage limit. Lines on flash sale are **excluded from coupon eligibility by default** (store setting `couponsApplyToFlashSale`, default false) **[A]**. |
| Minimum subtotal | Evaluated on the **eligible-lines subtotal** after step 2–4 automatic pricing, before the coupon itself, delivery and rewards. |
| Percentage | Discount = eligible-lines subtotal × rate, optional maximum cap, rounded to `roundingUnit`. |
| Fixed amount | Discount = min(amount, eligible-lines subtotal). |
| Free delivery | Sets the delivery fee to zero for the zones the coupon lists (all zones if none), with an optional maximum fee covered; it is the order's one coupon. It does not reduce the merchandise subtotal. |
| Allocation | The order-level discount is allocated to eligible lines **pro rata with the largest-remainder method**, so line allocations sum exactly to the discount. Allocations are stored per line and drive partial-cancellation and return amounts. |
| Usage | Counted atomically at placement (guarded increment against the limit, inside the order transaction); released if the order is cancelled or rejected before shipping. |
| Failure messages | Specific and honest: expired, not started, limit reached, minimum not met (with the amount missing), not eligible for these items, already used. |

### 5.4 Free-delivery rules (store level)

- Zone threshold: free delivery when the **merchandise subtotal after coupon discount** (before rewards) is at or above the zone's threshold.
- Product flag: if every line is flagged free-delivery, the fee is zero; mixed carts pay the normal fee **[A]**.
- If both a store rule and a free-delivery coupon apply, the coupon is not consumed (the customer is told it is not needed) **[A]**.
- The cart shows why delivery is free or how much more is needed.

### 5.5 Recalculation on partial cancellation and returns

- Unit prices stay as snapshotted at placement; a cancellation never re-prices remaining lines against current sales.
- **Quantity tiers** are re-evaluated against the snapshotted tier table using the remaining quantity.
- **Coupons**: percentage coupons are recomputed on the remaining eligible subtotal; fixed coupons are capped at the remaining eligible subtotal; if the remaining eligible subtotal falls below the coupon minimum, the coupon is removed (usage released if not yet shipped).
- **Delivery fee and thresholds** are re-evaluated.
- **Fairness rule:** a **store-initiated** cancellation (out of stock, damaged, rejected line) never increases the amount payable for the remaining items: it cannot remove a coupon, raise the delivery fee or drop a tier price that the customer qualified for at placement. A **customer-initiated** cancellation re-evaluates all of the above.
- **Rewards** redeemed on cancelled lines (by their pro-rata allocation) are returned to the reward ledger as a reversal entry; never as cash.
- Every recalculation is shown to the customer as a before/after summary and recorded as an order event.

### 5.6 Flash sales

Start/end time in the store timezone; optional per-sale quantity cap enforced with the same guarded atomic update as stock; countdowns only for real end times. A sale that ends between cart and placement re-prices the cart and the customer sees the change before confirming.

### 5.7 Rewards (D9, approved as a proposal at Checkpoint 2; legal review required **[L]**)

- HorekBazar calls it "HB Credit"; the **name, earning rate, eligible orders, redemption cap (% of merchandise subtotal), minimum redemption, expiry period and enable flag are all store settings**.
- Shape: a **non-cash loyalty discount** only. It is earned only on `completed` orders, redeemable only as a discount on future orders in the same store, and reversed on returns. It is never withdrawable, never convertible to cash, never transferable, never paid out as a refund, and never described as a wallet, balance of money, cashback or deposit.
- Customer-facing copy must say "loyalty discount points" (or the store's term) and state the expiry; the template ships no wording that claims monetary value.
- Bangladesh reportedly restricts virtual wallets without Bangladesh Bank permission and requires cashback to be effective immediately **[L]**; the feature stays disabled in a production BD store until a qualified local lawyer has reviewed the configured scheme.

Preorders: product-level flag with expected availability date and optional cap; COD only, no advance payment taken (a law-firm summary reports the guideline limits advance payment on goods not ready to ship to 10% without escrow, per [Mahbub & Co.](https://mahbub-law.com/ministry-of-commerce-issues-detailed-guidelines-on-e-commerce-business/)) **[L]**.

Reviews: only customers with a delivered line for that product; one review per order line; star rating + text + optional photos; moderation hides abusive, illegal or personal-data content with a recorded reason; negative reviews are never removed for being negative. Aggregate rating and `Review` structured data use only published real reviews.

## 6. Delivery

- Zones are configurable lists of districts/areas (BD default: Inside Dhaka, Dhaka suburbs, Outside Dhaka **[A]**) with fee, optional weight surcharge, delivery estimate text, and enabled flag.
- Address model: name, phone (BD format validated, required), division, district, upazila/thana, area, address line, landmark, label (home/office). Each level stores a stable code (P-code where available) plus Bengali and English names. Courier-specific area IDs (for example Pathao city/zone/area) are mapped separately at booking time, because couriers use their own location lists **[A]**.
- **Location dataset (D12, research done, selection still open):** see §6.1.
- Free delivery: see §5.4.

### 6.1 Bangladesh location data: candidate sources (researched 2026-10-21)

| Source | Licence (as published) | Coverage | Update history | Bengali names | Assessment |
|---|---|---|---|---|---|
| [OCHA COD-AB Bangladesh on HDX](https://data.humdata.org/dataset/cod-ab-bgd) (source: Bangladesh Bureau of Statistics) | Creative Commons Attribution for Intergovernmental Organisations (CC BY-IGO 3.0); attribution required | Levels 0–4 gazetteer (division, district, upazila, union) with P-codes; level 3 has 507 upazila features; tabular gazetteer modified 4 April 2023 | The [COD-AB status dashboard](https://ocha-dap.github.io/hdx-cod-ab-status/) lists a Bangladesh 2025-Q3 **major** update as Done | not verified | **Preferred primary source**: authoritative origin, stable P-codes, clear licence. Must verify which file version contains the 2025 update and whether names are English only. |
| [nuhil/bangladesh-geocode](https://github.com/nuhil/bangladesh-geocode) | MIT (repository) | Division, district, upazila, union; SQL/CSV/JSON | Last commit 17 March 2023; 17 open issues | yes | Useful for **Bengali names**, cross-checked against COD-AB by code. Stale; data provenance not stated, so MIT on the repository may not settle the data's origin. |
| [open-admin-data/bangladesh-administrative-divisions](https://github.com/open-admin-data/bangladesh-administrative-divisions) | States data CC BY 4.0, code MIT; GitHub reports `NOASSERTION`; cites COD-AB (CC BY-IGO) as source | 8 divisions, 64 districts, **495** upazilas, bilingual names, postcodes where available | Created May 2026, last push 8 September 2026, 2 stars | yes | Promising but young; relicensing CC BY-IGO data as CC BY 4.0 needs checking; its upazila count differs from COD-AB. |
| [meetshaks/bangladesh-administrative-boundaries-json](https://github.com/meetshaks/bangladesh-administrative-boundaries-json), [ifahimreza/bangladesh-geojson](https://github.com/ifahimreza/bangladesh-geojson) | **no licence** | various | — | — | **Rejected**: no licence means no right to redistribute. |

Open questions before selection: the upazila count differs between sources (495 in open-admin-data vs. 507 upazila features in COD-AB level 3), likely from how city-corporation thanas are counted; it must be reconciled against the current BBS/COD-AB file. The proposed approach is COD-AB as the code backbone, Bengali names from a licensed source matched by code, a recorded attribution in `docs/LICENSING.md` and `MEDIA.md`-style data notes, and an import script that reports unmatched rows rather than guessing.

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
| `payments` | COD only (D15: online payments excluded from v1) | checkout | — | port exists for later gateways |
| `sms` | none in v1 (D14: excluded) | — | no SMS features shown | port interface reserved for a later approved provider |
| `jobs` | MongoDB outbox + external scheduler or worker (§13) | async side effects | admin health shows **failing**; nothing is reported as sent | at-least-once delivery, idempotent handlers, dead-letter after N attempts |

Gemini specifics: server-only; per-buyer key; generates or rewrites title, short description, long description, feature bullets, SEO title/description in Bengali and English; output stored in `aiDrafts` with a diff; an editor approves per field; approval writes a product version and an audit row; never auto-publishes; rate-limited per staff user; admin notice that free-tier API content may be used by Google.

## 8. Configuration model

Three layers, so buyers customise without editing core code:

| Layer | Holds | Edited by |
|---|---|---|
| Environment variables | secrets and per-environment endpoints only | deployer |
| `settings` document (database, versioned, cached) | store identity (name, logo, favicon, domain), brand colours, font preset, currency, locale defaults, timezone, contact, social links, policy content (bn/en), footer, delivery zones, feature flags, reward terminology and rates, notification toggles, SEO defaults | Owner/Manager in `/admin/settings` |
| `config/` (code, typed, small) | allowed font presets (fonts are bundled at build), section-type registry, default values for a fresh install | developer (rare) |

- First run with an empty database opens `/admin/setup`: create Owner, store identity, delivery zones, then optional integrations. An **empty development database is a valid state**; storefront listings then show honest empty states.
- **Catalogue content (D11: Owner authorized catalogue generation; generated catalogue pending owner review and approval.):** `data/` contains only catalogue content the owner supplies or explicitly approves, with legitimate image rights and accurate prices. `npm run db:seed` imports only that content and does nothing if `data/` is empty. The generated starter catalogue is a **draft review package** in `catalogue/horekbazar/`, outside `data/`; records move to `data/` only after record-level owner approval (§16). No fabricated reviews, ratings, sales figures, stock levels, supplier relationships, certifications or order history are ever generated. Category structure and merchandising stay **proposed** until the owner approves them.
- HorekBazar-specific content (copy, categories, draft and approved catalogue, logo) lives in `catalogue/horekbazar/`, `data/` and `public/brand/` only; core code contains no HorekBazar strings and never reads `catalogue/`.
- Settings changes invalidate cached pages by tag.
- Template upgrades: versioned database migrations (`migrations/NNNN_*.ts`) run by `npm run db:migrate`, recorded in a `migrations` collection; `CHANGELOG.md` with upgrade notes; core files vs. buyer-owned files documented.

## 9. Security requirements

- Sessions: HttpOnly, Secure, SameSite=Lax cookies; rotation on sign-in and privilege change; session list and revoke in `/account/security`.
- Staff 2FA, recovery and session revocation: see §1.
- Passwords: Better Auth hashing; minimum length 10; breached-password check optional; reset tokens single-use, short-lived; generic responses that do not reveal whether an email exists.
- CSRF: same-origin checks on all mutations; server actions only.
- Validation: every input validated server-side with Zod (`sec-11`); output encoded; rich text sanitised with an allowlist.
- Rate limits (Redis): sign-in, registration, password reset, checkout placement, coupon validation, search suggestions, review posting, messages, AI drafting, webhook endpoints.
- Idempotency: checkout and every staff state transition take an idempotency key; duplicates return the first result. Scopes, constraints and retry rules: §4.1 (proposed at Checkpoint 4).
- Uploads: server-signed, folder-scoped, type and size limited, no SVG uploads from users.
- Webhooks: signature or shared-secret verification, timestamp tolerance, replay protection by event id.
- Headers: CSP with nonces, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors none (admin) / self (storefront).
- Secrets: env only, never sent to the client, never logged; integration settings page shows configured/healthy only.
- Personal data: minimum collection; phone and address visible to staff with the capability only; data export and deletion request flows; retention settings for logs; no customer data in development seeds; logs redact PII.
- Backups: documented backup and restore procedure per environment. Atlas Free clusters can enable backups with a daily snapshot and up to four retained snapshots ([Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)); production needs a tier with point-in-time recovery or a documented equivalent **[A]**. Restores are rehearsed before launch.
- Dependencies: lockfile committed, `npm audit` in CI, Renovate/Dependabot optional.

## 10. SEO and accessibility (contract-level)

- Indexable: home, categories, collections, products, deals/new/preorder listings, information and policy pages. Noindex: cart, checkout, account, admin, search results, filtered combinations beyond the first facet **[A]**, flow pages.
- Canonicals: products have one canonical URL regardless of category path; paginated pages are self-canonical; filtered URLs canonicalise to the unfiltered category.
- **Localisation (D10, approved at Checkpoint 2):** Bengali at `/`, English at `/en/…`, the same stable Latin slug in both (`/p/<slug>` and `/en/p/<slug>`); slugs never change when names are edited (old slugs redirect 301).
- The locale switcher keeps the current page and query (`/c/kitchen?page=2` ↔ `/en/c/kitchen?page=2`) and sets a preference cookie; the default locale never auto-redirects crawlers by `Accept-Language`.
- Each locale page is **self-canonical**; `hreflang` pairs (`bn`, `en`, and `x-default` → Bengali) are emitted only when both language versions have real content. A page without an English translation is not indexed in English: it canonicalises to the Bengali page and is left out of the English sitemap.
- Titles, descriptions, Open Graph and structured data are localised; `<html lang>` matches the content; sitemap index split by type and locale; robots rules per environment (staging disallows all).
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
| Checkout | Placing an order requires a signed-in customer and a format-valid BD mobile number; no order is processed before admin confirmation; fees and totals equal the server calculation; a double submit creates one order. |
| Inventory | **Concurrency proof:** 100 simultaneous reservation attempts for a variant with 10 available units yield **exactly 10 successes and 90 rejections** with the error `INSUFFICIENT_STOCK` and a clear message; afterwards `available = 0`, `reserved = 10`, exactly 10 `reserve` ledger rows exist, and `available` was never negative (asserted at the end and enforced by the collection validator `available ≥ 0`). Runs on a real replica set (§12), repeated 20 times in CI without a flake. |
| Inventory | Replaying any movement with the same key changes nothing. Cancel before ship releases; ship commits; delivered stays deducted; restock only after inspection. |
| Orders | Invalid transitions return 409; every valid transition writes one event and its stock effect atomically. |
| Courier | Duplicate or out-of-order webhooks do not regress status; tracking link shows on customer and admin order pages. |
| Coupons | Limits hold under concurrency; cancellation before ship returns the usage; allocations sum exactly to the discount; the §5.5 fairness rule holds for store-initiated cancellations. |
| Rewards | Ledger balance equals the sum of entries; returns reverse earned credit. |
| Reviews | Only verified purchasers can review; aggregate equals published reviews. |
| AI | With no key, no AI control renders; with a key, nothing reaches live content without approval. |
| Email/Push | Missing provider never produces "sent" wording; sends go through the outbox and are retried. |
| Security | Every admin route and action rejects users without the capability (tested per capability). Owner and Store Manager cannot use the admin without 2FA; 2FA reset and password change revoke other sessions. |
| SEO | Product pages emit valid Product JSON-LD with real values; filtered URLs carry the right canonical/noindex. |
| Performance | Mobile LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on product and category pages (lab, throttled), JS within the tier budget in `gates/rules.md`. |
| Scale | A k6 plan for 50K virtual users exists with traffic mix and thresholds; results reported honestly with the infrastructure used. |
| Schema | CI fails if any generated MongoDB validator differs from the committed snapshot, or if the database's live validator differs from the generated one (§14). |
| Jobs | No email, push or courier action is reported as sent until the provider has accepted it; outbox lag and dead letters are visible in admin; a stopped scheduler raises a visible alert (§13). |
| Localisation | Switching locale keeps the page; canonicals and `hreflang` validate; untranslated pages are not indexed in English. |
| Gate | `scripts/completeness.mjs` passes (axis X) and every core journey passes axis J. |

## 12. Database topology: replica set required

- Multi-document transactions are required (order + stock + ledger + coupon + outbox in one transaction). MongoDB documents that "standalone deployments do not support transactions" and that a replica set is required ([MongoDB production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)).
- **Development:** a separate Atlas development cluster (Atlas clusters run with a fixed 3-node replication factor, per [Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)) or a local **single-node replica set** (`mongod --replSet rs0`, initiated once). A plain standalone `mongod` is not supported.
- **Tests:** a disposable test replica set (local Docker or `mongodb-memory-server` in replica-set mode), never the development or production database. This is test infrastructure only; the application never uses an in-memory database.
- **Staging/production:** a replica set (Atlas or self-managed) with majority write concern for order and inventory writes, and retryable writes enabled.
- **Startup check:** on boot the app runs `hello` and refuses database-backed writes (with an admin-visible error) if the deployment is not a replica set or sharded cluster.
- Free-tier limits relevant to development: 100 operations per second and 500 connections on Atlas Free clusters ([Atlas Free cluster limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/)); the driver client is a per-process singleton to avoid connection storms.

## 13. Background jobs: outbox and scheduler

**Outbox.** Every side effect (email, push, courier booking/sync, search reindex, cache purge, reward accrual) is written as an `outbox` document in the same transaction as the business change. Fields: `type`, `payload`, `idempotencyKey` (unique), `status` (`pending | processing | done | failed | dead`), `attempts`, `availableAt`, `leaseUntil`, `lastError`, `providerRef`.

**Drain.** A worker claims jobs with an atomic `findOneAndUpdate` (`status: pending`, `availableAt ≤ now` → `processing`, `leaseUntil = now + lease`). Expired leases are reclaimable. Handlers are idempotent (they pass the `idempotencyKey` to providers that support it). Retries use exponential backoff with jitter; after N attempts (default 8) a job becomes `dead` and is shown in admin.

**Honest states.** A job is `done` only when the provider has **accepted** the request (for example Resend returns a message id; a courier returns a consignment id). The UI says "accepted by the email provider", not "delivered", unless a verified provider webhook confirms delivery.

**Scheduler: a real, configurable trigger (`JOBS_TRIGGER`).** No in-process timer inside the web server is used in production.

| `JOBS_TRIGGER` | How it runs | Suitable for | Notes |
|---|---|---|---|
| `worker` | a separate long-running Node process (`npm run worker`) polling the outbox every few seconds | Docker, VPS, any Node host; local development | Recommended for self-hosting; one or more instances (leases make it safe) |
| `http` | an authenticated endpoint `POST /api/jobs/drain` (bearer `CRON_SECRET`) called by an external scheduler: Vercel Cron on a paid plan, Upstash QStash schedules (signature verified), GitHub Actions schedule, or another cron service | serverless hosting | Each call drains for a bounded time and returns counts |
| `vercel-cron` | `http` triggered by Vercel Cron | Vercel **Pro** | Vercel Hobby cron runs at most once per day with per-hour (±59 min) precision ([Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)), so it is **not acceptable** as the outbox trigger |

**Monitoring.** Admin health shows: trigger mode, last successful drain time, oldest pending job age, dead-letter count. If the last drain is older than a threshold (default 5 minutes in production) the dashboard shows a failing state and, if email is configured, the Owner is notified once per incident.

## 14. Schema consistency: Zod and MongoDB validators

- **Zod is the single source of truth** for every persisted document shape (`lib/modules/<m>/schema.ts`). TypeScript types are inferred from it.
- A generator (`npm run db:validators`) converts each collection schema to a MongoDB `$jsonSchema` validator: Zod 4's built-in `z.toJSONSchema()` (present in `zod@4.6.7`) produces JSON Schema, then a small, tested converter maps it to MongoDB's dialect (`bsonType` for `objectId`, `date`, `long`/`int` money fields, `decimal` where used; removes unsupported keywords such as `$ref`, `format` and `$schema`). Fields with custom refinements that JSON Schema cannot express are listed in the generator output and enforced in the service layer.
- Generated validators are **committed** under `db/validators/<collection>.json`.
- **Migrations** apply validators with `collMod` (`validationLevel: "strict"`, `validationAction: "error"`) and create indexes; `npm run db:migrate` is idempotent.
- **CI checks:** (1) regenerate validators and fail on any diff from the committed files; (2) on the test replica set, apply migrations, then compare `listCollections` validators with the generated ones; (3) a test per collection inserts a known-invalid document and expects the database to reject it.
- Database-level invariants that must never break are also expressed as validators (for example `stock.available ≥ 0`, `stock.reserved ≥ 0`, money fields are integers).

## 15. Legal basis register (all items **[L]**)

Every legal statement in these documents is an **interpretation from secondary sources** and must be re-checked against the authoritative text and confirmed by qualified Bangladeshi legal counsel before launch. Nothing here is legal advice.

| Topic used in the design | Current source (secondary) | Authoritative source to check before launch | Status |
|---|---|---|---|
| Terms, delivery and return conditions shown clearly and in Bangla | [Mahbub & Co.](https://mahbub-law.com/ministry-of-commerce-issues-detailed-guidelines-on-e-commerce-business/) | Digital Commerce Operation Guidelines 2021, official Ministry of Commerce publication and any later amendments | needs review |
| Delivery within 5 days same city / 10 days other city; complaints within 72 hours; stock and charges disclosed | [The Daily Star](https://www.thedailystar.net/law-our-rights/news/overview-the-digital-commerce-operation-guidelines-2021-2128871) | same | needs review |
| Advance payment limit for goods not ready to ship; escrow | Mahbub & Co. | same; Bangladesh Bank circulars | needs review |
| Wallet and cashback restrictions (affects HB Credit) | news reporting on the guideline | same; Bangladesh Bank rules on e-money and wallets | needs review before enabling rewards |
| Reviews may not be erased | Mahbub & Co. | same | needs review |
| Personal data protection law (consent, retention, data-subject rights, cross-border transfer) | [DataGuidance](https://www.dataguidance.com/jurisdictions/bangladesh?topic) reports an Act enacted 10 April 2026 replacing the 2025 Ordinance | official text on bdlaws.minlaw.gov.bd and any regulations | needs review |
| VAT on invoices | news reporting on the guideline draft | National Board of Revenue rules | needs review |
| Consumer rights remedies | news reporting | Consumer Rights Protection Act 2009 | needs review |

## 16. Catalogue workflow (D11)

The owner had no catalogue and authorized the agent (2026-10-21) to generate a **proposed** starter catalogue. The workflow keeps that content separate from the reusable template and out of every database until approved.

| Stage | Where | Who | Rules |
|---|---|---|---|
| 1. Generated draft | `catalogue/horekbazar/` | agent | `status: draft`, `review.status: pending_owner_review`; stock 0, `unavailable`, `unverified`; `brand: null`; images `missing`; every price `ownerReviewRequired`; `meta.importAllowed: false`; validated by `tools/catalogue.mjs validate` and `schema.json` |
| 2. Owner review | same | owner | per record, using `REVIEW-CHECKLIST.md`: brand, attributes, real prices, BSTI mark and other **[L]** checks, images with recorded rights |
| 3. Approval | conversation or issue | owner | explicit approval naming product ids or categories; approval of the package is not approval of every record |
| 4. Move to `data/` | `data/` | agent or developer | only approved records; draft-only fields removed; `approvedBy`/`approvedAt` recorded; validated by the application's Zod schemas (§14) |
| 5. Seed | development database only | developer | `npm run db:seed -- --env development --confirm` (to be built in an approved build phase): refuses non-dev targets, dry-run diff first, idempotent by SKU/slug, never deletes; products created unpublished with zero stock |
| 6. Stock and publish | admin | staff | stock enters only via `receive` ledger movements after a physical count (§4); publishing is a separate per-product action |

- The application never reads `catalogue/` at runtime, never falls back to it when the database is empty, and the folder is excluded from the sellable template package.
- Prices are integer poisha (§5). `reference_derived` prices cite an official source (TCB) and are indicative market references, not selling prices; `estimate_requires_owner_review` prices are unsourced placeholders.
- Forbidden in catalogue records at every stage: ratings, reviews, sales counts, popularity, bestseller labels, urgency or countdowns, invented compare-at prices, supplier relationships, unverified certifications, and health, purity or origin claims without evidence.
- Competitor descriptions and images are never copied.

## Decisions (Checkpoint 2)

| ID | Decision | Status |
|---|---|---|
| D5 | Deployment and Vercel account resolution deferred to the deployment checkpoint; the app stays host-portable; does not block the product contract | **deferred** (owner) |
| D7 | Staff 2FA mandatory for Owner and Store Manager, optional for others; recovery and session revocation as in §1 | **approved** (Checkpoint 2) |
| D8 | Single best automatic promotion; tiers only without a flash sale; one coupon; rewards last; interactions as in §5 | **approved** (Checkpoint 2; the **[A]** defaults inside §5 stay proposals) |
| D9 | HB Credit as a non-cash loyalty discount, fully configurable, no cash/wallet claims, disabled for BD production until legal review | **approved as a proposal** (Checkpoint 2); disabled for BD production until legal review |
| D10 | Bengali at `/`, English at `/en`, shared stable Latin slugs, rules in §10 | **approved** (Checkpoint 2) |
| D11 | Catalogue: the owner authorized generation of a proposed starter catalogue (`catalogue/horekbazar/`, workflow §16); records are drafts with zero stock, no images and owner-review prices; empty dev database remains valid | **Owner authorized catalogue generation; generated catalogue pending owner review and approval.** |
| D12 | Location dataset: research done (§6.1); COD-AB backbone + licensed Bengali names proposed; licence, attribution, completeness and version still to verify; must be resolved before any location-data-dependent behaviour (zone mapping, address pickers, delivery-charge lookup by area) is implemented | **open** (proposed approach) |
| D13 | Valid BD phone required + admin confirmation before COD processing; customer email verification optional; staff email verification mandatory; no phone OTP | **approved** (Checkpoint 2) |
| D14 | SMS excluded from v1; `sms` port reserved | **approved** (Checkpoint 2) |
| D15 | Online payments excluded from v1; COD only | **approved** (Checkpoint 2) |
| D16 | Excluded from v1: product Q&A, gift cards, subscriptions, POS, multiple warehouses; wishlist disabled unless separately approved | **approved** (Checkpoint 2) |
