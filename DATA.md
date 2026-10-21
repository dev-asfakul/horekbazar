# DATA.md: HorekBazar template

Status: **Checkpoint 3 draft (proposed 2026-10-21; checked again after the owner's review, awaiting explicit approval).** The only change in this revision is the category-depth note below.

The skill's default (`templates/DATA.md`) ships demo mock data in `data/`, each entry labelled demo. **That default is overridden for this product** by owner decision D2 (Checkpoint 1) and confirmed at Checkpoint 2:

- There is **no mock data, no demo fallback and no in-memory database**. Without a configured database, every database-backed page shows a clear setup-required state.
- `data/` holds **only owner-supplied or owner-approved records**, as seed input for a separately configured **development** database. It may be empty, and an empty database is a valid state.
- `data/schema.json` (JSON Schema 2020-12 with `$defs`) is generated from the application's Zod schemas when the app exists (Checkpoint 4 or later). It is not hand-written.
- The generated HorekBazar starter catalogue in `catalogue/horekbazar/` is an **unapproved research artifact** (D11; Checkpoint 2 condition 1):
  - It is never read at runtime, never imported without record-level owner approval (`catalogue/horekbazar/IMPORT.md`), and never included in the reusable template.
  - All 235 of its prices are unapproved: 39 are historical TCB references from 26 Feb 2026 and 196 are estimates, and neither kind is a current selling price.
  - All of its images are missing.
  - Its BSTI and other compliance flags are provisional.

| Entity | File | Entries now | Labelled |
|---|---|---|---|
| Category | `data/categories.json` | not created (0) | owner-approved only; tree up to 3 levels (approved contract) |
| Product / Variant | `data/products.json` | not created (0) | owner-approved only |

The README states what is real: nothing in `data/` is demo, because nothing is there until the owner approves it.
