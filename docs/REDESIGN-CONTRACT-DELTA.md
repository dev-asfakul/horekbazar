# HorekBazar redesign: Motomation Checkpoint 2, product contract delta (2026-10-23)

Status: **approved by the owner on 2026-10-23 (Checkpoint 2), with the decisions below.** Nothing here is implemented. The product contract in `DESIGN.md` (approved 2026-10-21) stays authority level 4; this file lists only what the redesign brief changes, per `thinking/sequence.md` ("a concept that needs a contract change goes back to Checkpoint 2 with the change proposed, not applied"). Route: **full** (a distinctive redesign).

## Checkpoint 1 (Stack): answered by the project, stated and skipped

Next.js 16 App Router, React 19, TypeScript, Tailwind 4 + hand-written CSS, next-intl, MongoDB Atlas (official driver), Better Auth, Upstash (rate limiting), Vercel → `adapters/next.md` (approved 2026-10-21). No new dependency is proposed at this checkpoint. Redux Toolkit, Zustand, TanStack Query and Redis caching are evaluated in design research and decided at Checkpoint 4, once the interactions are approved, with `craft/stack.md`'s three checks and the Tier 1 budget (≤ 30 KB gzipped JS beyond the framework, `gates/rules.md`). Open to override.

## Unchanged

Product (single-store, multi-category, COD-first, Bangla-first), audiences, jobs, business model, every route and journey in the Scope table, exclusions (marketplace, guest checkout, online payment, wishlist, fabricated reviews/stock/urgency), success criteria, legal rows, admin (redesign **out of scope**), schemas, server actions, API routes, env names, auth, checkout and pricing rules. Delivery mode: production template.

## Type research for the delta (2026-10-23)

| Site | Type | Observation | Status | Use |
|---|---|---|---|---|
| [Shwapno](https://www.shwapno.com/) | single-store grocery and household chain, BD | Typing Latin `chal` suggests `rupchada chal`, `pran chinigura chal`, `nazirshail chal`…; `sabun` suggests `saban`, `lux saban`, `meril saban` (spelling-tolerant term completions); `তেল` suggests Bangla terms (`৫ লিটার সয়াবিন তেল`); cards carry a pack-size select and "Add to Bag"; a floating cart total "0 items ৳0" | observed (desktop, cloud browser) | evidence that BD shoppers type Latin Banglish and expect term completions and on-card add |
| [Othoba](https://othoba.com/) | general retail, BD | listing facets include "Vendor" (multi-vendor) | observed (search excerpt) | type mismatch: not used as a model |
| [Chaldal](https://chaldal.com/) | single-store grocery, BD | page did not load in the cloud browser (two attempts) | unverified | none |

Prior type research (Chaldal fees, Rokomari stock counts, Shajgoj section types) in `DESIGN.md` stays valid.

## Proposed changes

| # | Kind | Item | Mark | Level | Change and reason |
|---|---|---|---|---|---|
| 1 | function | `/`: product-first home | requested | backend | Home leads with search, category entry and real product rails; no promotional hero, banner or collage. `productRail` renders as a capped horizontal rail (≤ 10, "সব দেখুন") instead of a full grid. See Q1 for the `hero` and `banner` section types |
| 2 | function | listing cards: add to cart | requested | backend | Single-variant products: one tap through the existing `addToCartAction`; the listing query also returns that variant's id (internal read change, no schema or API change). Multi-variant: see Q2. Disabled with the reason when `available` is 0 |
| 3 | function | header and bottom bar: cart count | requested | backend | Count read server-side from the existing cart (cookie owner), updated after cart actions; no count shown when the cart is empty or unreadable |
| 4 | function | search suggestions while typing | requested (in the 2026-10-21 contract, not built) | backend | Term completions, up to 5 matching products (image, name, real price), up to 3 categories; debounced, stale responses dropped. Needs a new **read-only** GET endpoint (Q3); built only after Checkpoint 4 |
| 5 | function | recent searches | optional | persisted | Kept only in this browser (`localStorage`), max 8, clearable, never sent to the server (Q5) |
| 6 | function | Latin (Banglish) and misspelled queries | requested | backend | `chal`, `tel`, `সাবন` must find products. Method decided at Checkpoint 4 (Q4) |
| 7 | function | popular searches | not required for this brief, reason: no search-log data exists; adding one is a new collection (schema). Interface: none until approved | | |
| 8 | function | personalised recommendations | not required for this brief, reason: no behavioural data or approved privacy model. Interface: the existing same-category "more products" on `/p/[slug]` | | |
| 9 | state | footer contact block | required | backend | Only fields the owner filled in settings are shown; when none, the block is hidden. The internal note "সেটআপ শেষ হলে…" is removed from customer copy |
| 10 | state | product without a photo | required | interface | A designed, consistent no-photo tile with the product's name and unit; never an empty box, never an invented image |
| 11 | state | checkout off (`features.checkout`) | required | interface | Add-to-cart stays available; the cart and product page say plainly that online ordering is not open yet (existing honest behaviour kept) |
| 12 | function | `/c/[...slug]` mobile filters in a sheet | requested (already in the contract) | backend | Restores the contract: sort and filter behind one control bar; products visible in the first screen |

## Owner decisions (2026-10-23)

- **Q1: option a.** `hero` renders as one understated text line naming HorekBazar and what it sells; no promotional banner, giant image or collage on the home page. `hero` and `banner` schema types, stored data and admin controls stay; banner support is not removed anywhere.
- **Q2: option a.** Multi-variant cards open the product page and focus or scroll to the variant picker; no on-card size select. Single-variant cards add directly through the existing server action; price and stock are always validated on the server.
- **Q3: approved in principle only.** One public, read-only, rate-limited suggestions endpoint may be proposed at Checkpoint 4 with its route, contract, validation, limits, rate limit, cache keys and freshness, data boundaries, errors, latency, JS and accessibility. Never private customer, session or admin data. Not implementation approval.
- **Q4: deferred to Checkpoint 4.** Compare query-time transliteration and normalisation, a per-product search-terms field, and Atlas Search fuzzy matching against the real catalogue with Bangla, Latin Banglish, spelling variants and typos; measure relevance and latency where possible; recommend the smallest reliable method; schema, infrastructure or dependency changes need approval.
- **Q5: approved.** At most 8 recent searches, browser only, never sent to or stored on the server; deduplicated; clear-history control; no empty queries; works when storage is unavailable; localised and accessible.
- **Also approved as requirements:** rows 1–12 above (product-first home with capped rails and products in the first mobile screen; card add-to-cart within the variant rules; server-derived cart count with no client-only source of truth; accessible Bangla and Latin suggestions with real data only; footer shows configured details only, setup note removed; designed no-photo treatment, never fake photos; honest checkout-off messaging; mobile filter and sort sheet with unchanged semantics and URLs).
- **Exclusions confirmed:** popular searches needing a search log, personalised recommendations, admin redesign, multi-vendor features, guest checkout, online payment, fake reviews, stock, urgency or delivery promises.

## Questions as asked at Checkpoint 2 (answered above)

- **Q1 Home `hero` and `banner` section types** (schema and admin keep both). (a) Recommended: the storefront renders `hero` as a single text line (store name and what it sells, no image, no CTA block) and does not render `banner` on the home page; the data and admin stay as they are. (b) Do not render either. (c) Render both, restyled small.
- **Q2 Multi-variant products on cards.** (a) Recommended: "অপশন বেছে নিন" opens the product page at the variant picker (no new data). (b) An on-card size select like Shwapno's (bigger listing query, more client JS).
- **Q3 Approve in principle** one new read-only, public, rate-limited `GET` suggestions endpoint (no writes, no personal data, cache-safe). Exact path, limits and caching come at Checkpoint 4.
- **Q4 Banglish and typo handling.** (a) Query-time Latin-to-Bangla transliteration plus a normalised term list built from existing names (code only). (b) A per-product search-terms field editable in admin (schema and admin change). (c) Atlas Search with fuzzy matching (infrastructure change). Research and measurements decide; you approve the method at Checkpoint 4.
- **Q5** Recent searches kept only in the browser: yes or no.

## Still needed from the owner

The five-screen mobile reference image (not accessible in this session; not inspected).
