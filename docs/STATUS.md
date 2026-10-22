# HorekBazar: verified status

Audit of 2026-10-21 (Asia/Dhaka), updated after Phase B3, B4, B8 and B9 (2026-10-22; the B9 rows are the newest), made from a fresh `git fetch` with every check re-run in the agent
sandbox (Node.js 24.22.1). The approved scope is `DESIGN.md` plus `docs/BUILD-PLAN.md` §11
(phases B0–B11). No completion percentage is given because the phases have no agreed weighting.

Status values: **Verified** (implemented and verified), **Unverified** (implemented but not
verified), **Partial**, **Missing**, **Blocked** (by an owner decision or credentials), **N/A**.

## Repository and deployment

| Item | Observed |
|---|---|
| `main` | `f7ca4ea` (merge of PR #9; B4 merged in PR #8, `04158f2`). CI `push` success on `f7ca4ea`. Protection (GitHub API, 2026-10-22 takeover audit): required check `check`, enforced for admins, PR required with 0 approvals, conversation resolution required, no force pushes or deletions |
| `preview/horekbazar-v1` | `e517154` = `main` + 1 commit ("i18n: rewrite Bangla copy in conversational…", `messages/bn.json` and one `messages/en.json` aria label). CI `check` and Vercel `horekbazar-preview` success on it. Not in a PR and not recorded in PROGRESS; owner instruction for it not found in the repo (takeover audit) |
| Repository visibility | **public** (GitHub API, 2026-10-22); owner approved private, held because GitHub Free would remove branch protection and secret scanning. Secret scanning and push protection **enabled** 2026-10-22. History pattern scan: no real credentials, only three test fixtures |
| CI on `main` | `push` runs succeeded for the PR #3 to #6 merges. Earlier, GitHub recorded no push event for the PR #2 merge or `a7b4a64`. The intermittent WebKit 375 px focus failure was a real slide-in defect, fixed 2026-10-22 (PROGRESS) |
| Canonical deployment | **Not determined.** Commit statuses on `f7ca4ea` and `e517154` come from `dev-choice/horekbazar-preview`; `https://horekbazar.vercel.app/` answers 404. `https://horekbazar-preview.vercel.app` serves `main` (pre-`e517154` Bangla copy). 2026-10-22 takeover audit: `/api/health` reports `database: connected`, `setupRequired: true`; `/admin/setup` shows the Owner form with no blockers, so database, auth secret, email and `SETUP_TOKEN` are set on that deployment. Which database it points to is not verifiable from outside. No Vercel access in the agent sandbox |
| B9 session (2026-10-22, fresh fetch) | Start: `main` `e91afe2` with B8 (PR #24 → preview, PR #25 → `main`); all branches contained in `main`. Its push run 39787262867 was **cancelled** by the 30-min job limit (stalled apt mirror during Playwright dependencies). PR #26 (`f057f51`: 60-min job, apt retries, split install, browser cache) merged: `main` = `f3701cd`, push run 39795446717 **success** |
| B9 review corrections (2026-10-22, PR #27, not merged) | lint OK; typecheck OK; unit 160/160; validators no diff (34); integration 153/153; zero-variable build OK; canary build + `check:bundle` OK; Playwright Chromium 76 passed / 19 skipped (Firefox, WebKit not run locally; CI runs them); `test:e2e:db` 17 passed / 1 skipped (pre-existing skip); Motomation gate not run. `db:migrate` on `horekbazar_dev`: `rewardLocks` created, `0002-reviews-one-per-order-line` applied, re-run a no-op |
| B9 run (2026-10-22, `feat/b9-engagement`, PR into `main`, not merged) | lint OK; typecheck OK; unit 155/155; validators no diff (33); integration 147/147; zero-variable build OK; canary build + `check:bundle` OK; Playwright Chromium 76 passed / 19 skipped (Firefox, WebKit not run locally); `test:e2e:db` 16 passed / 1 skipped; gate not run. `db:migrate` on `horekbazar_dev`: 4 collections created, settings validator updated, re-run a no-op |
| B8 takeover (2026-10-22, fresh fetch) | Start: `main` `b397cf8`, `preview/horekbazar-v1` `77eb016` (B6+B7, CI and Vercel preview green). PR #23 (preview → `main`) merged after `check` passed: `main` = `4480140`, B6/B7 on `main`. Repository protection unchanged |
| B8 run (2026-10-22, `feat/b8-fulfilment`, PR #24 → `preview/horekbazar-v1`) | lint OK; typecheck OK; unit 149/149; `db:validators --check` OK (29); integration 134/134; zero-variable build OK; `check:bundle` OK; Playwright 227 passed / 58 skipped / 0 failed; `test:e2e:db` 16 passed / 1 skipped. Gate on `/` **FAIL**, exit 1 (same classes as B4: SEO on the setup page, header search states, completeness owned by B9–B11). `db:migrate` run on `horekbazar_dev` with the owner's development credentials (12 collections created, 5 validators updated, re-run a no-op, data unchanged); no courier call with real credentials (no Steadfast keys) |
| B4 run (2026-10-22, PR #8, merged `04158f2`; post-merge CI success) | lint 0 problems; typecheck OK; unit 107/107; integration 81/81; zero-variable build OK; Playwright 215 passed, 58 skipped (same intentional skips), 0 failed; `test:e2e:db` 2/2; Motomation gate on `/` **FAIL**, exit 1 (storefront SEO, header search form states, completeness B5–B11, session back-button finding not reproduced manually; page checks pass) |
| B5 branch run (2026-10-22, `feat/b5-storefront`) | lint OK; typecheck OK; unit 112/112; integration 88/88; zero-variable build OK; Playwright 215 passed, 58 skipped, 0 failed; `test:e2e:db` 10/10. Banglish PR #11 merged into `preview/horekbazar-v1` (`cbf8471`) after CI `check` success |
| Takeover audit re-run (2026-10-22, `e517154`) | Node 24.22.1, npm 11.19.1: `npm ci` OK; lint OK; typecheck OK; unit 107/107; `db:validators --check` OK (16); `catalogue:validate` OK; integration 81/81; zero-variable build OK; `check:bundle` OK; Playwright 215 passed, 58 skipped (opt-in screenshots and WebKit maintenance), 0 failed; `test:e2e:db` 2/2. Gate FAIL, exit 1 (see PROGRESS) |
| Local re-run (2026-10-22, `7adc38f`) | `npm ci` OK; lint OK; typecheck OK; unit 86/86; `db:validators --check` OK; integration 39/39 (disposable MongoDB 8.0.4 replica set); zero-variable `next build` OK; Playwright 179 passed, 58 skipped (opt-in screenshots and the WebKit maintenance check), 0 failed. Motomation gate on `/login` (zero-variable build): **FAIL**, exit 1; page checks pass, failures are SEO metadata, header search form states and later-phase completeness (PROGRESS 2026-10-22) |

## Requirements

| Area | Status | Evidence / reason |
|---|---|---|
| Project foundation, dev environment | Verified | Pinned versions in `package.json` and `package-lock.json`; `npm ci`; CI `.github/workflows/ci.yml`; Zod env schema `lib/env.ts` (tests/unit/env.test.ts) |
| Security headers, nonce CSP | Verified | `proxy.ts`, `lib/security/headers.ts`; Playwright CSP checks with zero violations (shell, setup and admin specs, three engines) |
| Design system and responsive shell | Verified (shell only) | Khata tokens and fonts `app/globals.css`, `config/fonts.ts`; header, dock and footer `components/shell/*`; tests/e2e/shell.spec.ts at 375/767/768/1024/1280/1440. Motomation gate on `/` **FAIL** (S4 and forms 72); assigned to B5 (see below) |
| Banglish (bn-Latn) and English localisation; English-only admin | Verified (shell, states, storefront, e-mails) | `messages/bn.json` (Latin-script Banglish), `messages/en.json`, `/` and `/en` routing; guard tests/unit/banglish.test.ts; e2e |
| Storefront catalogue (B5) | Verified locally, not deployed | `lib/modules/storefront/catalogue.ts`, `app/[locale]/{c,p,search,categories,collections,deals,new}`; tests/integration/storefront.test.ts, tests/e2e-db/storefront.spec.ts. Leftovers: search suggestions, mega-menu, `/preorder` (HANDOFF) |
| Catalogue images | Missing | 0 of 144 products have media; policy conflict recorded in HANDOFF item 3 |
| Error, offline, maintenance, setup states | Verified | `app/[locale]/error.tsx`, `not-found.tsx`, `offline/`, `lib/maintenance.ts` (503 + Retry-After), `SetupRequired` with the checked database state; tests/e2e/maintenance, setup-required, shell |
| Loading and empty states for data | Missing | No data pages exist yet (B5+) |
| Homepage product discovery | Missing | `/` shows setup-required; phase B5 |
| Category navigation, listings | Missing | `/categories`, `/c/*` show setup-required (real routes, no fake content); B5 |
| Product detail (price, stock, variants, images) | Missing; Blocked for real data | B5. D11: catalogue records, prices, images and compliance are unapproved for production; since 2026-10-22 they are loaded into `horekbazar_dev` as `sample: true` drafts for admin testing (DATA.md) |
| Search, filter, sort, pagination | Missing | B5. The header search form submits to `/search`, which shows setup-required |
| Cart | Missing | B6 |
| Checkout, COD, delivery address | Missing; Blocked | B7; addresses wait for D12 or D21 |
| Order confirmation, history, tracking, cancellation | Verified (local); not deployed | B7 (confirmation, history, cancel); B8 tracking from recorded checkpoints and the entered tracking link (`app/[locale]/account/orders/[orderNumber]/page.tsx`); tests/e2e-db/commerce/fulfilment.spec.ts |
| Shipments, courier, returns (B8) | Verified (local, Steadfast against a stubbed API only); not deployed; collections migrated on `horekbazar_dev` 2026-10-22 | `lib/modules/fulfilment/*`, `lib/adapters/courier/*`, `app/api/webhooks/courier/[provider]`, `/admin/shipments`, `/admin/returns`; tests/integration/{fulfilment,courier-webhook-route}.test.ts, tests/unit/fulfilment.test.ts, tests/e2e-db/commerce/fulfilment.spec.ts. Pathao **Blocked** (D12); RedX unsupported; Steadfast live calls need the owner's keys |
| Customer accounts, authentication | Verified (local); deployed without a database | B3 (`main` `a8a26a6`): Better Auth 1.7.12, email + password, verification, reset, optional Google, sessions page (`app/[locale]/{login,register,forgot-password,reset-password,verify-email,account}`); tests/unit/identity.test.ts, tests/integration/identity.test.ts, tests/e2e/identity.spec.ts. Email delivery needs a verified Resend domain |
| First-Owner bootstrap, staff authorisation | Verified (local); deployed without a database | `/admin/setup` (D23 option a + proposed `SETUP_TOKEN`), `/admin/staff`, `/admin/security` (TOTP, step-up, second factor); capability checks on the server in `lib/auth/server.ts` and `lib/actions/admin.ts`; built-in roles migration applied on `horekbazar_dev`. No Owner created yet (owner step) |
| Product, category, inventory, media admin | Verified (local); not yet deployed with a database | B4 (2026-10-22): `app/admin/{products,categories,inventory,collections,banners,homepage,settings}`, `lib/actions/{catalogue,merch}.ts`, `lib/modules/{catalogue,settings,merch}/`, `/api/media/sign`; tests/integration/{catalogue,settings-merch,seed}.test.ts, tests/unit/{admin-forms,settings,media}.test.ts, tests/e2e-db/catalogue-admin.spec.ts (signed-in CRUD in Chromium), tests/e2e/admin.spec.ts. Uploads need Cloudinary credentials; integrations settings deferred |
| Reviews (one per order line), rewards ledger (derived balance, per-customer lock), messaging (B9) | Verified (local); not deployed; collections migrated on `horekbazar_dev` | `lib/modules/{reviews,rewards,messaging}/*`, `lib/actions/{engagement,admin-engagement}.ts`, `/account/{reviews,messages,rewards}`, `/admin/{reviews,messages,rewards}`; tests/integration/engagement.test.ts, tests/unit/engagement.test.ts. Reviews and rewards off by default. Not done: redemption at checkout, expiry job, review photos, rating JSON-LD |
| Push, campaigns, AI drafts (B9 remainder) | Missing | Push needs the D3 library fit check; AI drafts per SCHEMA in B10 |
| Email and notifications | Partial; Blocked for delivery | Identity emails (verify, reset, staff invite; bn/en) through the outbox with inline delivery (`lib/adapters/email/`, `lib/modules/identity/mail.ts`). Not delivered until a Resend domain is verified; order notifications are B9 |
| Database port, topology check | Verified | `lib/adapters/db/client.ts`; standalone refused (tests/integration/topology.test.ts) |
| Validators, migrations, indexes | Verified (platform, identity, catalogue, settings, merchandising: 16 validators; applied on `horekbazar_dev` 2026-10-22) | `lib/db/*`, `db/validators/*`; tests/integration/migrate.test.ts (live compare, invalid insert, collMod, run-once). Commerce collections arrive with B3–B8 |
| Outbox, leases, retries, observability | Verified | `lib/modules/platform/outbox.ts`; tests/integration/outbox.test.ts, drain-route.test.ts; health in `lib/platform/health.ts`. No handlers exist yet |
| Audit log | Partial | Staff, setup, recovery and 2FA actions are audited (tests/integration/identity.test.ts); `/admin/audit` viewer is B10 |
| Rate limiting | Verified (local) | Sign-in, registration, reset, verification resend and setup limited per IP and per email (`lib/modules/identity/limits.ts`); fails closed in production without Upstash. Upstash adapter not tested against a live instance in CI |
| Health checks without secrets | Verified | `/api/health` (names and states only); `/admin/health` needs the `platform.read` capability in every environment (development-open mode removed); tests/unit/health.test.ts, tests/e2e/admin.spec.ts |
| Secrets out of the client bundle | Verified | `npm run check:bundle` with canary values (CI) |
| Setup page exposes variable names publicly | Partial (known) | Names only, never values; restricting to staff is planned with B3 (BUILD-PLAN) |
| SEO: titles, descriptions, canonical, hreflang, JSON-LD | Missing | B5. Current pages are noindex setup states |
| robots.txt, sitemap.xml | Missing | Both 404. BUILD-PLAN §SEO: per-environment robots (preview disallows all) and a typed sitemap, B5 |
| Accessibility | Partial | Shell: focus, targets, reflow, contrast, forced colours via gate and e2e; no axe or screen-reader pass yet |
| Performance | Unverified | No production measurement yet; gate perf on the dev server is not representative |
| Production readiness | Missing | B11, and the open owner decisions below |

## Blockers and owner decisions

| Item | State | What is needed |
|---|---|---|
| B3 approval | approved 2026-10-21; merged | PR #4. B4 needs its own approval |
| D23 first-Owner verification | default (a) implemented; owner confirmation pending | `SETUP_TOKEN` and `secondFactorAt` are proposed additions (DESIGN.md Decision trace). Original options: (a) require a configured email provider before `/admin/setup` completes: strongest proof of inbox control and recovery by email, but setup is blocked until Resend is verified. (b) audited `npm run owner:verify -- <email>` run by the deployer: no email dependency, but trust shifts to whoever has shell or database access, and password recovery still needs email later |
| D19 development database | in use: `horekbazar_dev`, migrated (owner approved) | The database user still has `atlasAdmin@admin`; create a least-privilege user (`readWrite` on `horekbazar_dev` only) and keep production on a separate cluster |
| Rotate pasted credentials | required | Every value pasted into the chat on 2026-10-21 (Atlas, Upstash, Cloudinary, Resend, Gemini, Ably) is compromised and must be rotated |
| Vercel access and canonical project | blocked | Re-authorise the agent's Vercel connection with access to `dev-choice`, and say which project (`horekbazar` or `horekbazar-preview`) is canonical |
| `main` not deployed | owner action | Vercel → canonical project → Deployments → Redeploy `main` (`a22f81b`), or a new push to `main` |
| Resend sender | blocked | Verify a domain the owner controls; `EMAIL_FROM` must use it |
| D11, D12/D21, D5, D20, D22, coupon restoration on cancel | open | As recorded in BUILD-PLAN §13. D12 also blocks Pathao booking (city/zone/area ids) |
| B8 approval and courier credentials | owner action | Approve B8; to use Steadfast set `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY` (and `COURIER_WEBHOOK_SECRET`, already supplied for development) per environment and the callback URL in the Steadfast portal; `horekbazar_dev` is migrated, other databases need `db:migrate` |
| Credentials pasted in chat (again 2026-10-22) | required | The development values pasted on 2026-10-22 (MongoDB, Upstash, Cloudinary, Resend, Gemini, Ably, VAPID, auth, setup, cron, webhook) are exposed in the chat; rotate before any production use. The Resend key is send-only and `onboarding@resend.dev` delivers only to the Resend account owner |
| `experimental.authInterrupts` | proposed | Rationale in the DESIGN.md Decision trace |
