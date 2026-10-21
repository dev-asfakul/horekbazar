# Handoff for the next developer or agent

Last updated 2026-10-22 (Asia/Dhaka), after the takeover audit that followed Phase B3 (identity). Read this first, then
`AGENTS.md`, `DESIGN.md`, `docs/BUILD-PLAN.md` §11 (phases) and §13 (open decisions),
`docs/STATUS.md` (verified state per requirement) and the newest entries of `docs/PROGRESS.md`.

## Where the project is

| Phase | State |
|---|---|
| B0 toolchain, B1 shell, B2 data platform | merged to `main` (PRs #1, #2, #3) |
| Docs and fixes after B3 | PRs #5, #6 merged; 2026-10-22 dock focus fix and audit (see PROGRESS) |
| B3 identity | merged to `main` (PR #4, `a8a26a6`); deployed to `horekbazar-preview` without a database configured |
| B4 catalogue admin and later | not started; each phase needs explicit owner approval (BUILD-PLAN §0) |

Deployment: `horekbazar-preview.vercel.app` runs B3 code but reports `database: not_configured`, so it only shows setup-required. Two Vercel projects exist
(`horekbazar`, `horekbazar-preview` in team `dev-choice`); the owner has not said which is
canonical. Do not guess.

## B4 in progress (resume here)

Owner approval 2026-10-22: B4 approved; D11 changed: "generate some catalogue source data and push
to database, and admin will curd them for real and test". Implementation of that change: the
existing generated package `catalogue/horekbazar/` (39 categories, 144 products) is loaded into the
**development** database only, by `npm run db:seed` (dry run by default; `--confirm` writes; refuses
unless the database name ends with `_dev`; idempotent by slug and SKU; never deletes; every seeded
document carries `sample: true` and the admin shows a "Sample" badge; products stay draft, stock 0).
Its prices are research estimates, not selling prices. Repository visibility: owner approved private,
but on GitHub Free a private personal repository loses branch protection and secret scanning
(docs.github.com); held for the owner's choice. Secret scanning and push protection were enabled
2026-10-22 while public.

Steps (each is pushed to `preview/horekbazar-v1` when done; tick here in the same commit):

- [x] 1. Catalogue domain: schemas, validators, indexes for `categories`, `products`, `variants`,
      `stock`, `inventoryLedger`; services (category depth 3 and cycle rules, product and variant
      upsert with `version`, publish/archive, inventory receive/adjust with ledger idempotency);
      audit on every write; integration tests. **Done:** `lib/modules/catalogue/` (schema, common,
      categories, products, inventory, locks), 6 validators, `tests/integration/catalogue.test.ts`
      (19 tests). ESLint draft-folder rule narrowed to exclude `lib/modules/catalogue/`.
- [x] 2. Settings and delivery zones (`settings` singleton with `version`; accent contrast check;
      zones without area mapping, D12) and merchandising (`collections` manual, `homeSections` six
      types, `banners`); tests. **Done:** `lib/modules/settings/`, `lib/modules/merch/`, 4 validators,
      `tests/integration/settings-merch.test.ts` (8), `tests/unit/settings.test.ts` (2). Settings
      start as DEFAULT_SETTINGS (version 0, nothing persisted, no zones invented); storefront use of
      settings (accent, numerals) is B5.
- [x] 3. Media: `/api/media/sign` (Cloudinary signed upload, `catalogue.write`, allow-list);
      disabled with a notice when Cloudinary is not configured. **Done:** `lib/adapters/media/cloudinary.ts`,
      `app/api/media/sign/route.ts` (same-origin, capability by purpose, 503 `not_configured`), admin
      CSP `connect-src` adds `https://api.cloudinary.com` on /admin only; `tests/unit/media.test.ts`.
      Not done: checking with Cloudinary that an uploaded asset exists (the server accepts only
      public ids inside the purpose folder). No Cloudinary credentials yet (owner action).
- [ ] 4. Admin pages and server actions: products (list with search, filter, pagination; editor),
      categories, inventory, collections, homepage, banners, settings; bn/en messages.
- [ ] 5. `npm run db:seed` from `catalogue/horekbazar/` and its run on `horekbazar_dev`.
- [ ] 6. Playwright with a disposable database (sign in as a catalogue editor, create a product
      with a LabelTile, publish it); Motomation gate; docs; PR.

## Rules that are easy to break

- Never invent catalogue data, prices, stock, reviews, discounts or urgency (D11 is open).
- Authorisation happens on the server: `gateStaffPage()` for admin pages, and a principal plus
  capability check inside every admin server action (`lib/actions/admin.ts`). `proxy.ts` only
  redirects when no session cookie exists; it is not an authorisation check.
- Never trust client-sent prices, roles, discounts, stock or claims.
- Do not commit `.env.local`, and do not print or document credential values.
- Do not modify the Motomation skill (`.agents/skills/…`, `.claude/skills` link) or `skills-lock.json`.
- Report gates and tests exactly as they ran. Skipped tests must be explained.
- D18: build work goes to `preview/horekbazar-v1`; only the owner (or the agent on the owner's
  explicit instruction) merges to `main`.

## Running it

```bash
export PATH=~/.local/node/bin:$PATH        # Node 24 (engines); system Node 20 is too old
npm ci
npm run lint && npm run typecheck && npm test
npm run db:validators -- --check
MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration   # disposable MongoDB 8.0.4 replica set
npm run build && npx playwright test                    # zero-variable build is the CI baseline
npm run db:migrate                                      # only against a database you are sure of
```

Sandbox notes: the agent sandbox resolver cannot answer SRV lookups, so `mongodb+srv://` fails
there (`querySrv EBADRESP`); the agent resolved the hosts over DNS-over-HTTPS into a temporary
env file that was deleted after use. Vercel and normal machines resolve SRV fine.

## Identity design in one page (B3)

- Better Auth 1.7.12 with the MongoDB port, configured in `lib/modules/identity/auth.ts`.
  Sessions are database sessions with two extra fields: `stepUpAt` (fresh password or TOTP for
  sensitive staff actions) and `secondFactorAt` (2FA verified in this session).
- `lib/auth/server.ts`: `getPrincipal()` (cached per request), `gateStaffPage(path)` (redirects to
  `/login`, or to `/admin/security` for enrolment or the second factor, else `forbidden()`).
- Capabilities and roles: `lib/modules/identity/capabilities.ts`, `roles.ts`; built-in roles are
  seeded by migration `0001-built-in-staff-roles`. 2FA is required for Owner and Manager (D7).
- First Owner: `/admin/setup` needs email verification (D23 option a) and `SETUP_TOKEN`
  (proposed). The `installation` singleton is written once with a fixed `_id`, so concurrent claims cannot create two first Owners.
- Recovery: `npm run admin:recover-owner` (audited; revokes the Owner's sessions).
- Email: `lib/modules/identity/mail.ts` writes to the outbox and attempts inline delivery; the
  drain retries failures. Resend delivers nothing until the owner verifies a sending domain.
- Known Better Auth behaviour: `verifyTOTP` returns the old session token while it rotates the
  cookie; read the new token from `Set-Cookie` (`sessionTokenFromSetCookie`).

## Known gaps and debts

- Backup-code regeneration; an Owner action to revoke another staff member's sessions.
- Customer accounts have no 2FA (by design so far).
- The storefront setup-required page shows environment variable names (never values) publicly.
- Motomation gate on `/login` (2026-10-22): FAIL. Page-level checks pass; failing rules are SEO
  metadata (canonical, og:image, JSON-LD), the header search form's states (native submit) and
  completeness items owned by B5 to B11. Run it against a zero-variable build: with the sandbox
  connected to Atlas it timed out (exit 3). `/admin/setup` and `--journey` with a signed-in staff
  user are not gated yet.
- The intermittent WebKit dock-focus failure was a real defect (focus during the dock's slide-in),
  fixed with `.bottom-dock:focus-within`; a deterministic regression test guards it.
- The repository is public although AGENTS.md says private; GitHub secret scanning is off.
- `experimental.authInterrupts` is still a proposed decision.

## Waiting on the owner

1. Rotate every credential pasted into the chat; create a least-privilege MongoDB user
   (`readWrite` on `horekbazar_dev`); keep production on a separate cluster (D19).
2. Verify a Resend domain and set `EMAIL_FROM` on it.
3. Set `SETUP_TOKEN`, then create the first Owner at `/admin/setup`.
4. Confirm D23 and the proposals `SETUP_TOKEN` and `secondFactorAt` (DESIGN.md Decision trace).
5. Decide whether the repository should be private (AGENTS.md says so; it is public) and enable
   GitHub secret scanning with push protection.
6. Name the canonical Vercel project, give the agent's Vercel token access to `dev-choice`, and
   add the environment variables there per environment.
7. Approve B4 and decide D11 (catalogue source); D12/D21, D5, D20, D22 and coupon restoration
   on cancellation remain open.
