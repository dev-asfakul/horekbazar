# Changelog

HorekBazar has not had a release yet; there is no version number. This file lists what reached `main`, newest first, by merged pull request. Unmerged work is listed under "Unreleased (open pull requests)". Detailed evidence for each step is in `docs/PROGRESS.md` and `docs/HANDOFF.md`.

## Unreleased (open pull requests)

- #34 B10 part c: `/admin/audit` (read-only audit log, `platform.read`) and `/admin/customers` (customer list and detail, `customers.read`, staff excluded, redacted).
- #35 B10 part b: `/account/privacy`, data export and deletion request. Adds the `privacyRequests` collection, a schema change that needs owner review. Nothing is erased.
- B11 hardening and documentation (this branch): `MEDIA.md`, `THIRD_PARTY_NOTICES.md` draft, this changelog, `GATE.md` and `CRITIQUE.md` drafts, the k6 script, README update.

## 2026-10-23

- #33 B10 part a: information and legal pages (Bangla and English; missing copy marked `[NEEDS COPY]`; noindex until the copy is approved) and the offline fallback page.
- #32 Docs: B9 records reconciled after #27, #30 and #31.
- #31 B9 part 2b: Gemini AI drafts for product text, with per-field approval.
- #30 B9 part 2a: browser notifications (push), campaigns and the order e-mail log.
- #29 Showcase: CC0 and public-domain illustrative product photos, collections and homepage sections, on `horekbazar_dev` only.

## 2026-10-22

- #27 B9 part 1: reviews, rewards ledger, customer–store messaging.
- #26 CI: 60-minute job limit; apt and Playwright install recovery.
- #25 B8: fulfilment and returns (shipments, Steadfast adapter, courier webhooks, returns).
- #23 B6 cart and pricing; B7 checkout and orders (cash on delivery; ordering off by default).
- #21 Header store name, illustrative showcase photos, docs.
- #19 Loading skeletons on every data page, password confirmation, prefetch fix, showcase script.
- #17 Banglish storefront copy in Bengali script (owner correction).
- #15 Docs: main merge and `db:migrate` on `horekbazar_dev`.
- #14 B5 storefront catalogue (browse, search, product pages, SEO); Banglish storefront; bulk product status.
- #10 Docs: takeover audit and B4 close-out.

## 2026-10-21

- #9 Docs: B4 merge evidence.
- #8 B4 catalogue administration (catalogue, inventory, merchandising, settings, media, development sample seed).
- #7 Fix: focus stays visible in the sliding dock.
- #5, #6 Docs: B3 merge and deployment records.
- #4 B3 identity (accounts, first Owner, staff, two-step verification).
- #3 Docs: post-B2 records.
- #2 B2 data platform (database port, validators, migrations, outbox, health).
- #1 B0 and B1: toolchain, nonce CSP (D17 option a), the "Khata" shell.
