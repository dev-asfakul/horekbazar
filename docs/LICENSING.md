# Licensing plan (provisional, for later legal review)

Status: **provisional owner decision, 2026-10-21.** This is a planning note, not legal advice and not the licence text. The final `LICENSE` file must be written or reviewed by a qualified lawyer before the template is sold.

## Intended model

One **basic commercial licence**. No tiers, no "extended" licence, no licence keys, phone-home checks or other enforcement mechanisms in the code.

Intended terms (to be confirmed):

| Topic | Intended position | Open question for review |
|---|---|---|
| Use | The purchaser may install and run the template for their own store(s) | One store per purchase, or unlimited own stores? |
| Customisation | Purchaser may modify the code, design, copy and configuration freely | — |
| Client work | Purchaser may build a store for one client with it | Does each client need their own purchase? |
| Redistribution | Purchaser may not resell, sublicense or publish the template source (original or modified) as a template, theme, starter or SaaS | Wording that allows sharing with contractors working on the purchaser's store |
| HorekBazar brand | The HorekBazar name, logo and flagship content in `data/` and `public/brand/` are not licensed for use in buyer stores | Trademark registration status |
| Updates and support | Defined separately (not part of the licence) | Update period and support channel |
| Warranty | Provided "as is"; purchaser is responsible for their own legal compliance, policies and data protection | Jurisdiction and governing law |

## Third-party obligations

Every runtime dependency must pass the Checkpoint 1 licence check (MIT, Apache-2.0, ISC, BSD or similar permissive licence). Before release:

- Generate a `THIRD_PARTY_NOTICES.md` from the lockfile (licence name, copyright, URL) and ship it with the template. Apache-2.0 packages (for example the MongoDB driver and `@google/genai`) require their NOTICE content to be preserved.
- No copyleft (GPL/AGPL/MPL) code is bundled into the template. Tools used only outside the shipped code (for example k6 for load testing, AGPL) are documented but not distributed.
- Fonts: only fonts licensed for web embedding and redistribution in a commercial template (for example SIL OFL); record each in `MEDIA.md`.
- Images and media: every image in `data/` and `public/` has a recorded source and licence in `MEDIA.md`; assets that cannot be redistributed to buyers are excluded from the sellable package.
- The Motomation Design skill (MIT) is a development tool installed per machine; it is not part of the template sold to buyers.
- Third-party services (MongoDB Atlas, Vercel, Cloudinary, Resend, Upstash, Google Gemini, Ably, couriers) are used under each buyer's own account and terms; the template does not grant rights to them.

## Questions to settle before first sale

1. Per-store vs. per-organisation scope of one purchase.
2. Whether client/agency use needs a separate purchase.
3. Governing law and the sales platform's own licence terms (if sold through a marketplace, its licence may apply instead).
4. Refund policy for the template purchase.
