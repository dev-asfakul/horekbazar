# Import instructions

## Owner change 2026-10-22: sample data in the development database

The owner changed D11 on 2026-10-22: "for catelog source generate some catalogue source data and push to database, and admin will curd them for real and test". So this package may now be loaded, **as sample data, into a development database only**, with `npm run db:seed` (Phase B4; code in `scripts/db-seed.ts` and `lib/db/seed-samples.ts`):

- `npm run db:seed` is a dry run; `npm run db:seed -- --confirm` writes. It refuses any database whose name does not end in `_dev` (no override flag).
- It creates records through the catalogue services (validators and the audit log apply; the audit actor is `system:db-seed`). It is idempotent by slug and SKU, never modifies an existing record, and skips a slug or SKU already used by a non-sample record.
- Every record gets `sample: true` and the admin shows a "Sample" badge. Categories and products are drafts, stock is 0, net quantities are `verified: false`, and the variant price is `price.proposed`, which is a research estimate and **not a selling price**. Draft-only fields (`generated`, `review`, `factChecks`, `price.reference`, `inventory`, `images`, `tags`, `regulatory`, `brand`) are not loaded.
- A sample record can be published only in a `_dev` database (service rule), so samples cannot go live in production even if copied there.
- `npm run db:seed -- --remove-samples [--confirm]` deletes only `sample: true` records (with the stock and ledger rows of sample variants) in a `_dev` database, and refuses while a collection or homepage section refers to them.

This change does **not** approve any record for production. The gated process below still applies to real catalogue content.

## Showcase population of the development database (`npm run showcase`, `npm run showcase:images`)

After `npm run db:seed -- --confirm`, two scripts make `horekbazar_dev` browsable as a stocked shop. Both refuse any database whose name does not end in `_dev`, print the database name (never the URI), are dry runs unless `--confirm` is passed, and write only through the admin services with the store Owner as the actor (versions, publish rules, inventory ledger and audit log apply).

| Step | What it changes | Rerun |
|---|---|---|
| `npm run showcase -- --confirm` | Store settings (only if never saved), delivery zones `dhaka-city` and `outside-dhaka` (only if the id is absent), publishes categories and products that are drafts and were never published, opening stock through `moveStock` with the fixed adjustment id `showcase-open-<variantId>` (variants whose seeded quantity is 0 stay out of stock), the collections in `showcase-merch.json` (only if the slug is absent; published products only) and the home sections (hero, category tiles, one product rail per collection, collection grid; only while the store has no home section) | No write: settings saved, zones present, receipts replay, collections and sections left as they are. A record the admin unpublished or edited is never changed back |
| `npm run showcase:images -- --confirm` | Downloads each photo in `showcase-images.json` (CC0 or public domain; source, creator, licence and landing page recorded per entry), uploads it to Cloudinary as `horekbazar/products/showcase-<slug>` and links it with `addProductMedia` (alt text and rights line set) | Products that already have the image are skipped |

Verify: the script output counts; in the database, products with `media`, collections and home sections published, stock rows equal to ledger sums; in Cloudinary, every linked `publicId` present under `horekbazar/products/`; on the storefront, `/`, `/collections/<slug>`, `/c/<slug>`, `/search` and `/p/<slug>` (needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` on the server, otherwise products show their label tile). From the agent sandbox the Atlas SRV name does not resolve: run with a seed-list `MONGODB_URI` and `MONGODB_DB=horekbazar_dev`.

Products without a suitable unbranded, licensed photo keep the label tile; no stand-in image is linked.

## Gated process for real (approved) catalogue content

**Production import is NOT allowed.** `meta.importAllowed` stays `false`: it refers to importing this package as real catalogue content, which still needs record-level approval. The steps below describe that future process.

## Preconditions (all required)

1. The owner has approved Checkpoint 2, and the build phase that creates `npm run db:seed` has been approved and built.
2. The owner has given **explicit written approval for specific records** (product ids or categories) in the conversation or an issue. Approval of this package as a whole does not approve every record.
3. Each approved record has passed [`REVIEW-CHECKLIST.md`](REVIEW-CHECKLIST.md).

## Steps

1. **Copy approved records only** from `catalogue/horekbazar/*.json` into `data/categories.json` and `data/products.json`, in the application's `data/` format defined by `data/schema.json`, which is generated from the Zod schemas. While copying:
   - Remove the draft-only fields `generated`, `factChecks` and the draft `meta`.
   - Set `review.status = "approved"` and record `approvedBy` and `approvedAt`.
   - Replace estimate notes with the owner's price source.
2. **Keep stock at zero and products unpublished.** Imported products are created as unpublished (`status: draft` in the app) with zero stock. Stock is added only through `receive` movements in the inventory ledger, and publishing is a separate staff action per product.
3. **Validate:** run `npm run data:validate` (Zod) and the CI checks. Fix every error; never bypass the validator.
4. **Seed the development database only.** The seed command for approved `data/` content must (the B4 sample loader already follows these rules for the sample load):
   - refuse to run unless `APP_ENV=development`, the target database name ends with `_dev`, and `--confirm` is passed;
   - be idempotent, keyed by SKU and slug;
   - never delete existing records;
   - print a dry-run diff first.
5. **Staging and production** are populated only through the admin UI or a separately approved, reviewed migration, never from this folder.
6. Record the import in `docs/PROGRESS.md`: which records, which database, and the verification result.

## Never

- Never import directly from `catalogue/horekbazar/` as real content (the `sample: true` development load above is the only exception).
- Never let application code read this folder.
- Never use it to fill an empty store automatically.
- Never import into staging or production without a separate approval.
