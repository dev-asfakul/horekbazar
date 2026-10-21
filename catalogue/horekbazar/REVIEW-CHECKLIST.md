# Owner review checklist

Approve **record by record** (or category by category). Nothing is approved in bulk by default. A record counts as approved only when the owner sets `review.status` to `approved` and fills in `approvedBy` and `approvedAt`, after the record has been moved into `data/` ([`IMPORT.md`](IMPORT.md)). The draft package itself always stays `pending_owner_review`.

## Taxonomy

- [ ] Top-level categories and order match what HorekBazar will actually sell ([`TAXONOMY.md`](TAXONOMY.md)).
- [ ] The Bengali and English category names read naturally. Slugs are acceptable as permanent URLs (D10: slugs are stable once published).
- [ ] The excluded categories are accepted, or the owner names which ones to add.

## Each product

- [ ] The product will really be stocked. Delete products you will not sell rather than leaving them as drafts.
- [ ] Brand chosen; `name` and `description` updated if brand naming matters. No description implies a brand or quality that is not true.
- [ ] Every `attributes[]` value checked against the real label (net quantity, material, wattage, capacity, size chart). Values marked "To be confirmed" are replaced or the attribute is removed.
- [ ] Every item in `factChecks[]` is answered.
- [ ] Variants match what the supplier offers. SKU codes are acceptable. Barcodes are added only from the real pack.
- [ ] Price set from real supplier cost and margin, and any government-set retail price is respected. The estimate or reference note is replaced by who set the price and when.
- [ ] Shipping weight measured on the packed item (affects delivery charge rules).
- [ ] **Regulatory:** for `bstiMark: likely`, the supplied product shows a valid BSTI mark (keep a label photo as internal evidence). For `unknown`, the current official list is checked. The product page never says "BSTI certified" unless the mark is verified, and only in neutral wording.
- [ ] Legal review **[L]** is done where flagged: cosmetics claims, infant products, electrical safety, wireless devices, food labelling.
- [ ] Images acquired per [`IMAGE-ACQUISITION.md`](IMAGE-ACQUISITION.md), or the product is launched with an honest placeholder.
- [ ] SEO title and description reviewed in both languages.
- [ ] Stock is **not** set here. Stock enters only through `receive` movements in the inventory ledger (admin) after physical goods are received and counted (`docs/domain-rules.md` §4).

## Never add

- Ratings, reviews, "sold" counts, popularity or "bestseller" labels.
- Fake "was" prices, countdowns or "only N left".
- Supplier names presented as partnerships.
- Certifications that have not been verified.
- Health, purity or origin claims without evidence.
