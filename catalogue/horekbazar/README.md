# HorekBazar starter catalogue (DRAFT, pending owner review)

> **Status: DRAFT. NOT APPROVED. NOT FOR IMPORT.**
> The owner authorized generation of this catalogue (decision D11, 2026-10-21). Nothing in this package has been approved. Checkpoint 2 was approved with the condition that this package remains an **unapproved research artifact**: not imported, not published, not included in the reusable template. Every category, product, variant, price, attribute and SEO text is a proposal for review.

## What this is

A proposed starter catalogue for the HorekBazar flagship store, generated from scratch because no catalogue existed. It is a **review and import input only**:

- The application **never reads this folder at runtime**. No code path may import, require or fetch it.
- It is **never published** and never shipped in the sellable template package (HorekBazar-specific content is excluded from what buyers license; see `docs/LICENSING.md`).
- It is **never imported into any database** unless the owner explicitly approves records and follows [`IMPORT.md`](IMPORT.md).
- An empty database is still a valid state. This package is not a fallback and must never be used to fill an empty store automatically.

## Contents

| File | Purpose |
|---|---|
| [`TAXONOMY.md`](TAXONOMY.md) | Market research, proposed category tree and excluded categories |
| `categories.json` | 39 draft categories (9 top-level, 30 leaf), bilingual, with SEO |
| `products.json` | 144 draft products, 235 variants, bilingual names, descriptions, attributes, SKUs, SEO, regulatory flags, fact-check lists |
| `schema.json` | JSON Schema (draft 2020-12) for all package files, one `$defs` entry per entity |
| [`CATALOGUE-SCHEMA.md`](CATALOGUE-SCHEMA.md) | Human-readable field reference and invariants |
| [`PRICE-RESEARCH.md`](PRICE-RESEARCH.md) + `prices.csv` | Price method, sources and every proposed price with its status |
| `image-manifest.json` + [`IMAGE-ACQUISITION.md`](IMAGE-ACQUISITION.md) | Image slots (all missing) and the acquisition and licence checklist |
| `sources.json` + [`SOURCES.md`](SOURCES.md) | Every source used, with URLs, dates and reliability notes |
| [`REVIEW-CHECKLIST.md`](REVIEW-CHECKLIST.md) | What the owner must check before approving any record |
| [`IMPORT.md`](IMPORT.md) | Explicit, gated import instructions |
| `tools/catalogue.mjs` | Zero-dependency validator (`validate`) and price report generator (`report`) |

## Hard facts about the draft

- **Status:** every record has `status: "draft"`, `generated: true`, `review.status: "pending_owner_review"`, `approvedBy: null`.
- **Stock:** every variant has `onHand 0`, `reserved 0`, `available 0`, `stockStatus "unverified"`, `availability "unavailable"`.
- **Prices:** 39 variants have an indicative reference derived from official TCB Dhaka retail ranges (26 Feb 2026). The other 196 are unsourced agent estimates. **All 235 need owner review**; none is a confirmed selling price. No "compare-at" or "was" prices exist.
- **Brands:** none. `brand: null`, `brandStatus: "to_be_confirmed_by_owner"`. Descriptions are generic and do not imply a specific manufacturer.
- **Images:** none sourced. All 144 products are `imageStatus: "missing"`.
- **Not included anywhere:** ratings, reviews, sales counts, popularity, "bestseller" labels, stock claims, supplier relationships, certifications, availability promises, urgency or countdowns. The validator rejects these fields and common unsupported claims ("organic", "100%", "pure", "best", "original", "premium", "fresh", "halal", "guaranteed" and their Bangla equivalents).
- **Regulatory flags:** 33 products are flagged as *likely* needing a BSTI mandatory certification mark, 43 are *unknown*, and 68 were *not found* in the lists reviewed. Every product has `legalReviewRequired: true`. A flag is a reminder to verify, never a claim that the product is certified.

## Validate

```bash
node catalogue/horekbazar/tools/catalogue.mjs validate
node catalogue/horekbazar/tools/catalogue.mjs report   # regenerates prices.csv and the table in PRICE-RESEARCH.md
```

The validator runs without dependencies. The formal JSON Schema check uses Ajv, now a pinned dev dependency (Phase B0): run `npm ci`, then `npm run catalogue:schema` (details in [`CATALOGUE-SCHEMA.md`](CATALOGUE-SCHEMA.md)). `npm run catalogue:validate` runs the validator. CI runs both. Running them does not approve or import the catalogue.
