# Catalogue package schema

The machine-readable schema is [`schema.json`](schema.json) (JSON Schema draft 2020-12, one `$defs` entry per entity, following the skill's `templates/DATA.md` convention). This schema describes the **draft review package only**. It locks drafts on purpose: stock must be 0, status must be draft, and images must be missing. Approved records will be validated against the application's own Zod schemas (`docs/domain-rules.md` §14) when they are moved into `data/`.

## Entities

| Entity (`$defs`) | Key fields | Invariants |
|---|---|---|
| `Meta` | `status`, `importAllowed`, `runtimeUse`, `ownerAuthorization` | `status = draft_pending_owner_review`, `importAllowed = false`, `runtimeUse = forbidden` |
| `Category` | `id`, `slug`, `parentId`, `code`, `name{bn,en}`, `description{bn,en}`, `seo`, `review` | depth ≤ 3 (contract maximum; this draft uses 2 levels); slug unique, lowercase Latin; `status = draft` |
| `Product` | `id` (`hb-<cat>-<nnn>`), `slug`, `primaryCategoryId`, `categoryIds`, `name`, `shortDescription`, `description`, `brand`, `attributes[]`, `variants[]`, `images[]`, `seo`, `regulatory`, `factChecks[]`, `review` | `status = draft`, `generated = true`, `brand = null`, primary category is a leaf, `imageStatus = missing`, no extra fields allowed |
| `Variant` | `sku` (`HB-<CAT>-<NNN>-<VAR>`), `title`, `options`, `netQuantity`, `price`, `inventory`, `barcode`, `shippingWeightGrams` | SKU unique and matches product id; `barcode = null`; shipping weight `status = estimate` |
| `Price` | `proposed{amountMinor, currency}`, `compareAt`, `status`, `ownerReviewRequired`, `reference`, `note` | money in **integer poisha** (BDT minor units, `docs/domain-rules.md` §5); `compareAt = null`; `ownerReviewRequired = true`; `reference_derived` requires an official `PriceReference`, `estimate_requires_owner_review` requires `reference = null` |
| `PriceReference` | `sourceId`, `sourceItem`, `unitBasis`, `minBdt`, `maxBdt`, `multiplier`, `derivedMinBdt`, `derivedMaxBdt`, `observedOn`, `derivation` | derived range = source range × multiplier |
| `Inventory` | `onHand`, `reserved`, `available`, `stockStatus`, `availability` | all 0; `unverified`; `unavailable` |
| `Attribute` | `key`, `label{bn,en}`, `value{bn,en}`, `verify` | `verify = true`: every attribute value must be checked against the real product label |
| `ImageSlot` | `slot`, `status`, `assetId`, `sourceUrl`, `licence`, `rightsHolder`, `alt{bn,en}` | `status = missing`, all rights fields null; alt text proposed |
| `Regulatory` | `bstiMark` (`likely` / `unknown` / `not_found`), `sourceIds`, `note`, `legalReviewRequired` | `legalReviewRequired = true`; a flag never means "certified" |
| `Source` | `id`, `type` (`official`, `official_reported`, `secondary`, `agent_estimate`), `publisher`, `title`, `urls`, `observedOn`, `accessedOn`, `note` | referenced ids must exist |
| `Seo` | `bn/en.title` ≤ 60 chars, `bn/en.description` ≤ 160 chars | generated from the name and description; no invented claims |

## Extra checks in `tools/catalogue.mjs validate`

The validator also checks these rules, beyond the schema:

- No duplicate SKUs.
- No duplicate option combinations within a product.
- Product and category slugs do not collide.
- Every Bengali field contains Bengali script.
- Customer-facing copy has no forbidden keys anywhere in the files: rating, reviews, sold, popularity, bestseller, supplier, certification, badge, countdown, urgency, viewers or testimonials.
- Customer-facing copy has no unsupported marketing or health claims in Bangla or English.
- Every image slot listed in the manifest is still missing.

## Formal schema check (outside the repo, no dependency added)

```bash
mkdir -p /tmp/ajvt && cd /tmp/ajvt && npm init -y >/dev/null && npm install ajv@8 ajv-formats@3
cat > run.cjs <<'JS'
const Ajv = require('ajv/dist/2020'); const addFormats = require('ajv-formats'); const fs = require('fs');
const dir = process.argv[2]; const ajv = new Ajv({ allErrors: true, strict: true }); addFormats(ajv);
const v = ajv.compile(JSON.parse(fs.readFileSync(dir + '/schema.json')));
let bad = 0;
for (const f of ['categories.json', 'products.json', 'sources.json', 'image-manifest.json']) {
  const ok = v(JSON.parse(fs.readFileSync(dir + '/' + f))); console.log(f, ok ? 'valid' : 'INVALID');
  if (!ok) { bad++; console.log(v.errors.slice(0, 5)); }
}
process.exit(bad ? 1 : 0);
JS
node run.cjs /path/to/horekbazar/catalogue/horekbazar
```
