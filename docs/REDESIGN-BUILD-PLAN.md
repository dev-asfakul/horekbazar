# HorekBazar redesign: Checkpoint 4 build plan

Motomation v3.0.2, full route, Checkpoint 4 of 6. Status: **for owner approval. Nothing is built.**
Approved so far: Checkpoint 2 contract (REDESIGN-CONTRACT-DELTA.md), Checkpoint 3 direction
(Proposal 03, Night Bazaar light, approved 2026-10-23). Added by the owner since: time-of-day themes
(Proposal 04) and banner placements (Proposal 04b). Goal stated by the owner: the result is a
reusable store **template**, so the delivery mode is `production template`.

```
MOTOMATION PLAN (Checkpoint 4)
Rules       : gates/rules.md read; designing within it
Stack       : Next.js 16.4.2 App Router, React 19.3.1, Tailwind 4, next-intl, MongoDB (from the project) → adapters/next.md
Scope       : storefront routes only (home, categories, category listing, collections, new, deals, search, product, cart, checkout, account shell, info pages); admin out of scope
Delivery    : production template · branch feat/redesign-night-bazaar from main · temporary preview, never main
Dials       : ENERGY 2 · RHYTHM 2 · MOTION 1 → Tier 1 everywhere (task surfaces)
Type        : Alkatra 600–700 (wordmark, headings) / Google Sans 400–700 (text, prices)
Palette     : five time-of-day themes on one token set; lime #C6F432 action colour (#9FC92A at midnight)
Not doing   : GSAP, Lenis, Motion, Redux, Zustand, TanStack Query, Atlas Search index, any schema change
```

## 1. What the real data says (read-only check, development database, 2026-10-23)

- 144 published products, 9 top-level categories plus 30 sub-categories, 5 published collections.
- 8 published home sections in this order: hero, categoryTiles, 5 × productRail, collectionGrid.
- **1 published banner**, placement `home_top`, window 23–27 Oct. It is a 2160 × 2700 portrait
  test image, and its link `/c/rice` returns **404** (the category is `/c/rice-and-flour`). No home
  section references it, so today it never appears.
- 0 promotions, 0 coupons, 0 variants with a compare-at price, so the deal slide and `/deals` are
  empty today.
- Settings: `theme.fontPreset = "khata"`, `theme.accent = "#1E4E9C"` (see question 4).

## 2. Route by route (mobile first, 375 px; 768 and 1440 follow)

### Shell (every storefront page)
| Part | Section order / behaviour | Component |
|---|---|---|
| Header | search field on the left (flex), wordmark on the right; sticky; from 768 px adds cart and account links on the right (no bottom bar there) | **Adapt** `SiteHeader.tsx`: account link removed below 768 px; the language switch moves to the footer and the account page |
| Search | the header field is a combobox: suggestions open under it in place (terms, one or two categories, up to 4 products with add/option buttons, search history) | **Build** `SearchCombobox` (client), W3C APG combobox pattern; plain GET form to `/search` still works without JavaScript |
| Bottom bar | 4 tabs: হোম · ক্যাটাগরি · কার্ট · অ্যাকাউন্ট, cart count badge; below 768 px only | **Adapt** `BottomNav.tsx` (search tab removed) |
| Footer | existing verified links only; adds the theme choice and language switch | **Adapt** `SiteFooter.tsx` |

### Home `/`
1. Header (search + wordmark).
2. **Carousel**: slides in this order, each only if real: published `home_top` banners → the
   admin hero section (as a text slide: title, subtitle, button) → লেটেস্ট ডিল (products with a
   real compare-at price, up to 3, link `/deals`) → নতুন এসেছে (3 newest, link `/new`) → delivery facts
   from settings (Dhaka ৳60 · 1–2 days, outside ৳120 · 3–5 days, cash on delivery). No real
   slides at all: the carousel is not rendered. **Build** `HomeCarousel`: CSS scroll-snap,
   slides peek, previous/next buttons for keyboard and mouse, "১/৪" counter, no dots for one
   slide, no auto-rotation, `aria-roledescription="carousel"`.
3. ক্যাটাগরি: 2-column tiles with photo and count (the admin `categoryTiles` section, or every
   top-level category when there is none). **Adapt** the existing `CategoryTiles`.
4. The remaining home sections in admin order (product rails, collection grid, rich text). After
   the second product rail: one published `home_mid` banner. **Adapt** `ProductGrid` into a
   horizontal rail with the new card; **Build** `PlacementBanner`.

### Categories `/categories` and listing `/c/[...slug]`, `/collections/[slug]`, `/new`, `/deals`, `/search`
- `/categories`: big heading, "৯টি ক্যাটাগরিতে ১৪৪টি প্রোডাক্ট", one row per category with photo
  and count.
- Listing: back + title, sub-category chips (horizontal scroll), a `category_top` banner on
  category pages only, filter and sort buttons with result count, 2-column grid, pager.
  **Adapt** `ListingView.tsx`, `StorePager.tsx`.
- Product card (**Adapt** `ProductGrid` card): photo on a white plate, price ("থেকে" for
  multi-variant), name (2 lines). Single variant in stock: lime "+" adds through the existing
  cart server action and turns into a − n + stepper. Multi-variant: "n অপশন" goes to the
  product page focused on the picker. Out of stock: "স্টক আউট", disabled. Approved at Checkpoint 2.

### Product `/p/[slug]`
Photo (swipe if more than one) → breadcrumb → name in Alkatra → stock line → variant chips →
delivery charges from settings → sticky lime "কার্টে যোগ করুন · ৳price" above the bottom bar.
Description and attributes below. No ratings shown (none exist).

### Cart `/cart` and checkout `/checkout`
Visual change only, same server actions, pricing quote and checkout flow: line cards with
steppers, ডেলিভারি এরিয়া select, সাবটোটাল / ডেলিভারি চার্জ / টোটাল from the server quote, sticky
"চেকআউট". Checkout: address card, cash on delivery card, total, "অর্ডার কনফার্ম করুন". Checkout
stays switched off as today unless you turn it on in admin.

### Account, auth and info pages
Restyled with the new tokens and type only; structure unchanged. Admin keeps its own look.

## 3. Time-of-day themes (Proposal 04)
- Five themes on one set of CSS custom properties (`html[data-theme]`): সকাল 05:00–10:59,
  দুপুর 11:00–16:59, সন্ধ্যা 17:00–19:59, রাত 20:00–23:59, মাঝরাত 00:00–04:59, by the phone's own clock.
- A small inline script with the existing per-request CSP nonce sets the theme in `<head>` before
  first paint (no wrong-colour flash); the server never guesses the time, so cached pages stay
  correct. While a page is open, one timer switches at the next boundary.
- `meta theme-color` follows the theme. A 400 ms colour fade on switch; instant under reduced motion.
- Shopper control (pending your answer): থিম · অটো (সময় অনুযায়ী) / লাইট / ডার্ক, saved on the phone.
- Every theme's text pairs pass 4.5:1 (checked with the skill's contrast script; values on the
  Proposal 04 board). Product photos stay on white plates; at midnight photos are dimmed 14%.

## 4. Banners (Proposal 04b)
- New read function `listPublishedBanners(db, placement, now)` next to `getPublishedBanner` in
  `lib/modules/storefront/catalogue.ts`: published, inside the visibility window, newest first. The
  index `placement_status` already exists. **No schema change.**
- Slots and crops (Cloudinary `c_fill,g_auto`, WebP/AVIF): `home_top` carousel slide 1280 × 704;
  `home_mid` 1280 × 560, one; `category_top` 1280 × 400, on category pages.
- A banner link is rendered only if it resolves (a category path in the tree, a published product
  or collection, or a known static route); otherwise the banner shows without a link. Today's
  `/c/rice` banner would show unlinked until it is fixed in admin.
- The first carousel image loads with `fetchpriority="high"` only if it is the first slide; others are lazy.
- The existing `banner` and `hero` home section types keep working.

## 5. Search: method chosen with measurement (Checkpoint 2, Q4)

**Test:** 60 queries I wrote against the real 144-product catalogue (`catalogue/horekbazar/products.json`,
same products as the database): 15 Bangla, 10 English, 25 Banglish, 10 typos, each with its
expected products. Methods were simulated in Python over the same fields; this is not a log of real
shoppers, and timing was not measured.

| Method | Top-3 hit | Bangla | English | Banglish | Typos | Empty results |
|---|---|---|---|---|---|---|
| Current (text index, then word-prefix regex) | 33/60 | 15/15 | 10/10 | 6/25 | 2/10 | 27 |
| Transliteration + phonetic folding + bounded typo distance | **57/60** | 14/15 | 10/10 | 23/25 | 10/10 | 0 |
| Atlas Search–style fuzzy (edits ≤ 2, no transliteration) | 36/60 | 13/15 | 8/10 | 6/25 | 9/10 | 10 |

Misses of the chosen method: গুড় (a Unicode spelling variant), chata, ghori (part of the compound
দেয়ালঘড়ি). A per-product search-terms field was not tested: it needs a schema change and
hand-written terms for 144 products.

**Recommendation:** the transliteration method, as a small server-side module
(`lib/modules/storefront/search-index.ts`): Bangla names romanised, both sides folded (ch/chh, sh/s,
aa/a, o/a, doubled letters…), prefix match, edit distance 1 (2 for words of 7+ letters), with the
category names indexed too. Built in memory from published products and rebuilt when the
catalogue changes (or every 60 s). It runs **after** the current text and prefix search finds
nothing, so today's correct results never change; it also powers suggestions. The 60 queries
become a unit-test fixture, so the hit rate is checked in CI.

## 6. Suggestions endpoint (approved in principle, Q3; full spec)
- `GET /api/search/suggest?q=` (new route): `q` normalised, 1–80 characters.
- Returns public data only: up to 3 terms, 2 categories (name, link) and 4 products (slug, name,
  price from, image, variant count, in stock). Nothing about customers, sessions or admin.
- Headers: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`; rate limit 30
  requests per 10 s per IP with the existing Upstash limiter; 429 is handled quietly in the UI.
- Client: 150 ms debounce, `AbortController` plus a request counter so a late answer never
  replaces a newer one, the APG combobox keyboard model (↑ ↓ Enter Esc), and results announced
  through a polite live region.
- Search history: up to 8 entries, browser only (`localStorage`), no duplicates, empty queries
  never saved, "সব মুছুন" to clear and × per entry. If storage is unavailable, no history.
- This is a suggestion list, not a recommendation system; nothing is personalised.

## 7. State and data
- Server components with the existing server actions stay the source of truth; the cart count
  comes from the server after each action.
- **No Redux Toolkit, no Zustand:** the only client state is the combobox, carousel position,
  theme and search history, all local to their component.
- **No TanStack Query:** one fetch with abort and a counter covers suggestions.
- **Upstash Redis:** already used for rate limiting and reused for the new endpoint; no Redis
  cache, since the search index is in memory and the response is cached publicly by the CDN.
  Credentials stay server-side.

## 8. Motion (MOTION.md replaces the current one at build)
| Element | Behaviour | Purpose | Duration / ease | Reduced motion |
|---|---|---|---|---|
| Buttons, tiles, cards | press scale 0.97 | feedback | 120 ms ease-out | colour change only |
| "+" → stepper | width grows, digits fade in | add confirmed in place | 180 ms ease-out | instant |
| Cart badge | number bumps once | add confirmed | 200 ms | instant |
| Search suggestions | panel fades and slides 8 px | where results came from | 160 ms | instant |
| Carousel | native scroll-snap; buttons scroll by one slide | navigation | browser smooth scroll | instant jump |
| Theme switch | colour cross-fade | avoid a jarring change | 400 ms | instant |
| Page changes | none (native navigation) | never delay a task | — | — |

Tier 1 only (CSS transitions and keyframes). No scroll hijacking, no looping animation, nothing
blocks search, the cart or checkout.

## 9. Copy (approved list, replacing strings in messages/bn.json)
বিভাগ → ক্যাটাগরি · সাম্প্রতিক সার্চ → সার্চ হিস্টরি · প্রোডাক্টের দাম → সাবটোটাল · সর্বমোট → টোটাল ·
ডেলিভারি এলাকা → ডেলিভারি এরিয়া · স্টক নেই → স্টক আউট · অর্ডার দিন → অর্ডার কনফার্ম করুন · শব্দ → সাজেশন.
New strings: carousel, banner, theme, search and empty states, all in the same everyday style
(for example "চাল, তেল, সাবান সার্চ করুন", "লেটেস্ট ডিল", "সব ক্যাটাগরি", "থিম", "অটো"). Error messages
that say এলাকা inside a sentence change to এরিয়া too. English (`en.json`) gets matching keys. The
unapproved Banglish proposal (docs/BANGLISH-PROPOSAL.md) is superseded by this decision.

## 10. Fonts and performance
- Alkatra and Google Sans through `next/font` (self-hosted at build, no request to Google at run
  time), Bengali + Latin subsets, `display: swap`; one display weight preloaded. If `next/font`
  does not list Google Sans yet, the OFL files go into `next/font/local`.
- Budgets to measure on the preview against today's baseline (measured before the build starts):
  LCP, CLS, INP, JavaScript per route. No claim of improvement without both numbers.

## 11. Files expected to change
`app/globals.css` (tokens, themes), `app/[locale]/layout.tsx` (fonts, theme script, theme-color),
`app/[locale]/(home)/page.tsx`, `categories`, `c/[...slug]`, `p/[slug]`, `cart`, `checkout` pages
(markup and classes only), `components/shell/*`, `components/store/*`, `components/commerce/*`,
new `components/store/{HomeCarousel,PlacementBanner,SearchCombobox}.tsx`,
`lib/modules/storefront/{catalogue.ts,search-index.ts}`, new `app/api/search/suggest/route.ts`,
`messages/{bn,en}.json`, `DESIGN.md`, `MOTION.md`, `MEDIA.md`, `README.md`, `CHANGELOG.md`, tests.
Not touched: schemas, auth, checkout and order logic, pricing, inventory, cart actions, payments,
admin, the Khata preset enum and its database values.

## 12. Tests and gate
- Existing CI unchanged and passing: lint, typecheck, unit, integration, e2e, bundle secret check.
- New: unit tests for folding/transliteration (the 60-query fixture), the suggest route (limits,
  public fields only, rate limit), banner window and link checks; Playwright journeys at 375 /
  768 / 1440 with the clock set to each of the five themes and with reduced motion.
- Checkpoint 5: preview link and screenshots of every core journey. Checkpoint 6: the Motomation
  delivery gate and critique on the approved design.

## Questions for approval
1. Themes: fixed clock times as shown, or sunrise and sunset for Dhaka?
2. If a phone is set to dark mode, should that override the time?
3. Keep the shopper's theme choice (অটো / লাইট / ডার্ক), or time only?
4. The admin "accent colour" setting (#1E4E9C today): ignore it in the new design (lime is fixed),
   or let it replace lime?
5. May I push the branch `feat/redesign-night-bazaar` and open a **draft** PR so Vercel builds a
   preview? Main is never touched; PR #40 stays unmerged.

---

## 13. Addition (2026-10-23): notification bell, notifications page, automatic push

Owner request: a notification bell and notifications page, with browser push about new products,
deals, banners and whatever admin does to a product. Mockup: Proposal 04c.

### What already exists (B9 part 2)
- Browser push with VAPID, the `pushSubscriptions` collection, two topics per browser: **orders**
  and **marketing** ("অফার ও খবর", off unless ticked; consent time recorded; domain-rules §1).
- Order-status pushes to the customer (`enqueueOrderPush`).
- Admin campaigns (`/admin/notifications`): title, text, link, sent to marketing opt-ins through
  the outbox; delivery counted from outbox rows.
- Opt-in only on `/account/notifications`, **signed-in customers only**.
- The outbox drain runs when cron-job.org calls `/api/jobs/drain` (docs/JOBS.md); **not yet
  scheduled**, so queued pushes wait until the owner sets that up.

### What is missing, and the plan
| Piece | Plan | Touches |
|---|---|---|
| Bell | header icon between search and logo, unseen count (max "৯+"), link to `/notifications`; from 768 px beside cart and account | design (this build) |
| Notifications page `/notifications` | public page, newest first, grouped আজ / এই সপ্তাহে / আগে; store news for everyone, order updates only for the signed-in customer; opt-in card before any permission prompt; "সব পড়া হয়েছে" | new page (design) |
| Feed | **derived from existing data, no new collection**: products by `publishedAt`, deals (variants with compare-at above price; started promotions), banners entering their window, sent campaigns, last 30 days; order updates from the customer's own `orderEvents` | read-only queries |
| Feed endpoint | `GET /api/notifications/feed`: public store items only, CDN cache 60 s, rate limited; unseen count worked out in the browser from a "last seen" time in `localStorage` | **new API route** |
| Guest opt-in | let visitors who are not signed in turn on store-news push; a later sign-in links the browser to the account | **changes the push action and the `consentSource` enum (adds "notifications_page")** |
| Automatic push | a "notifier" step at the start of each drain finds new events from the last 24 h and queues one push per opted-in browser per event. The idempotency key `auto:<event>:<id>:<subscription>` makes each event send once. New products are combined into one message per 6-hour window. At most 3 automatic pushes per browser per day; none 22:00–08:00 Dhaka, those wait for the morning | **background job change** |
| Admin control | per-type on/off switches (new products, deals, banners) | **settings schema change**; or defer and keep all on |

Every message comes from a real admin action and links to a real page (banner links are
checked as in section 4). No urgency wording, no invented counts.

### Questions for this addition
6. Approve the new feed API route, the guest opt-in change and the notifier step in the drain?
7. Admin on/off switches per type now (settings schema change), or later with all types on?
8. Cap of 3 automatic pushes a day and quiet hours 22:00–08:00: keep, or change?
