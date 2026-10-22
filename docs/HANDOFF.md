# Handoff for the next developer or agent

Last updated 2026-10-23 (Asia/Dhaka), after B9 part 2b (Gemini AI drafts). The "B9 part 2b record" below is
the newest; older sections describe B4–B5 and are kept for their detail. Read this first, then `AGENTS.md`, `DESIGN.md` (Decision trace), `docs/BUILD-PLAN.md`
§11 (phases), `docs/STATUS.md` and the newest entries of `docs/PROGRESS.md`.

## Where the project is

| Phase | State |
|---|---|
| B0–B4 | merged to `main` (PRs #1–#9). B4 had one contract gap (bulk status), fixed in PR #12 |
| Banglish storefront copy, English-only admin | PR #11 merged into `preview/horekbazar-v1` (merge `cbf8471`), CI green |
| B4 bulk product status | PR #12 merged into `preview/horekbazar-v1` (`1468fb3`) |
| B5 storefront catalogue | PR #13 merged into `preview/horekbazar-v1`; on `main` through PR #14 (merge `376decc`, owner-authorised), post-merge CI success, live on horekbazar-preview.vercel.app (shows the setup page until the Owner exists) |
| Takeover audit docs | PR #10 (into `main`, open); its commits are also merged into `feat/b5-storefront` |
| B6 cart and pricing, B7 checkout and orders | PR #22 into `preview/horekbazar-v1` (`77eb016`); on `main` through PR #23 (`4480140`) after `check` passed |
| B8 fulfilment and returns | PR #24 (`feat/b8-fulfilment`) into `preview/horekbazar-v1`; see "B8 record" below |
| B8 on `main` | yes: PR #25 (`e91afe2`); CI timeout fixed in PR #26 (`f3701cd`, push run success) |
| B9 engagement (part 1) | branch `feat/b9-engagement`, PR into `main`, **not merged** (owner review); see "B9 record" |
| B9 part 1 | merged to `main` (PR #27 `d47d451`); showcase population PR #29 (`4a0ef5b`) |
| B9 part 2a notifications | branch `feat/b9-notifications`, PR into `main`, **not merged** (owner review); see "B9 part 2a record" |
| B9 part 2b AI drafts | branch `feat/b9-ai-drafts`, stacked on `feat/b9-notifications`, PR **not merged** (owner review); see "B9 part 2b record" |
| B10 → B11 hardening | not started |

Branch flow: feature branch → PR into `preview/horekbazar-v1` → merge after CI is green → PR into `main`,
merged by the agent after the required check passes (owner authorisation 2026-10-22, DESIGN.md Decision trace). `main` is protected (required check `check`).

## Session 2026-10-22: what was done, how, and what is left

### Done

1. **Banglish storefront in Bengali script (owner, corrected 2026-10-22).** `messages/bn.json` is
   conversational Bangla with English words in Bengali letters ("সেটআপ বাকি", "কার্ট", "লগইন করুন"),
   272 shopper strings. A first pass in Latin letters ("Setup baki") was a misreading of "Banglish" and
   was replaced. Admin-only form messages are English; the admin namespace is served from `en` for every
   locale (`i18n/request.ts`, `lib/i18n/admin.ts`). `lang="bn"`, Bengali digits, Bangla e-mails. Guard test
   `tests/unit/banglish.test.ts` (Bengali script everywhere for shoppers, one spelling per commerce
   term). Product and category data are not rewritten; `shown()` in `lib/storefront/context.ts` picks the
   stored Bangla text on `/` and English on `/en`.
2. **Bulk product status** (`bulkProductStatusAction`, `components/admin/BulkStatusForm.tsx`): checkbox per
   row, up to 25, every product through `setProductStatus` (publish rules, sample guard, audit).
3. **Real readiness.** `getSetupStatus().ready` is true only with a connected database, an Owner
   (installation record or Owner user) and a saved settings document (`lib/setup/status.ts`).
4. **B5 storefront.** Read model `lib/modules/storefront/catalogue.ts` (one aggregation: lowest active price,
   genuine compare-at, stored availability, filters, sort, 24/page); pages `/`, `/categories`,
   `/c/[...slug]`, `/p/[slug]`, `/search`, `/collections`, `/collections/[slug]`, `/deals`, `/new`;
   components in `components/store/`; canonical + hreflang (`bn-Latn`, `en`, `x-default`), JSON-LD
   (Product/Offer, BreadcrumbList, Organization, WebSite), `sitemap.xml`, `robots.txt`. New text index
   `storefront_text` (language `none`) in `lib/db/collections.ts`. `SITE_INDEXING=on` is the only way to
   allow crawling (off: showcase, not a launch).

### How it was verified (local, Node 24.22.1)

lint OK · typecheck OK · unit 112/112 · integration 88/88 (7 new storefront tests on a replica set) ·
zero-variable build OK · Playwright 215 passed / 58 skipped / 0 failed · `test:e2e:db` 10/10 (3 admin,
7 storefront at 375/768/1440 px with data created through the B4 services). CI `check` green on #11–#13.
Gate: FAIL (zero-variable `/` is the setup page; header search states; B6–B11 completeness), see PROGRESS.

### Showcase (horekbazar_dev), set up 2026-10-22

- **Owner:** created through the live `/admin/setup` (role owner, email `mail.horekbazar@gmail.com`,
  verification e-mail sent). The owner opens that e-mail, then uses "Forgot password" to choose a
  password, signs in and enrols two-step verification. The generated setup password is not in the repo.
- **`npm run showcase`** (idempotent, `_dev` only, Owner as actor): settings saved, zones `dhaka-city`
  ৳60 and `outside-dhaka` ৳120 (showcase values), 39 categories and 144 products published, opening
  stock for 214 of 235 variants (21 deliberately at 0). Live: `/api/health` `setupRequired:false`.
- **`npm run showcase:images`**: public-domain/CC0 photos from `catalogue/horekbazar/showcase-images.json`
  uploaded to Cloudinary (`horekbazar/products/showcase-<slug>`) and linked with `addProductMedia`. See
  PROGRESS for the count that actually landed; Wikimedia throttles bulk downloads (429), rerun to finish.
- **Merchandising (2026-10-22, `npm run showcase`):** 5 published collections from
  `catalogue/horekbazar/showcase-merch.json` (kitchen-staples, home-cleaning, school-ready, phone-and-power,
  everyday-cotton-wear) and 8 published home sections (hero, category tiles, 5 product rails, collection
  grid). Created only when absent, so admin edits survive reruns. The script creates no banners (they need an image).
- **Owner sign-in (verified by records, 2026-10-22):** the Owner completed the normal flow themselves
  (password-reset e-mail 18:58 UTC, password changed 19:01, signed in 19:02, `identity.two_factor_enabled`
  19:02, `banner.created` and `banner.published` 19:06, all with the Owner as actor). `emailVerified` is
  true; one Owner, one credential account. Neither `owner:bootstrap` nor any manual change was used. Note:
  `owner:bootstrap -- --sync-password` only replaces the Owner's password hash and signs out every
  session; it does not verify the e-mail (only the first-Owner creation path does). A verification link
  lasts 24 h; `/login` offers "resend verification e-mail".
- **Banner:** the Owner published one `home_top` banner (own image in `horekbazar/banners/`, links to
  `/c/rice`). Banners appear on `/` only through a `banner` section in `/admin/homepage`; none added yet
  (Owner's choice). Store contact (phone, e-mail, address, hours) is still empty: the owner enters real
  details in `/admin/settings`.
- From this sandbox the Atlas SRV name does not resolve: run scripts with a seed-list `MONGODB_URI`
  **and** `MONGODB_DB=horekbazar_dev`.

### Left, in order

1. **Done for the showcase** (see above). For a fresh database: create the
   Owner at `/admin/setup` (`docs/OWNER-SETUP.md`), save `/admin/settings` once, add delivery zones with
   real fees, publish the 9 top-level then 30 child categories, then bulk-publish products in
   `/admin/products`, receive stock in `/admin/inventory`. All 144 catalogue records are drafts with 0 stock.
2. **Done 2026-10-22:** `db:migrate` on `horekbazar_dev` (validators unchanged, products 6 indexes incl.
   `storefront_text`). Pass **both** `MONGODB_URI` and `MONGODB_DB`: a first run without `MONGODB_DB` went to
   the default database `horekbazar`, created it with 6 staff roles; it was verified to hold only those 7
   documents and dropped. The sandbox cannot resolve the Atlas SRV name; use a standard seed-list URI.
3. **Catalogue images.** 91 of 144 showcase products have one reviewed CC0/public-domain photo
   (`catalogue/horekbazar/showcase-images.json`, source and licence per entry, uploaded with
   `npm run showcase:images`, linked with `addProductMedia`; all 91 verified in Cloudinary and served by
   the CDN, 2026-10-22). The other 53 keep the label tile because no unbranded, licensed photo was found
   (e.g. powdered spices, oils, cleaners, cosmetics, lungi/panjabi/three-piece, power banks, kettle, rice
   cooker). For a real store: own or supplier photos through `/admin/products` (signed upload).
4. **Catalogue enrichment** (brands, more attributes, Banglish display names): needs the owner's review
   of representative names first (`docs/BANGLISH-PROPOSAL.md`), then a schema field for display names.
5. **B5 leftovers:** header search suggestions (prefix API), mega-menu ≥1280 px (the `/categories` page
   and `<details>` filters are used instead, no Radix in the project), `/preorder` (no pre-order field in
   the schema), Banglish synonyms in search ("chal" does not find "Rice"). The SEO and 404 e2e tests
   take ~20 s each (request-context connection delay in the sandbox, not investigated).
6. **B6 cart and pricing → B11 hardening**, per BUILD-PLAN §11, each with its checkpoint.

## B9 part 2b record (2026-10-23)

- **What:** Gemini drafts for product name, short description, description and SEO title/description, in Bengali and English, applied one field at a time. Code: `lib/adapters/ai/gemini.ts`, `lib/modules/ai/{schema,drafts}.ts`, `lib/actions/ai-drafts.ts`, `components/admin/AiDraftsPanel.tsx`.
- **Switches:** `GEMINI_API_KEY` (panel hidden without it), `GEMINI_MODEL` (optional). Capability `catalogue.write`. Rate limit `ai-draft` 20/hour per staff user.
- **Safety:** drafts never touch live fields; Apply is a version-checked transaction with an audit row; a draft made before a later product edit is shown with a stale note next to the current text, and Apply still needs the product version on screen, so a save by someone else after the page loaded makes Apply refuse with a conflict.
- **Merge order:** PR A (notifications) first, then this PR (its base is `feat/b9-notifications`; after A merges, retarget it to `main`).
- **Not done:** category/collection drafts (enum reserved); signed-in browser check of the panel.

## B9 part 2a record (2026-10-23)

### What exists

- **Collections:** `pushSubscriptions` (one per endpoint, at most 10 per account, offers consent time kept only while offers are on), `campaigns` (draft → sent once, version-checked), `emailLog` (masked address + `AUTH_SECRET`-keyed hash, attempts; no TTL until **[L]**). Validators 37; migrated on `horekbazar_dev`.
- **Push:** `lib/adapters/push/webpush.ts` wraps `@block65/webcrypto-web-push` (D3) and does the HTTP request itself (time-bounded; 404/410 = gone → subscription deleted). Outbox job `push.send`; payloads carry the subscription id, never the endpoint.
- **Order updates:** `transitionOrder` queues one push per orders-topic browser for the same statuses that send e-mails, inside the transaction, only when VAPID is configured.
- **Customer:** `/account/notifications`. Permission is asked only after the button is pressed; "Offers and news" is separate and unticked. `public/sw.js` handles push and click only (same-site links, no caching; offline is B10).
- **Admin:** `/admin/notifications` (`campaigns.send`: Owner, Store manager, Marketing manager). The e-mail log section also needs `customers.read`, so a Marketing manager does not see it.

### Not done, and why

- **AI drafts** (B9 part 2b, next PR). **Scheduled campaigns** (`scheduled` status reserved, no scheduler). **Prompt after a meaningful action** (opt-in lives on the account page only).
- Real delivery through a browser push service was not tested (no browser push service in the sandbox); the encryption and VAPID signature are verified independently in unit tests.
- VAPID variables in Vercel: not checked (no Vercel access). Locally they are set and the right shape.

### Easy to break

- Replacing the VAPID key pair silently stops every subscription; changing `AUTH_SECRET` makes old e-mail log entries unsearchable by address.
- `public/sw.js` is outside the proxy (matcher) and has its own CSP in `next.config.ts`; keep `worker-src 'self'` in `lib/security/headers.ts`.
- Campaign URLs must stay site paths (`zInternalPath`); the service worker re-checks them.

## B9 record (2026-10-22)

### What exists

- **Reviews** (`lib/modules/reviews/`): eligible lines are delivered lines of the customer's own
  `delivered`/`completed` orders; **one review per order line** (domain-rules §5.7, unique index
  `orderId_lineId_unique`), so a product bought on two orders can be reviewed twice, a line never.
  A written review is final (no edits, no resubmission: `review_exists`). New reviews are `pending`;
  staff publish, reject (reason required, kept) or reply; every step CAS on `version` and audited.
  `/p/[slug]` shows published reviews only while `features.reviews` is on, with public fields only
  (rating, title, body, first name, date, reply text); no rating or count when there are none.
  Conflict resolved by the owner (2026-10-22): SCHEMA's earlier `{userId, productId}` unique index
  yielded to domain-rules §5.7; data migration `0002-reviews-one-per-order-line` drops that index and
  keeps existing reviews (under the old index no two reviews can share an order line, so the new
  index cannot collide). Reversible: no document is changed.
- **Rewards** (`lib/modules/rewards/`): append-only `rewardLedger`, idempotency key per event; no
  cached balance. `availablePoints` derives the balance: each accrual net of its order's reversals
  until its `expiresAt` (then both stop counting), plus adjustments; `expire` entries are ignored, so
  the deferred expiry job cannot take points twice. `accrueForOrder` runs inside the order transition
  transaction when an order becomes `completed` (only while `features.rewards` is on);
  `reverseForReturn` runs in `settleReturn`; staff `adjustRewards` needs `rewards.write`, a reason,
  an Idempotency-Key and rewards on, and refuses a negative balance. Every ledger write holds the
  customer's `rewardLocks` document in its transaction, so completion racing a return settlement, or
  two deductions at once, cannot double count (tests fail with the lock removed). Customer copy says
  loyalty discount points (domain-rules §5.7). Customers have no action that writes the ledger.
- **Messaging** (`lib/modules/messaging/`): conversations with unread counters, optional link to the
  customer's own order (another customer's order number is `not_found`), open/closed (staff close and
  reopen, version-checked; a customer message reopens), max 500 messages; `clientKey` makes a
  resubmit a no-op and a key reused on another conversation is refused. Reading clears the reader's
  counter only if no message arrived meanwhile. Staff replies re-check `open` inside the transaction.
  `components/store/AutoRefresh.tsx` refreshes every 20 s while the tab is visible (no Ably).
- **Routes and capabilities:** `/account/{reviews,messages,messages/[id],rewards}`;
  `/admin/reviews` (`reviews.moderate`), `/admin/messages` (`messages.reply`), `/admin/rewards`
  (`rewards.write`) in `lib/modules/identity/paths.ts` and `lib/admin/sections.ts`; each action checks again.

### Not done, and why

- Rewards **redemption at checkout** and the **expiry job** (needs checkout pricing changes and a
  scheduled job; rewards stay off for a BD production store until legal review **[L]**).
- **Push notifications** (D3 library fit check not done), **campaigns**, **order e-mails** (Resend
  domain not verified), **AI drafts** (SCHEMA: B10), **review photos**, **AggregateRating JSON-LD**.
- `store_reward` refunds remain refused: domain-rules §5.7 "never paid out as a refund".
- No B9 seed data on `horekbazar_dev` (would be fabricated customer activity).

### Credentials (exposed in conversation, NOT rotated)

The agent has no access to the Atlas, Upstash, Cloudinary, Resend, Google AI, Ably or Vercel
dashboards, so nothing was rotated. Git history and the PR diff were scanned for the values: none
found. `.env.local` is ignored (`.gitignore` `.env.*`). Owner checklist, in this order:

1. **Atlas:** create a database user with `readWrite` on `horekbazar_dev` only; delete or change the
   password of the current user (it has `atlasAdmin`); update `MONGODB_URI` locally and in Vercel
   Preview. Restrict Network Access if possible.
2. Generate new `AUTH_SECRET` (signs every session out), `SETUP_TOKEN`, `CRON_SECRET`,
   `COURIER_WEBHOOK_SECRET` (`openssl rand -base64 32`), and a new VAPID key pair
   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
3. Rotate `UPSTASH_REDIS_REST_TOKEN` (Upstash: reset password), `CLOUDINARY_API_KEY` /
   `CLOUDINARY_API_SECRET` (new key, then disable the old one), `RESEND_API_KEY`, `GEMINI_API_KEY`,
   `ABLY_API_KEY`.
4. Put the new values in `.env.local` and Vercel Preview (Production stays separate, with its own
   database and secrets).

Needed locally and in Preview for the current features: `NEXT_PUBLIC_SITE_URL`, `MONGODB_URI`,
`MONGODB_DB`, `AUTH_SECRET`, `SETUP_TOKEN` (until setup), `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `JOBS_TRIGGER`, `CRON_SECRET`; optional:
`CLOUDINARY_*` (images), `COURIER_WEBHOOK_SECRET` (courier webhooks), `NEXT_PUBLIC_DEFAULT_LOCALE`,
`STORE_TIMEZONE`, `MAINTENANCE_MODE`. Not used by any feature yet: VAPID, `GEMINI_API_KEY`,
`ABLY_API_KEY`. Only the site URL, default locale and VAPID public key are `NEXT_PUBLIC_*`.

### Known limitation

- Account pages stream behind `loading.tsx`, so `notFound()` (feature off, someone else's
  conversation or order) shows the not-found page with HTTP 200, as `/account/orders/[orderNumber]`
  already does on `main`. They are `noindex`; nothing private is rendered. Not changed here.

### Easy to break

- Never insert into `rewardLedger` outside `insertEntry`: inside a transaction a duplicate-key error
  aborts the whole transaction, so the key is checked first.
- Keep `features.reviews` and `features.rewards` default off.
- Any new code that writes `rewardLedger` must call `lockAccount` first in the same transaction.

## B8 record (2026-10-22)

### What exists

- **Order ↔ shipment.** The order steps `shipped`, `delivered`, `delivery_failed`, `returned_to_origin`
  happen only through a shipment (`lib/modules/fulfilment/shipments.ts` → `applyOrderTransition(…,
  viaShipment: true)`); `transitionOrder` refuses them with `shipment_required`. The admin order page
  hides those buttons and shows the shipment panel (`components/admin/ShipmentPanel.tsx`).
- **Stock.** Reserved stock is committed in the hand-over transaction (once; ledger key per order).
  A returned parcel is inspected per line (`inspectReturnedLine`), then `moveReturnedStock` restocks
  or writes off. Customer returns: `inspectReturn` then `settleReturn`. Neither a courier "returned"
  status nor a return request moves stock.
- **Courier port.** `lib/adapters/courier/index.ts` `courierAvailability(env)`: manual always
  available; Steadfast available with both keys; Pathao blocked (D12); RedX unsupported. Steadfast
  client `lib/adapters/courier/steadfast.ts` (official API document, base `https://portal.packzy.com/api/v1`).
  Jobs `courier.book`, `courier.sync` (`lib/modules/fulfilment/courier-jobs.ts`) run from the outbox drain.
- **Webhook.** `app/api/webhooks/courier/[provider]/route.ts` → `lib/modules/fulfilment/webhooks.ts`.
  Authentication is the Bearer secret only (Steadfast has no signature); every applied status is
  re-read from the Steadfast API, so a forged body cannot move a shipment.
- **Returns.** `lib/modules/fulfilment/returns.ts`, `/admin/returns`, `/admin/returns/[id]`; customer form
  on `/account/orders/[n]` (server action `requestReturnAction`, rate limit `returnRequest`).
- **Capabilities.** `fulfilment.write` (shipments), `returns.process` (returns); order operator has
  both, support agent neither (paths.ts, sections.ts; each action checks again on the server).

### Not done, and why

- **Migrations:** run on `horekbazar_dev` 2026-10-22 with the owner's development credentials (all
  B6–B8 collections created; second run a no-op; showcase data unchanged; 0 orders). Any other database
  needs `npm run db:migrate` with `MONGODB_URI` **and** `MONGODB_DB`. Credentials live outside the repo;
  from this sandbox use a seed-list URI (look up the SRV and TXT records over DNS-over-HTTPS).
- **Real couriers:** no credentials were available; Steadfast is tested only against a stubbed `fetch`
  (request shape, accepted, refused 4xx, 200-without-consignment, 5xx). The first live booking should
  be a single test parcel with the owner watching.
- **Pathao** waits for D12; **RedX** has no official public API document; **refunds to store rewards**
  wait for B9; **partial delivery** is shown to staff but does not split lines.
- **Gate:** FAIL as in B4/B7 (SEO on the setup page, header search states, B9–B11 completeness).

### Credentials (exposed in conversation, NOT rotated)

The agent has no access to the Atlas, Upstash, Cloudinary, Resend, Google AI, Ably or Vercel
dashboards, so nothing was rotated. Git history and the PR diff were scanned for the values: none
found. `.env.local` is ignored (`.gitignore` `.env.*`). Owner checklist, in this order:

1. **Atlas:** create a database user with `readWrite` on `horekbazar_dev` only; delete or change the
   password of the current user (it has `atlasAdmin`); update `MONGODB_URI` locally and in Vercel
   Preview. Restrict Network Access if possible.
2. Generate new `AUTH_SECRET` (signs every session out), `SETUP_TOKEN`, `CRON_SECRET`,
   `COURIER_WEBHOOK_SECRET` (`openssl rand -base64 32`), and a new VAPID key pair
   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
3. Rotate `UPSTASH_REDIS_REST_TOKEN` (Upstash: reset password), `CLOUDINARY_API_KEY` /
   `CLOUDINARY_API_SECRET` (new key, then disable the old one), `RESEND_API_KEY`, `GEMINI_API_KEY`,
   `ABLY_API_KEY`.
4. Put the new values in `.env.local` and Vercel Preview (Production stays separate, with its own
   database and secrets).

Needed locally and in Preview for the current features: `NEXT_PUBLIC_SITE_URL`, `MONGODB_URI`,
`MONGODB_DB`, `AUTH_SECRET`, `SETUP_TOKEN` (until setup), `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `JOBS_TRIGGER`, `CRON_SECRET`; optional:
`CLOUDINARY_*` (images), `COURIER_WEBHOOK_SECRET` (courier webhooks), `NEXT_PUBLIC_DEFAULT_LOCALE`,
`STORE_TIMEZONE`, `MAINTENANCE_MODE`. Not used by any feature yet: VAPID, `GEMINI_API_KEY`,
`ABLY_API_KEY`. Only the site URL, default locale and VAPID public key are `NEXT_PUBLIC_*`.

### Known limitation

- Account pages stream behind `loading.tsx`, so `notFound()` (feature off, someone else's
  conversation or order) shows the not-found page with HTTP 200, as `/account/orders/[orderNumber]`
  already does on `main`. They are `noindex`; nothing private is rendered. Not changed here.

### Easy to break

- Do not call `applyOrderTransition` with `viaShipment: true` outside `shipments.ts`.
- Courier statuses only move forward (`courierStatusAdvances`); keep final statuses final.
- Never set `consignmentId` from anything but the courier's accepted answer or staff input.

## B4 record (complete)

Owner approval 2026-10-22: B4 approved; D11 changed: "generate some catalogue source data and push
to database, and admin will curd them for real and test". Implementation of that change: the
existing generated package `catalogue/horekbazar/` (39 categories, 144 products) is loaded into the
**development** database only, by `npm run db:seed` (dry run by default; `--confirm` writes; refuses
unless the database name ends with `_dev`; idempotent by slug and SKU; never deletes; every seeded
document carries `sample: true` and the admin shows a "Sample" badge; products stay draft, stock 0).
Its prices are research estimates, not selling prices. Repository visibility: owner approved private,
but on GitHub Free a private personal repository loses branch protection and secret scanning
(docs.github.com); held for the owner's choice. Secret scanning and push protection were enabled
2026-10-22 while public.

Steps (each is pushed to `preview/horekbazar-v1` when done; tick here in the same commit):

- [x] 1. Catalogue domain: schemas, validators, indexes for `categories`, `products`, `variants`,
      `stock`, `inventoryLedger`; services (category depth 3 and cycle rules, product and variant
      upsert with `version`, publish/archive, inventory receive/adjust with ledger idempotency);
      audit on every write; integration tests. **Done:** `lib/modules/catalogue/` (schema, common,
      categories, products, inventory, locks), 6 validators, `tests/integration/catalogue.test.ts`
      (19 tests). ESLint draft-folder rule narrowed to exclude `lib/modules/catalogue/`.
- [x] 2. Settings and delivery zones (`settings` singleton with `version`; accent contrast check;
      zones without area mapping, D12) and merchandising (`collections` manual, `homeSections` six
      types, `banners`); tests. **Done:** `lib/modules/settings/`, `lib/modules/merch/`, 4 validators,
      `tests/integration/settings-merch.test.ts` (8), `tests/unit/settings.test.ts` (2). Settings
      start as DEFAULT_SETTINGS (version 0, nothing persisted, no zones invented); storefront use of
      settings (accent, numerals) is B5.
- [x] 3. Media: `/api/media/sign` (Cloudinary signed upload, `catalogue.write`, allow-list);
      disabled with a notice when Cloudinary is not configured. **Done:** `lib/adapters/media/cloudinary.ts`,
      `app/api/media/sign/route.ts` (same-origin, capability by purpose, 503 `not_configured`), admin
      CSP `connect-src` adds `https://api.cloudinary.com` on /admin only; `tests/unit/media.test.ts`.
      Not done: checking with Cloudinary that an uploaded asset exists (the server accepts only
      public ids inside the purpose folder). No Cloudinary credentials yet (owner action).
- [x] 4. Admin pages and server actions: products (list with search, filter, pagination; editor),
      categories, inventory, collections, homepage, banners, settings; bn/en messages. **Done:**
      pages under `app/admin/{products,products/new,products/[id],categories,inventory,collections,
      homepage,banners,settings,settings/delivery}`; actions `lib/actions/{catalogue,merch}.ts`, each
      starting with `staffContext(capability)` (server-side decideAccess, mutation, step-up);
      helpers `lib/actions/staff-action.ts` (taka→paisa, Bengali digits, Dhaka datetime) and
      `lib/admin/{page,forms,sections}.ts`; `adminPageFor` gives sub-pages their section's
      capability; nav and admin index built from the caller's capabilities; ActionForm gains
      textarea/number/checkbox/multiselect/datetime-local/url fields and grid/inline layouts;
      `components/admin/{RecordBits,StepUpPanel,MediaUploader}.tsx`; B4 CSS block at the end of
      `app/globals.css`; `tests/unit/admin-forms.test.ts` (13). Checks at this commit: typecheck,
      lint (0 warnings), unit 107/107, integration 76/76, `next build` OK. Not yet exercised in a
      browser — that is step 6. `/admin/settings/features` was folded into `/admin/settings`;
      `/admin/settings/integrations` is deferred.
- [x] 5. `npm run db:seed` from `catalogue/horekbazar/` and its run on `horekbazar_dev`. **Done:**
      `scripts/db-seed.ts` + `lib/db/seed-samples.ts` (through the catalogue services; audit actor
      `system:db-seed`; `--confirm`, `--remove-samples`); `tests/integration/seed.test.ts` (5: non-dev
      refused, dry run writes nothing, real slug skipped, re-run creates nothing, remove-samples).
      `CatalogueError` no longer uses parameter properties (Node type stripping). **Run 2026-10-22 on
      `horekbazar_dev`** (name verified from the script output before writing): `db:migrate` created
      the 10 B4 collections; dry run 39/144/235 to create; `--confirm` created 39 categories, 144
      products, 235 variants (~10 min over Atlas); independent count: all `sample: true`, 0 published,
      235 stock rows all 0, 0 ledger rows, 418 audit rows by `system:db-seed`; a second dry run: 0 to
      create. Docs: DATA.md, README (Database step 3), catalogue IMPORT.md/README, domain-rules §16.
      To reach Atlas from this sandbox the SRV record is resolved via DNS-over-HTTPS into a temporary
      env file that is deleted afterwards (never committed).
- [x] 6. Playwright with a disposable database (sign in as a catalogue editor, create a product
      with a LabelTile, publish it); Motomation gate; docs; PR.
      - [x] 6a. `npm run test:e2e:db` (`playwright.db.config.ts`, `scripts/e2e-db-server.mjs`,
        `tests/e2e-db/catalogue-admin.spec.ts`): zero-variable build + in-memory replica set
        (`e2e_admin_dev`); the fixture signs in through the auth service and hands the cookie to
        the browser, because the login form fails closed without Upstash in production (by
        design); 2/2 pass (category create+publish, product create with LabelTile, refused
        publish without a variant, variant in taka→paisa with stock 0, publish, list, audit; nav
        and 403 for /admin/inventory and /admin/settings). Added to CI. Harness note: migrate is
        spawned asynchronously (a synchronous child deadlocks the in-memory mongod's pipe).
      - [x] 6b. Zero-env e2e: the ten B4 admin URLs redirect to sign-in uncached; /api/media/sign
        403 cross-origin/no origin, 401 signed out, 400 bad purpose. Full suite 215 passed, 58
        skipped (the same 57 opt-in screenshots + 1 WebKit maintenance check as before).
      - [x] 6c. Motomation gate (FAIL as before: storefront SEO and search-form states, B5;
        details in PROGRESS), docs (PROGRESS, STATUS, SCHEMA, README, DATA). PR, merge and
        post-merge: PR #8 (head `013f928`, CI `check` pass incl. `test:e2e:db` 2/2) merged as
        `04158f2`; post-merge CI `push` success; Vercel success.

## Rules that are easy to break

- Never invent catalogue data, prices, stock, reviews, discounts or urgency for production. The only
  generated data is the `sample: true` development load (owner change to D11, 2026-10-22; DATA.md).
- Authorisation happens on the server: `gateStaffPage()` for admin pages, and a principal plus
  capability check inside every admin server action (`lib/actions/admin.ts`). `proxy.ts` only
  redirects when no session cookie exists; it is not an authorisation check.
- Never trust client-sent prices, roles, discounts, stock or claims.
- Do not commit `.env.local`, and do not print or document credential values.
- Do not modify the Motomation skill (`.agents/skills/…`, `.claude/skills` link) or `skills-lock.json`.
- Report gates and tests exactly as they ran. Skipped tests must be explained.
- D18: build work goes to `preview/horekbazar-v1`; only the owner (or the agent on the owner's
  explicit instruction) merges to `main`.

## Running it

```bash
export PATH=~/.local/node/bin:$PATH        # Node 24 (engines); system Node 20 is too old
npm ci
npm run lint && npm run typecheck && npm test
npm run db:validators -- --check
MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration   # disposable MongoDB 8.0.4 replica set
npm run build && npx playwright test                    # zero-variable build is the CI baseline
npm run db:migrate                                      # only against a database you are sure of
npm run db:seed                                         # _dev databases only; dry run, add -- --confirm
npm run test:e2e:db                                     # signed-in admin, disposable database (after build)
```

Sandbox notes: the agent sandbox resolver cannot answer SRV lookups, so `mongodb+srv://` fails
there (`querySrv EBADRESP`); the agent resolved the hosts over DNS-over-HTTPS into a temporary
env file that was deleted after use. Vercel and normal machines resolve SRV fine.

## Identity design in one page (B3)

- Better Auth 1.7.12 with the MongoDB port, configured in `lib/modules/identity/auth.ts`.
  Sessions are database sessions with two extra fields: `stepUpAt` (fresh password or TOTP for
  sensitive staff actions) and `secondFactorAt` (2FA verified in this session).
- `lib/auth/server.ts`: `getPrincipal()` (cached per request), `gateStaffPage(path)` (redirects to
  `/login`, or to `/admin/security` for enrolment or the second factor, else `forbidden()`).
- Capabilities and roles: `lib/modules/identity/capabilities.ts`, `roles.ts`; built-in roles are
  seeded by migration `0001-built-in-staff-roles`. 2FA is required for Owner and Manager (D7).
- First Owner: `/admin/setup` needs email verification (D23 option a) and `SETUP_TOKEN`
  (proposed). The `installation` singleton is written once with a fixed `_id`, so concurrent claims cannot create two first Owners.
- Recovery: `npm run admin:recover-owner` (audited; revokes the Owner's sessions).
- Email: `lib/modules/identity/mail.ts` writes to the outbox and attempts inline delivery; the
  drain retries failures. Resend delivers nothing until the owner verifies a sending domain.
- Known Better Auth behaviour: `verifyTOTP` returns the old session token while it rotates the
  cookie; read the new token from `Set-Cookie` (`sessionTokenFromSetCookie`).

## Known gaps and debts

- Backup-code regeneration; an Owner action to revoke another staff member's sessions.
- Customer accounts have no 2FA (by design so far).
- The storefront setup-required page shows environment variable names (never values) publicly.
- Motomation gate on `/` (B4, 2026-10-22): FAIL. Page-level checks pass; failing rules are SEO
  metadata on the setup-required page, the header search form's states (native submit) and
  completeness items owned by B5 to B11, plus a session back-button finding that a manual probe
  does not reproduce. Run it against a zero-variable build. Signed-in admin pages are not reachable
  by the gate; `npm run test:e2e:db` covers them in a browser.
- B4 deferred: `/admin/settings/integrations`, AI drafts (B10), rule collections are evaluated by
  the storefront (B5), delivery area mapping (D12). Media uploads need Cloudinary credentials.
- In a production build, sign-in needs Upstash (limited operations fail closed by design), so
  the signed-in e2e mints its session through the auth service.
- The intermittent WebKit dock-focus failure was a real defect (focus during the dock's slide-in),
  fixed with `.bottom-dock:focus-within`; a deterministic regression test guards it.
- The repository is public although the owner approved private: on GitHub Free a private personal
  repository loses branch protection and secret scanning. Secret scanning and push protection are
  on (verified 2026-10-22). Waiting for the owner's choice.
- `experimental.authInterrupts` is still a proposed decision.

## Waiting on the owner

1. Rotate every credential pasted into the chat; create a least-privilege MongoDB user
   (`readWrite` on `horekbazar_dev`); keep production on a separate cluster (D19).
2. Verify a Resend domain and set `EMAIL_FROM` on it.
3. Set `SETUP_TOKEN`, then create the first Owner at `/admin/setup`.
4. Confirm D23 and the proposals `SETUP_TOKEN` and `secondFactorAt` (DESIGN.md Decision trace).
5. Choose: stay public (keeps protection and secret scanning), go private on Free (loses both),
   go private on Pro (keeps branch protection, still no secret scanning on a user-owned private
   repository), or move to an organisation on Team with Secret Protection (keeps both, paid).
6. Name the canonical Vercel project, give the agent's Vercel token access to `dev-choice`, and
   add the environment variables there per environment.
7. Approve B8 (PR #24) and then B9. For Steadfast: set `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`,
   `COURIER_WEBHOOK_SECRET`, put `https://<site>/api/webhooks/courier/steadfast` with that secret as
   Bearer token in the Steadfast portal (`horekbazar_dev` is already migrated). Rotate the
   development credentials pasted in chat on 2026-10-22 before production; Resend needs a verified
   domain (the key is send-only and `onboarding@resend.dev` reaches only the account owner).
   Approve B5 when ready. D12/D21, D5, D20, D22 and coupon restoration on cancellation remain
   open. Set Cloudinary credentials for uploads and the real delivery fees in /admin/settings/delivery.
8. Sample data: `horekbazar_dev` holds 39/144/235 `sample: true` records. Remove them with
   `npm run db:seed -- --remove-samples --confirm` when no longer wanted; they cannot be published
   outside a `_dev` database. The guard is the database name, so confirm the public preview does not
   use `horekbazar_dev` (recommend `horekbazar_preview`).
9. Owner creation: follow `docs/OWNER-SETUP.md`. The preview Owner form is live: create the Owner soon (then `SETUP_TOKEN` no longer matters) and
   confirm whether `e517154` was requested.
10. Run the gate with a trailing slash (`http://127.0.0.1:3000/`); without it the session check
   reports a false back-button failure (PROGRESS, takeover audit).
11. Banglish copy: answer the decisions in `docs/BANGLISH-PROPOSAL.md` before any rewrite.
