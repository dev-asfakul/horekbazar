# Import instructions (GATED: do not run without explicit owner approval)

**Current state: import is NOT allowed.** `meta.importAllowed` is `false` in every file. No database connection, seed script or application code exists yet, and none is authorized by decision D11. These steps describe the future process; they become usable only after the application's seed command is built in an approved build phase.

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
4. **Seed the development database only.** Run `npm run db:seed -- --env development --confirm`. The seed command must:
   - refuse to run unless `APP_ENV=development`, the target database name ends with `_dev`, and `--confirm` is passed;
   - be idempotent, keyed by SKU and slug;
   - never delete existing records;
   - print a dry-run diff first.
5. **Staging and production** are populated only through the admin UI or a separately approved, reviewed migration, never from this folder.
6. Record the import in `docs/PROGRESS.md`: which records, which database, and the verification result.

## Never

- Never import directly from `catalogue/horekbazar/`.
- Never let application code read this folder.
- Never use it to fill an empty store automatically.
- Never import into staging or production without a separate approval.
