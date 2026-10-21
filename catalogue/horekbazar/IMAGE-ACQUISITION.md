# Image acquisition and licence checklist

## Status

**No image has been sourced.** All 144 products have `imageStatus: "missing"`. Every slot in `image-manifest.json` is `missing`, with `licence`, `sourceUrl`, `rightsHolder` and `evidence` all `null`.

Why: a product photo must show **the exact item HorekBazar will sell**. The brand, pack and variant are not chosen yet, so a generic photo would misrepresent the product. Stock photos and web images also rarely allow commercial redistribution inside a template. Competitor and marketplace images (Daraz, Chaldal, Rokomari, Shajgoj and others) must never be used.

Until real images exist, the storefront shows an honest neutral placeholder. It never shows a stock photo pretending to be the product.

## Slots per product

| Slot | Required | Purpose |
|---|---|---|
| `primary` | yes | Front of the actual product or pack on a plain background |
| `gallery-1` | no | Back, side or in-use view |
| `label-closeup` | yes, where the BSTI flag is `likely` | Readable label showing net quantity, the BSTI mark (if present), manufacturer, and best-before or manufacture dates. Used for **internal compliance evidence**; publish it only if useful |

## Acceptable sources, in order of preference

1. **Own photography** of stock in hand. The owner or a hired photographer must assign rights in writing.
2. **Supplier or manufacturer images** with **written permission** for e-commerce use. The permission must cover web, social and ads, and must not expire silently.
3. **Licensed stock images**, for lifestyle or category banners only, never as a product photo. The licence must allow commercial use; keep the licence ID and receipt.
4. **AI-generated images**, only for decorative category or banner art, never to depict a sellable product. Label them as generated in `MEDIA.md`.

## Before a slot can change from `missing`

- [ ] The image shows the exact SKU (brand, pack size, colour and variant all match).
- [ ] The source and rights holder are recorded (`sourceUrl` or "own photo", `rightsHolder`).
- [ ] The licence or permission is recorded (`licence`), with evidence (`evidence`: file path to a permission email or receipt kept **outside** the public repo if it contains personal data).
- [ ] An entry is added to `MEDIA.md` (required by the skill and by `docs/LICENSING.md`).
- [ ] Bengali and English alt text is reviewed. Proposed alt text exists in `products.json` → `images[].alt`.
- [ ] Technical specs: at least 1200 × 1200 px source, square crop, sRGB, no watermark, no added text claims. The image is uploaded to the store's own Cloudinary account, never hot-linked.
- [ ] The image contains no people without a model release, no competitor logos, and no fake badges or "offer" stickers.
- [ ] HorekBazar-specific images are excluded from the sellable template package.

## Changing the schema when images arrive

The draft schema forbids non-missing images on purpose. When the owner approves real assets, the approved record moves to `data/` (see [`IMPORT.md`](IMPORT.md)). Its image fields are then validated by the application's media schema, which requires source, licence and rights holder.
