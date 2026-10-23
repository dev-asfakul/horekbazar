# HorekBazar redesign: Motomation Checkpoint 3, research and direction (2026-10-23)

Status: **proposed, awaiting owner approval.** Static proposal only; nothing is built. `DESIGN.md`, `MOTION.md`, `SCHEMA.md`, CSS, components and tests are untouched; the Khata sections of `DESIGN.md` are replaced only after this direction is approved (archive list in `docs/REDESIGN-AUDIT.md` §10). Proposal image: `horekbazar-proposal-01.png` (board, 3000 × 3078 CSS px at 1.5×), built as a static HTML board from live-preview showcase data and rendered in headless Chromium.

Rules : `gates/rules.md` read; designing within it. Skill: Motomation 3.0.2, installed, hash matches `skills-lock.json`.

## Research questions

1. How does a single store with nine unlike departments (rice to earbuds) show its breadth on a phone without banners?
2. What makes typeahead feel instant yet stay accessible, in Bangla and Latin input?
3. How can uneven, partly missing product photos still read as one consistent store?
4. Which Bangla faces give a voice distinct from Khata (Tiro Bangla, Noto Sans Bengali) and still work at UI sizes?
5. How should rails, footer and navigation behave on small screens?

## Research record

| Source | Kind | Observation | Use here | Limitation |
|---|---|---|---|---|
| [Shwapno](https://www.shwapno.com/) | production site, BD single-store chain | Latin `chal` and misspelled `sabun` return term completions; Bangla `তেল` returns Bangla terms; cards carry a pack select and "Add to Bag" (observed 2026-10-23, desktop) | Latin and typo input is a real local expectation; on-card add is a local norm | desktop only; no mobile check |
| [Baymard: autocomplete design](https://baymard.com/research-articles/autocomplete-design) | research | ≤ 10 suggestions on desktop, 4–8 on mobile; style category scopes differently from queries; highlight the suggested text | 4 terms + 4 products on mobile; category row styled as a scope with a "ক্যাটাগরি" label | public summary only |
| [Baymard: misspellings](https://baymard.com/research-articles/offer-autocomplete-suggestions-for-misspellings) | research | nearly all test users relied on autocomplete; 69 % of benchmarked sites miss misspelled queries; map misspellings to correct terms | Q4 must cover typos, not only transliteration | summary only |
| [Baymard: mobile search and navigation](https://baymard.com/research-articles/mobile-ecommerce-search-and-navigation) | research | 72 % of mobile sites lack category scope suggestions; scoped users find products more often | a category scope row in suggestions | summary only |
| [Baymard: persisted queries](https://baymard.com/research-articles/persist-search-queries) | research | the clear "X" needs a large tap target and space from the query | 44 px clear button with spacing | summary only |
| [Baymard: homepage carousels](https://baymard.com/research-articles/homepage-carousel) | research | carousels must not be the only route to content; manual controls | rails never autorotate, always end in "সব দেখুন", and every rail item is reachable from its listing | about promo carousels; applied by analogy |
| [Baymard: product lists](https://baymard.com/research-articles/current-state-product-list-and-filtering) | research | give users 3+ subcategory thumbnails to navigate without leaving the list | department index uses real thumbnails | summary only |
| [W3C APG combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) | standard | list autocomplete with manual selection: suggestions appear, none is auto-selected | combobox + listbox, `aria-activedescendant`, Enter only acts on an explicit choice | pattern, not a design |
| [Bangla interface typography](https://maniruzzamanjubayer.com/blog/bangla-interface-typography) | article | 11 Bengali families on Google Fonts, all OFL; Hind Siliguri has five weights; conjunct coverage matters | Hind Siliguri for text (OFL, five static weights) | single author |
| [Blinkit teardown](https://assets.nextleap.app/submissions/Blinkit_Product_Teardown-623b752e-4a00-4d97-83e5-9b1f1f6b42bc.pdf) | case study | header with cart count and example-led placeholder ("Search for atta, eggs, milk…") | supports the existing example placeholder and a header cart count | student teardown |
| [Chaldal](https://chaldal.com/) | production site | did not load in the cloud browser (two tries) | none | unverified |

Research changed: suggestions capped at 4 + 4 on mobile (was "up to 5 products, 3 categories"); a category scope row styled apart; rails never autorotate; typo handling added to Q4's test set.

## Tension

A small store selling nine unlike departments with uneven, partly missing photos, against the need to look like one trustworthy, distinctive store rather than a marketplace.

## Directions

| | A · Shelf label | B · The counter | C · Directory board |
|---|---|---|---|
| Idea | every product wears the same shop hang-tag; photos sit on one tray | search is the front door; instant answers like asking a shopkeeper | a typographic index of departments like a bazaar signboard |
| Contract fit | strong for listings, PDP, no-photo state | strong for search, suggestions, recent searches | strong for category entry; weak for listings |
| Usability | high; price always in the same place | high for intent shoppers; browsers need more | good for browsing; extra tap before products |
| Distinction | high (signature tag) | medium alone | high but editorial, risks HOUSE STYLE on a SERVICE product |
| Performance | CSS only | needs the suggestions endpoint and a small client island | CSS only |

**Synthesis:** A + B, with C's department index reduced to a compact 3 × 3 grid with real counts and thumbnails. **Concept:** "Ask at the counter, read the shelf label": finding is instant, and every price wears the same honest tag.

## Decisions

```
Structure   : per route family, from the contract; no archetype
Tools       : category recipe (ecommerce) adapted: no hero, no promo; collide/mutation not used (concept came from the tension)
Signature   : the hang-tag price label (ink tag with punch hole), on every card, suggestion and product page
Dials       : ENERGY 2 · RHYTHM 1 · MOTION 1 → Tier 1 everywhere
Type mode   : SERVICE STYLE on all shopping routes; display voice only in the wordmark, headings and no-photo tiles
Type        : Anek Bangla (wdth 78–88, 700–800) display / Hind Siliguri 400–700 text and figures
Palette     : "Beet and chalk": chalk #F4F5F2, tray #E8EAE5, ink #17191C, muted #565C63, beet #8C1C3E (only accent), tint #F5E8EC; success #1E6B45, error #C0262D
Heuristics  : one accent kept; minimal nav adapted (5-item bottom bar kept from the contract)
Not doing   : the banner home, a coloured department code per category, a floating running-total bar (Khata's signature), autorotating rails, glass or shadows, an animation library
```

Contrast (skill `scripts/contrast.mjs`): ink on chalk 16.09:1, muted on chalk 6.17:1, muted on tray 5.57:1, beet on chalk 8.16:1, white on beet 8.93:1, beet on tint 7.50:1, borders #878D85 3.39:1 (UI ≥ 3:1).

Divergence from the retired Khata direction: cool chalk ground (not warm paper), Anek + Hind (not Tiro + Noto), beet accent (not blue ink), tray + tag cards (not ruled ledger rows), hang-tag signature (not a running-total bar). The skill's user-level memory log is empty in this sandbox, so the comparison is with `DESIGN.md`.

## Responsive strategy

375: one column, sticky search row only (CSS), 2-column grid, rails at about 2.4 cards, bottom bar kept. 768: 3-column grid, rails at about 4 cards, filters still in the sheet. 1440: header with category menu, wide search with a two-column dropdown, cart count in the header, persistent filter sidebar, 5-column grid, 9 departments in one row. Each width is checked separately at Checkpoint 5.

## Component and route impact (detail at Checkpoint 4)

Restyled or replaced: `SiteHeader`, `BottomNav`/`BottomDock` (cart count), `SiteFooter`, `ProductGrid` (card, tag, no-photo tile, add action), `ListingView` (control bar + sheet; same GET form), home page (department index, rails), product page (gallery tray, variant focus). New: search sheet / combobox island, toast with live region. Read changes: cart count in the layout; a variant id on single-variant listing items. Contracts, schemas, actions and URLs unchanged.

## Accessibility, SEO, performance

- Combobox per APG; sheets are dialogs with focus moved in and back, inert background; 44 px targets; sticky search never covers a focused control (`scroll-padding-top`); live regions for add-to-cart and suggestion counts; reduced motion keeps every message.
- SEO unchanged by design: listings and products stay server-rendered and crawlable; the search sheet and suggestions are not indexable; `/search` stays `noindex, follow`; filter URLs keep today's rules (checked at Checkpoint 4).
- Performance: Tier 1, no animation library; the client JS added (search island, sheet, add button) must fit the ≤ 30 KB gzip Tier 1 allowance; fonts must stay subset (Anek limited to the needed width and weight range, Hind 3 weights), with the size measured before approval; the product-page LCP image gets a priority hint. Baseline: `docs/REDESIGN-AUDIT.md` §5.

## Unverified or open

- The five-screen reference image was **not available**; it has not been inspected or used. The proposal must be checked against it before final approval.
- Hind Siliguri's tabular figures and Anek's variable-font size after subsetting are unmeasured.
- Latin and typo search results in the image are the target behaviour; today `chal` returns 0 (Q4, Checkpoint 4).
- Proposed copy (dashed in the image): the home line "চাল-ডাল থেকে চার্জার, সংসারের হরেক জিনিস এক দোকানে।", "সাম্প্রতিক সার্চ", "সব মুছুন", "এই তালিকা শুধু আপনার ফোনের ব্রাউজারে থাকে।", "বিভাগ থেকে খুঁজুন", "শব্দ", "ফিল্টার ও সর্ট", "ফল দেখুন", "“…”-এর সব ফল দেখুন", footer headings "কেনাকাটা", "সাহায্য" and link labels, and the no-photo label "ছবি নেই".
- Catalogue is showcase data: prices unapproved, photos illustrative.

---

# Proposal 02 (2026-10-23): rejected Proposal 01 replaced

Owner feedback on Proposal 01: "rejected. its is the same exectly what it is now." Instructions: no old design concepts, no old colour palette; follow Motomation's sequence; research online for mobile-first, modern, award-grade design. Reference image (five screens: teal app bar, orange actions, icon categories, accordion categories, cart, checkout stepper, COD + bKash/Nagad) inspected and used for its app-like energy only.

Excluded from every direction: Khata (paper #FAF7F0, blue #1E4E9C, ledger rows, running-total bar), Proposal 01 (chalk #F4F5F2, beet #8C1C3E, hang-tag, Anek Bangla + Hind Siliguri), and from the reference: the "Up to 50% Off" banner, star ratings, the wishlist tab, bKash/Nagad.

## Research questions (Proposal 02)

1. What makes current award-level commerce feel modern on a phone, and what do award juries measure on mobile?
2. How do the best grocery stores keep a large catalogue scannable on a phone without banners?
3. Where do thumbs actually reach and tap?
4. Which Bangla typefaces are new to this project, licence-safe and correct for conjuncts?

## Research record (Proposal 02, accessed 2026-10-23)

| Source | Kind | Observation | Intended use | Limitation |
|---|---|---|---|---|
| [Google Design: expressive Material research](https://design.google/library/expressive-material-design-google-research) | research | 46 studies, 18,000+ participants; colour, shape, size and containment let users spot key UI up to 4× faster and removed the age gap; warns that breaking basic patterns hurts usability and a minority prefer calmer UI | Direction 1: large containers, shape identity, oversized primary action; keep standard patterns | Google's own research on Google apps |
| [Oda](https://oda.com/no/categories/) | production (observed at 390 px) | products as list rows: photo, name, pack info, bold price + unit price, square "+" on the right; display serif headings with clean sans; sub-category select with count | Direction 2: rows instead of grid, fixed add position, serif department titles | Norwegian grocer; desktop/app not checked |
| [Weee!](https://www.weee.com/en) | production (observed at 390 px) | urgency countdown, sign-up modal, discount stickers; 3-column grid with round "+" on photos; aisle tabs | counter-example: everything banned here; aisle-tab idea used in Direction 3 | popup blocked most of the page |
| [Proteinbolaget](https://proteinbolaget.se/) | production, CSSDA e-commerce kudos Sept 2026 (observed) | full-screen promo carousel, campaign banners | counter-example for "award-level = banners" | only home observed |
| [Awwwards Mobile Excellence guidelines](https://www.awwwards.com/mobile-excellence-guidelines.pdf) | award criteria | key CTAs visible, visible and user-friendly search, swipe/enlarge product images, streamlined forms, tap target size, legible fonts, contrast, fast on 3G | checklist for all three directions; becomes part of Checkpoint 5 review | 2018-era checklist |
| [Hoober, Design for Fingers, Touch, and People](https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php) | field research, 1,300+ observations | 75 % touch with one thumb, fewer than half hold one-handed, people shift grip constantly, prefer the centre | Direction 3 bottom search bar; Direction 1 floating filter toolbar; nothing critical only at the top | 2013–2017 data |
| [Google Fonts metadata](https://fonts.google.com/) | foundation | Bengali families: Alkatra, Anek Bangla, Atma, Baloo Da 2, Galada, Google Sans (added 2025-12-09), Hind Siliguri, Mina, Noto Sans/Serif Bengali, Tiro Bangla | new faces: Google Sans, Alkatra, Noto Serif Bengali; conjuncts (ক্ষ ষ্ট্র ন্দ্র স্ক্র) rendered and checked in Chromium | subset file sizes not yet measured |
| [Li Ador Noirrit licence (Lipighor)](https://lipighor.com/AdorNoirrit.html) | licence | free use but no redistribution of font files | rejected: self-hosting a webfont is redistribution | — |
| Chaldal, Zepto | production | did not load in the cloud browser | none | unverified |

Research changed: list rows (Oda) became Direction 2's structure; Material 3 Expressive research justified a bold, oversized-action direction (Direction 1) and its caveat produced the calm alternative; Hoober moved search to the bottom in Direction 3; the font search found Google Sans with Bangla, which none of the earlier designs used.

## Three directions (shown as Proposal 02, one board each)

| | 1 · আকারের বাজার (Shape Market) | 2 · ইট-লাল তালিকা (Brick List) | 3 · রাতের বাজার (Night Bazaar) |
|---|---|---|---|
| Idea | each department has its own shape; big soft containers; "+" grows into a stepper | calm editorial grocer; numbered serif department index; products as rows | dark store, photos glow on white plates; search at the bottom of the screen |
| Structure | 3 × 3 department shapes on home; floating filter/sort toolbar | typographic index; 2-column sub-category table; row listings | aisle chips; bottom "ask" bar opening a sheet; 4-tab bar |
| Type | Google Sans only | Noto Serif Bengali + Google Sans | Alkatra + Google Sans |
| Palette | jamun #5B2A86, lavender #E9DDF7, pink #FFD3E2, ground #F4F0FA, ink #1C1530 (white on jamun 9.90:1) | brick #A8361F, tint #FBE3D9, ink #16181D, white (white on brick 6.53:1) | ground #0E1311, surfaces #1A211E/#242C28, lime #C6F432 (ink on lime 14.63:1), text #F2F4EF |
| Signature | department shapes + "+" → stepper morph | none; identity from the serif index and ruled rows | bottom search bar rising into a sheet |
| Risk | playful; must not hide labels | may feel less app-like | dark grocery is rare; light mode would be a second design |

Heuristic adapted: accent footprint ≤ 5 % (`principles/color.md`) is exceeded in Direction 1 and 3 by design, because the owner asked for a bold, app-like store and the expressive research ties larger, coloured primary actions to faster recognition. Memory: no prior log (`~/.motomation/log.json`), first build.

New proposed copy in Proposal 02 (needs approval): "৯টি বিভাগ", "নতুন এসেছে", "যা খুঁজছেন, এক তালিকায়", "আরও ৩টি বিভাগ", "অন্য বিভাগ", "সব বিভাগ", "৯টি বিভাগে ১৪৪টি প্রোডাক্ট", "চাল, তেল, সাবান… খুঁজুন", "সব দেখুন", "ছবি নেই", and checkout placeholders "নমুনা: আপনার নাম", "বাসা, রাস্তা, এলাকা".

Status: awaiting the owner's choice of 1, 2, 3 or a mix. Nothing built.

---

# Proposal 03 (2026-10-23): Night Bazaar, light

Owner chose Direction 3 (Night Bazaar) with changes: search moves to the top-left of the header; the user button is removed from the header; under the header a carousel of latest deals and other content, then categories, then the rest as before; a light palette; Bangla written with everyday loanwords, not literal translations ("categories = ক্যাটাগরি", not "বিভাগ").

## Decisions changed (need the owner's confirmation at approval)

- **Q1 reversed:** Checkpoint 2 chose "one text line, no banners on home". The owner now asks for a home carousel. Kept compact (176 px slides, product-first), never auto-rotating, slides peek, no dots for a single slide, nothing reachable only through it ([Baymard homepage carousel research](https://baymard.com/research-articles/homepage-carousel)).
- Header: search pill left, Alkatra wordmark right, no account button; Account stays in the tab bar (হোম · ক্যাটাগরি · কার্ট · অ্যাকাউন্ট). The Proposal 02 bottom search bar is dropped.

## Carousel data, no schema change

- Active promotions (`lib/modules/pricing/schema.ts`: kind `product`/`flash_sale`, `startsAt`/`endsAt`), showing the real old/new price from the pricing engine and the real end date (no ticking timer).
- Newest products (existing "নতুন" sort).
- Admin banners (`lib/modules/merch/schema.ts`, `BANNER_PLACEMENTS` `home_top`/`home_mid`/`category_top`, published + visibility window).
- Delivery/COD facts from settings; product rows below from collections/homeSections.
- The preview has no active promotion today, so the board's deal slide (মসুর ডাল ৳১৪৪ / ৳১৬০, মুগ ডাল ৳৮১ / ৳৯০, "অফার শেষ ৩১ অক্টোবর") is marked example-only.

## Copy changes (proposed, replace messages/bn.json strings at build)

| Old | Proposed |
|---|---|
| বিভাগ | ক্যাটাগরি |
| সাম্প্রতিক সার্চ | সার্চ হিস্টরি |
| প্রোডাক্টের দাম · সর্বমোট | সাবটোটাল · টোটাল |
| ডেলিভারি এলাকা | ডেলিভারি এরিয়া |
| স্টক নেই | স্টক আউট |
| অর্ডার দিন | অর্ডার কনফার্ম করুন |
| শব্দ | সাজেশন |

Other new strings: "চাল, তেল, সাবান সার্চ করুন", "লেটেস্ট ডিল", "সব ক্যাটাগরি", "৯টি ক্যাটাগরিতে ১৪৪টি প্রোডাক্ট", "সর্ট: নতুন", "বাসা, রোড, এরিয়া". Category names are store data (admin), not UI copy.

## Palette (contrast via the skill's script)

Ground #F6F9EF, cards #FFFFFF, tint #E9F0DA, lime #C6F432 (ink on lime 13.88:1), ink #121A0F (16.70:1 on ground), muted #56604F (6.19:1), link green #3B6300 (6.63:1). Type: Alkatra 600–700 + Google Sans.

Status: awaiting owner approval (Checkpoint 3). Nothing built.
