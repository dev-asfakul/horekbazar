# Progress log

Newest first. Each entry: date, phase, done, decided, open, next.

## 2026-10-21 — Checkpoint 3 amended after owner review ("Khata" accepted in principle; not yet approved)

- **Owner decision:** the "Khata" direction is accepted in principle; **Checkpoint 3 is not approved**. Six amendments requested; the product contract is not to be changed to fit the design.
- **Done:**
  1. **Mobile navigation.** The contract's five-item bottom bar (Home, Categories, Search, Cart, Account) is restored in `DESIGN.md` → Layout and Components.
     - The RunningTotalBar now sits above the bottom bar inside one `BottomDock`, which shows at most one context strip, by priority: PDP sticky add-to-cart > checkout summary strip > RunningTotalBar.
     - The dock applies the `env(safe-area-inset-bottom)` safe area, publishes its height as `--dock-h`, and drives `main` bottom padding and `scroll-padding-bottom`, so focus is not hidden (WCAG 2.2 SC 2.4.11, technique C43 / failure F110).
     - The dock hides while a text field is focused. The place-order button is repeated in the normal page flow.
     - All of this is proposed; it was written to fit the contract, which is unchanged.
  2. **Category depth.** Sources checked:
     - The approved product contract says "category tree up to 3 levels".
     - `docs/domain-rules.md` has **no** depth rule (not changed).
     - The generated taxonomy uses 2 levels.
     - `SCHEMA.md` v0, `catalogue/horekbazar/TAXONOMY.md`, `CATALOGUE-SCHEMA.md` and the catalogue checker all said "maximum 2". SCHEMA v0 also cited domain-rules §2 incorrectly.
     - **Resolution: maximum 3 levels everywhere; source: the approved product contract.**
     - The checker now walks the parent chain, rejects depth > 3 and detects parent cycles. The catalogue data is unchanged.
  3. **Other contract mismatches found and fixed** (contract unchanged; the design was realigned):
     - Listings are now 2 columns at 375 px, 3 at 768 px and 4–5 at 1440 px, as a ruled khata grid (v0 had single-column rows).
     - Persistent header search with the category entry beside it.
     - Mega-menu and persistent filter sidebar at 1440 px.
     - Admin uses cards on a phone and full tables from 1024 px.
  4. **Khata direction preserved:** ruled entries and rows, LabelTile, the Bangla type research, contrast, QuantityStepper, full-cost visibility and RunningTotalBar are all kept. No research restarted, no decoration added.
  5. **New `DESIGN.md` → Verification status section:** results are split into **measured**, **hypotheses** and **build checks**. The build checks cover conjuncts, mixed script, fallback-font CLS, keyboard, screen readers, 375 px usability, safe area, reduced motion, performance budgets and rendered contrast. None has been run.
  6. `SCHEMA.md` is now v0.1 (depth, removed `display` field, `#site-header` and `#bottom-dock` global sections, dock states). `DATA.md` and `README.md` updated to agree.
- **Validation run:**
  - Catalogue checker on the real package: 0 errors, 0 warnings.
  - Negative test (copy with a 3rd and a 4th level added): depth 4 rejected, depth 3 accepted; exit code 1.
  - Ajv: all 4 catalogue files valid.
  - Search for leftover "depth 2", "no bottom tab bar" and `display` field references: none remain.
  - Skill completeness: expected failures only (no app yet).
- **Boundaries unchanged:** D11 catalogue unapproved; all 235 prices unapproved (39 historical TCB references, 196 estimates); images missing; compliance flags provisional; D12 open; D5 deferred. No application code, no database connection or import, no deployment.
- **Next:** the owner approves, redirects or asks for alternatives at **Checkpoint 3**. Checkpoint 4 does not start before explicit approval.

## 2026-10-21 — Checkpoint 2 approved with conditions; Checkpoint 3 (Research and direction) proposed, awaiting approval

- **Owner decision:** Checkpoint 2 (Product contract) **approved with seven conditions**:
  1. The generated catalogue remains an unapproved research artifact: not imported, not published, not in the reusable template. D11 stays pending owner review.
  2. All 235 prices remain unapproved. The 39 historical TCB reference prices (26 Feb 2026) and the 196 estimates are kept distinct, and neither is a verified current selling price.
  3. Images stay missing until exact-product suitability and commercial rights are verified. BSTI and other compliance flags stay provisional.
  4. D12 stays open and is resolved before any location-data-dependent behaviour.
  5. D5 stays deferred and does not block the contract.
  6. Decision status is reconciled across the six docs; validation and provenance records are preserved.
  7. Proceed to Checkpoint 3 only.
- **Done (Checkpoint 2 reconciliation):**
  - Status lines and decision tables updated in `DESIGN.md`, `docs/domain-rules.md`, `docs/LICENSING.md`, `README.md` and `AGENTS.md`; the conditions are recorded in `DESIGN.md` → Product contract.
  - D7, D8, D10 and D13–D16 are now **approved**; D9 is **approved as a proposal** (disabled for BD production until legal review). D11 is unchanged ("Owner authorized catalogue generation; generated catalogue pending owner review and approval."); D12 **open**; D5 **deferred**.
  - `catalogue/horekbazar/README.md` gained one status sentence; no catalogue data changed.
- **Done (Checkpoint 3, proposed):**
  - `DESIGN.md` gained: Research record (5 questions, 14 sources), Directions A/B/C compared, Divergence, Concept, Typography, Colour, Layout, Components, Imagery, Restraint Gate record, and a design decision trace.
  - New `SCHEMA.md` (draft v0: storefront entities, routes, core section contracts, states, environment variables) and `DATA.md` (D2 override: no mock data).
  - Chosen direction: **"Khata"** (shop-ledger rows, running total bar as the signature, Tiro Bangla title voice, Noto Sans Bengali text with same-width Bengali digits, khata-paper ground with a blue-ink accent).
  - Dials: storefront ENERGY 2 · RHYTHM 1 · MOTION 1; checkout, account and admin 1 · 1 · 1; Tier 1.
- **Research performed:**
  - Web sources: Baymard, Shwapno, Setka, Cashod, r12a, W3C, Next.js docs, Google Fonts metadata.
  - Font files downloaded from google/fonts and measured with fontTools. Anek Bangla's Bengali digits have uneven widths and no tabular alternates; Noto Sans Bengali's share one width. Bengali-subset WOFF2 sizes: Anek with both axes ≈ 446 KB; Noto at weights 400–600 ≈ 68 KB; Tiro ≈ 78 KB.
  - Node 20 `Intl` checked for `bn-BD` and `en-BD` money formats.
- **Validation run:**
  - `node scripts/contrast.mjs` on all 13 token pairs. Text pairs are 5.03:1 to 16.26:1; the control border is 3.41:1, enough for its UI-component use. `--line` is 1.40:1 and is decorative only.
  - Catalogue validator: 0 errors, 0 warnings. Ajv: all 4 catalogue files valid.
  - Decision-status consistency check across the six docs.
  - Skill completeness: expected failures only (no app yet).
- **Not done (not authorised):** no application code, no database connection or import, no deployment, no motion plan or build plan (those are Checkpoint 4).
- **Open:** D11 catalogue review; all prices; all images; BSTI, BTRC, courier and polythene checks **[L]**; D12 location dataset; D5 hosting; Bengali rendering and font sizes to be verified in the build prototype; `SCHEMA.md` API surface and admin sections to be completed at Checkpoint 4.
- **Next:** owner approves, redirects or asks for alternatives at **Checkpoint 3**. Checkpoint 4 (motion plan and build plan) does not start before that approval.

## 2026-10-21 — D11 owner decision: generated starter catalogue (pending owner review; Checkpoint 2 still awaiting approval)

- **Owner decision:** no existing catalogue; the owner authorized the agent to generate a proposed starter catalogue from scratch. D11 is now: **Owner authorized catalogue generation; generated catalogue pending owner review and approval.** The catalogue itself is **not approved**.
- **Done:**
  - Created `catalogue/horekbazar/`, a draft review/import package kept outside `data/` and outside core logic, never read at runtime and excluded from the sellable template.
  - Contents: 39 categories (9 top-level, 30 leaf); 144 products and 235 variants with original Bangla/English names, descriptions, attributes, SKUs (`HB-<CAT>-<NNN>-<VAR>`) and SEO; JSON Schema 2020-12; price research (`PRICE-RESEARCH.md`, `prices.csv`); image manifest plus acquisition checklist; sources; review checklist; gated import instructions; and a zero-dependency validator and report tool.
  - Added `docs/domain-rules.md` §16 (catalogue workflow).
  - Updated `DESIGN.md`, `docs/LICENSING.md`, `README.md` and `AGENTS.md`.
- **Research:**
  - Market mix: DHL/ECDB, BSS reporting BBS 2024-25, DCIF (figures conflict with BSS, unresolved), ShopRank.
  - Prices: official TCB Dhaka retail list of 26 Feb 2026 (XLSX downloaded and read); the TCB daily page returned HTTP 502 on 2026-10-21; October 2026 news corroborates the rice ranges.
  - BSTI mandatory-certification lists: two official PDFs plus secondary reports of later additions.
- **Draft state (verified by the validator):**
  - Every record is `draft` / `pending_owner_review`.
  - Stock is 0, `unverified` and `unavailable`.
  - `brand: null`, and all 144 products have images `missing`.
  - Prices: 39 are reference-derived from TCB; 196 are unsourced estimates; all require owner review; no compare-at prices.
  - BSTI flags: 33 likely, 43 unknown, 68 not found. All flags are **[L]**.
- **Validation run:**
  - `node catalogue/horekbazar/tools/catalogue.mjs validate`: 0 errors, 0 warnings.
  - Ajv 8 (draft 2020-12, strict, formats; run outside the repo, no dependency added): all 4 files valid.
  - Negative test on a mutated copy: both validators rejected it. The validator reported 10 errors: stock above 0, an added `rating` field, a pre-approved record, an invented compare-at price, "100% pure organic" copy, a duplicate SKU, an SKU/id mismatch and `importAllowed: true`.
- **Not done (not authorized):** no database connection, no import, no application code, no images sourced.
- **Open:** owner review of taxonomy, products, brands and every price; image acquisition; BSTI, BTRC, courier and polythene checks **[L]**; D12 location dataset (unchanged, open); D5 deferred.
- **Next:** owner reviews the catalogue package and approves (or redirects) Checkpoint 2. Checkpoint 3 does not start until Checkpoint 2 is explicitly approved.

## 2026-10-21 — Checkpoint 2 amendments (waiting for final Checkpoint 2 approval)

- **Done:** applied owner decisions to `DESIGN.md` and `docs/domain-rules.md`; added §12 replica-set requirement, §13 outbox scheduler (`JOBS_TRIGGER`: `worker` / `http` / `vercel-cron` on Pro only), §14 Zod → MongoDB validator generation with CI checks, §15 legal basis register (all legal points marked **[L]**, need local legal review); rewrote §5 pricing (integer minor units, rounding, coupon eligibility/minimums, free-delivery coupons, largest-remainder allocation, partial-cancellation fairness rule); defined the 100-on-10 stock concurrency proof; researched BD location datasets (§6.1); updated `docs/LICENSING.md` with data attribution and catalogue-rights notes.
- **Verified:** `zod@4.6.7` ships `z.toJSONSchema`; `better-auth@1.7.12` exports `./plugins/two-factor`; MongoDB docs: transactions need a replica set; Atlas Free clusters: 3-node replication, 100 ops/s, 500 connections, backups available (corrected an earlier wrong claim); Vercel Hobby cron: once per day, per-hour (±59 min) precision; COD-AB Bangladesh: CC BY-IGO 3.0, 507 upazila features. Removed an unverified "cron not retried" claim; aligned `README.md` and `DESIGN.md` `data/` wording with D11.
- **Decided (owner, approved in principle):** D7 staff 2FA, D8 promotions, D9 rewards as non-cash loyalty discount (legal review before launch), D10 localisation, D13 phone + admin confirmation, D14 no SMS, D15 no online payments, D16 exclusions; D5 deferred.
- **Open:** D11 real catalogue (owner supplies/approves; empty dev DB meanwhile), D12 location dataset selection (licence, attribution, version, 495 vs 507 upazila count to reconcile).
- **Next:** owner approves Checkpoint 2 → Checkpoint 3 (design research and direction). No application code until Checkpoint 4 is approved.

## 2026-10-21 — Process rule added

- **Done:** added `AGENTS.md` (owner working rules, repo boundaries, hard rules) and this log.
- **Decided (owner):** push after every phase and change; summary per phase here; all changed `.md` files delivered as one copyable block.
- **Next:** owner answers Checkpoint 2.

## 2026-10-21 — Checkpoint 2: Product contract (PROPOSED, waiting for approval)

- **Done:** product contract, type research (Chaldal, Rokomari, Shajgoj Shop, Pickaboo, Medusa starter), Scope table (33 storefront routes, 27 admin surfaces, 12 journeys, states, edges, skeletons) in `DESIGN.md`; detailed rules in `docs/domain-rules.md`; licence plan in `docs/LICENSING.md`. Scope table parses with the skill's `completeness.mjs` (failures only for unbuilt routes and the Step 2 research record).
- **Decided (owner):** no mock-data fallback, real dev database, `data/` is seed input only; basic commercial licence, provisional. D1 Better Auth, D3 push library chosen later, D4 polling chat + optional Ably accepted with Checkpoint 1.
- **Open:** D5 Vercel scope/tier, D7 staff 2FA, D8 promotion stacking, D9 rewards legal shape, D10 URL strategy, D11 real catalogue, D12 BD location dataset, D13 customer verification, D14 SMS, D15 online payments, D16 exclusions.
- **Next:** after approval → Checkpoint 3 (design research, 2–3 directions, synthesis, type, colour, `DESIGN.md` + `SCHEMA.md`).

## 2026-10-21 — Setup and Checkpoint 1: Stack (approved with amendments)

- **Done:** `gh` authenticated as `dev-asfakul`; created private `dev-asfakul/horekbazar`; inspected `asfakulsiam/asfakulsiam-motomation-design` (public, untouched); installed skill v3.0.2 (identical to upstream); audited Node 20.20.2 / npm 10.8.2; Vercel CLI authenticates but default scope `dev-choice` rejects the token.
- **Decided:** Next.js 16 App Router, React 19, strict TS, Tailwind 4, Radix/shadcn, Zod, MongoDB official driver, Better Auth, Upstash Redis, MongoDB outbox + cron, Cloudinary, Resend, Gemini (server-only), next-intl; host-portable.
- **Next:** Checkpoint 2.
