# HorekBazar: verified status

Audit of 2026-10-21 (Asia/Dhaka), made from a fresh `git fetch` with every check re-run in the agent
sandbox (Node.js 24.22.1). The approved scope is `DESIGN.md` plus `docs/BUILD-PLAN.md` §11
(phases B0–B11). No completion percentage is given because the phases have no agreed weighting.

Status values: **Verified** (implemented and verified), **Unverified** (implemented but not
verified), **Partial**, **Missing**, **Blocked** (by an owner decision or credentials), **N/A**.

## Repository and deployment

| Item | Observed |
|---|---|
| `main` | `a22f81b` (merge of PR #2: B2). PRs #1 and #2 merged; none open before this audit |
| `preview/horekbazar-v1` | `a22f81b` + docs commits (progress and this audit) |
| CI on `main` | **none**: GitHub's activity log has no entry for the PR #2 merge (nor for the `a7b4a64` push), so no Actions run and no Vercel build started. PR #1's merge was recorded normally. CI on preview commits passed; one WebKit focus test failed once on PR #3 and passed on re-run (intermittent) |
| Canonical deployment | **Not determined.** `dev-choice` has two Git-connected projects, `horekbazar` and `horekbazar-preview`. `https://horekbazar-preview.vercel.app` serves **B1**: `/admin/health` and `/api/jobs/drain` return 404, so it is not `a22f81b`. The deployed SHA cannot be read: the agent's Vercel token gets 403 on `dev-choice` (CLI and REST API) |
| Local re-run | lint OK; typecheck OK; unit 74/74; `db:validators --check` OK; integration 24/24 (disposable MongoDB 8.0.4 replica set); catalogue checks OK; zero-variable `next build` OK; Playwright 134 passed, 58 skipped (opt-in screenshots and the WebKit maintenance check), 0 failed |

## Requirements

| Area | Status | Evidence / reason |
|---|---|---|
| Project foundation, dev environment | Verified | Pinned versions in `package.json` and `package-lock.json`; `npm ci`; CI `.github/workflows/ci.yml`; Zod env schema `lib/env.ts` (tests/unit/env.test.ts) |
| Security headers, nonce CSP | Verified | `proxy.ts`, `lib/security/headers.ts`; Playwright CSP checks with zero violations (shell, setup and admin specs, three engines) |
| Design system and responsive shell | Verified (shell only) | Khata tokens and fonts `app/globals.css`, `config/fonts.ts`; header, dock and footer `components/shell/*`; tests/e2e/shell.spec.ts at 375/767/768/1024/1280/1440. Motomation gate on `/` **FAIL** (S4 and forms 72); assigned to B5 (see below) |
| Bengali and English localisation | Verified (shell and states) | `messages/bn.json`, `messages/en.json`, `/` and `/en` routing (tests/unit/locales.test.ts, e2e) |
| Error, offline, maintenance, setup states | Verified | `app/[locale]/error.tsx`, `not-found.tsx`, `offline/`, `lib/maintenance.ts` (503 + Retry-After), `SetupRequired` with the checked database state; tests/e2e/maintenance, setup-required, shell |
| Loading and empty states for data | Missing | No data pages exist yet (B5+) |
| Homepage product discovery | Missing | `/` shows setup-required; phase B5 |
| Category navigation, listings | Missing | `/categories`, `/c/*` show setup-required (real routes, no fake content); B5 |
| Product detail (price, stock, variants, images) | Missing; Blocked for real data | B5. D11: catalogue records, prices, images and compliance are unapproved; nothing imported |
| Search, filter, sort, pagination | Missing | B5. The header search form submits to `/search`, which shows setup-required |
| Cart | Missing | B6 |
| Checkout, COD, delivery address | Missing; Blocked | B7; addresses wait for D12 or D21 |
| Order confirmation, history, tracking, cancellation | Missing | B7, B8 |
| Customer accounts, authentication | Missing; Blocked | B3. The owner said "not yet"; D23 undecided |
| First-Owner bootstrap, staff authorisation | Missing; Blocked | B3. Until then every admin capability is denied in production (`lib/platform/access.ts`; e2e 403 on `/admin/health`) |
| Product, category, inventory, media admin | Missing | B4 (depends on B3) |
| Email and notifications | Missing; Blocked | B3/B9. Resend key is send-only and `EMAIL_FROM` is a gmail.com address; Resend needs a verified domain |
| Database port, topology check | Verified | `lib/adapters/db/client.ts`; standalone refused (tests/integration/topology.test.ts) |
| Validators, migrations, indexes | Verified (platform collections) | `lib/db/*`, `db/validators/*`; tests/integration/migrate.test.ts (live compare, invalid insert, collMod, run-once). Commerce collections arrive with B3–B8 |
| Outbox, leases, retries, observability | Verified | `lib/modules/platform/outbox.ts`; tests/integration/outbox.test.ts, drain-route.test.ts; health in `lib/platform/health.ts`. No handlers exist yet |
| Audit log | Partial | Writer verified (tests); no staff writes exist to audit yet; `/admin/audit` is B10 |
| Rate limiting | Partial | Port verified with unit tests; fails closed in production without Upstash; no consumer yet (B3 sign-in). Upstash adapter not tested against a live instance in CI |
| Health checks without secrets | Verified | `/api/health` (names and states only), `/admin/health` (403 in production); tests/unit/health.test.ts "never includes a configured value" |
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
| B3 approval | not approved ("not yet") | Every later phase depends on B3: B4 and B10 directly, B5–B9 through B4 |
| D23 first-Owner verification | open | (a) require a configured email provider before `/admin/setup` completes: strongest proof of inbox control and recovery by email, but setup is blocked until Resend is verified. (b) audited `npm run owner:verify -- <email>` run by the deployer: no email dependency, but trust shifts to whoever has shell or database access, and password recovery still needs email later |
| D19 development database | chosen: Atlas dev cluster; not supplied | A cluster separate from production, with a least-privilege user (`readWrite` on its database only). The previously supplied user has `atlasAdmin@admin` and is labelled production: not used for development, `db:migrate` not run |
| Rotate pasted credentials | required | Every value pasted into the chat on 2026-10-21 (Atlas, Upstash, Cloudinary, Resend, Gemini, Ably) is compromised and must be rotated |
| Vercel access and canonical project | blocked | Re-authorise the agent's Vercel connection with access to `dev-choice`, and say which project (`horekbazar` or `horekbazar-preview`) is canonical |
| `main` not deployed | owner action | Vercel → canonical project → Deployments → Redeploy `main` (`a22f81b`), or a new push to `main` |
| Resend sender | blocked | Verify a domain the owner controls; `EMAIL_FROM` must use it |
| D11, D12/D21, D5, D20, D22, coupon restoration on cancel | open | As recorded in BUILD-PLAN §13 |
| `experimental.authInterrupts` | proposed | Rationale in the DESIGN.md Decision trace |
