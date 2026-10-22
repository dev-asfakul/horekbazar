# Progress log

Newest first. Each entry: date, phase, done, decided, open, next.

## 2026-10-22 — Showcase live: Owner, settings, published catalogue, stock, images; skeletons; confirm password

- **Owner:** "i shared env variable for you ... i am using them for showcase"; "there is no skeleton/loader while changing page"; "even in signup page, there is no confirm password".
- **Showcase (`horekbazar_dev`, verified by query):** Owner created through the live `/admin/setup` (mail.horekbazar@gmail.com; verification e-mail sent; owner sets their password with Forgot password). `npm run showcase`: settings, zones ৳60/৳120, 39/39 categories and 144/144 products published, 214 stock rows = 214 ledger receipts (21 variants left at 0). `npm run showcase:images`: 51 products with a reviewed CC0/public-domain photo in Cloudinary, all 51 resolve, rights/alt/size on each; the other 93 keep the label tile. 870 audit entries. Live `/api/health`: `setupRequired:false`.
- **Skeletons (PR #18, main `d811fa9`):** static `loading.tsx` on every data-backed page; measured on the live site: listing/product skeleton 70–110 ms after a click; 404s stay 404. Router prefetches now pass the proxy (they used to 404).
- **Confirm password:** sign-up, reset, change, Owner setup; server refuses a mismatch (checked live: "দুটি পাসওয়ার্ড মেলেনি").
- **This PR:** header shows the saved store name (was always "নতুন স্টোর"); product page says the photo is illustrative; image script and list.
- **Checks:** lint, typecheck, unit, build, Playwright 215 passed / 0 failed, e2e-db 11 passed / 1 skipped (sign-up needs e-mail; verified live), CI green on #18/#19.
- **Next:** B6 cart → B11. Rotate the credentials pasted in chat before production.

## 2026-10-22 — Banglish corrected to Bengali script

- **Owner:** "why banglish like in english? banglish mean, english in bangla, like, সেটআপ বাকি"; also asked why the preview still shows the setup page.
- **Done:** all 272 shopper strings rewritten in Bengali-script Banglish; `lang="bn"`, Bengali font preload, Bengali digits, default store name হরেকবাজার, Bangla e-mails and error pages; storefront shows stored Bangla product/category names on `/`. Guard test rewritten. Admin unchanged (English).
- **Setup page:** shown because `horekbazar_dev` has no Owner and no saved settings (the catalogue is there: 39 categories, 144 products, all draft). Creating the Owner is the owner's step (no default account is created by agents).

## 2026-10-22 — Banglish storefront, B4 bulk status, B5 storefront catalogue

- **Owner input:** build all remaining stages; storefront in natural Latin-script Banglish, `/en` English, admin English only, no Bengali-script third option; preserve catalogue data; then: populate a realistic catalogue with Cloudinary images, verify the admin on persisted data, continue the phases, push with proper commits and write a handoff.
- **Banglish (PR #11, merged into `preview/horekbazar-v1`, `cbf8471`):** see HANDOFF "Session 2026-10-22". Supersedes `e517154`. Decision row in DESIGN.md.
- **B4 gap (PR #12):** bulk product status on `/admin/products` (contract item that was missing).
- **B5 (branch `feat/b5-storefront`):** readiness check, storefront read model, nine storefront routes, SEO, sitemap, robots, text index; integration and browser tests. Deviation (proposed): native `<details>` filters and the `/categories` page instead of Radix FilterSheet/MegaMenu (no UI library in the project).
- **Checks:** lint, typecheck, unit 112/112, integration 88/88, build, Playwright 215/58 skipped/0 failed, `test:e2e:db` 10/10.
- **Merged into `preview/horekbazar-v1`:** #11 (`cbf8471`), #12 (`1468fb3`), #13 (B5), each after CI `check` and Vercel success. `main` untouched (owner merges).
- **Gate** (zero-variable build, `http://127.0.0.1:3000/`): FAIL, exit 1, 384 s. SEO seo-03/04/06/18 are measured on the setup-required `/` (noindex by design); the real home has canonical, description and JSON-LD (e2e-db SEO test) but no og:image yet. Journey: 80 header search form states, 1 error state. Completeness items for B6–B11.
- **Main:** PR #14 (`preview/horekbazar-v1` → `main`) merged `376decc` on the owner's instruction; post-merge CI success; Vercel success; live preview serves Banglish (`lang=bn-Latn`), `/api/health` database connected, setupRequired true (no Owner yet). PR #10 auto-marked merged.
- **Database:** `db:migrate` on `horekbazar_dev` OK. Mistake caught and reverted: a first run without `MONGODB_DB` created the default database `horekbazar` (7 documents of its own); verified and dropped.
- **Not done:** catalogue images and enrichment (policy conflict recorded in HANDOFF), Owner setup (owner action), B6–B11.
- **Next:** merge #12 and the B5 PR after CI; owner creates the Owner and publishes; images per HANDOFF item 3; B6.

## 2026-10-22 — Owner-supplied environment, Owner setup verification, Banglish audit (no application code changed)

- **Owner input:** environment values for the showcase deployment ("horekbazar"), to be used locally too; "use seed data and push to database directly"; customer copy to be "Banglish-first"; Owner setup and password-security requirements. Values were pasted in chat, so they count as exposed: rotate before any production use.
- **Local environment:** `.env.local` written in the sandbox only (mode 600; git-ignored by `.env.*`; `git ls-files` confirms untracked). Never committed or printed.
- **Database (read-only checks):** the URI's database is `horekbazar_dev` on cluster `horekbazar.5d2bdw0`; the sandbox resolver cannot answer SRV, so a standard seed-list URI from public DNS (DoH) was used in memory. 21 collections; 39 categories, 144 products (all `draft`, `sample: true`), 235 variants, 235 stock rows (0 with stock on hand), 418 audit entries, 0 users, 0 settings, 6 staff roles. The user still has `atlasAdmin@admin`. `npm run db:seed` (dry run) on `horekbazar_dev`: 0 to create, 39/144/235 already present, so `--confirm` was not run (nothing to write). No product, variant or category text contains demo/mock/dummy/fake/placeholder/lorem/test/sample/example; the `sample` flag is internal (admin filter, publish guard, removal) and not shown to shoppers.
- **Services (read-only):** Upstash `PING` → `PONG`; Cloudinary Admin `ping` → 200; Ably `/time` with the key → 200; Resend key is send-only (`restricted_api_key`), so domain status cannot be read with it. `EMAIL_FROM` is `onboarding@resend.dev`, which Resend delivers only to the Resend account owner's address.
- **Owner setup:** implemented (B3, D23) and verified locally end to end, 19 checks; details and the owner's steps are in `docs/OWNER-SETUP.md`. Found on the way: email is sent inline at queue time (`runOutboxJobNow`), not only by the drain, so an early local run made one send attempt to an `example.test` address, which Resend rejected; later runs used a non-working key. `setupRequired` in `/api/health` stays `true` until settings also exist (by design). No Owner was created on `horekbazar_dev`.
- **Banglish:** audit and proposal in `docs/BANGLISH-PROPOSAL.md`; owner decisions L1–L5 there. No copy changed.
- **Next:** owner decisions (Banglish scope, `e517154`, preview database, visibility); Owner created by the owner; B5 needs approval.

## 2026-10-22 — Takeover audit and B4 closeout check (no application code changed)

- **Scope:** new agent takeover. Read-only audit of repository, CI, deployment and gate; this docs-only branch `docs/takeover-audit-2026-10-22` from `main` `f7ca4ea`. B5 not started (not approved).
- **Repository:** `main` = `f7ca4ea` (matches the B4 handoff). `preview/horekbazar-v1` = `e517154`, one commit ahead of `main` and 0 behind: Bangla copy rewrite in `messages/bn.json` (+ one `en.json` aria label). Its CI `check` and Vercel preview succeeded, it has no PR and no PROGRESS entry, and no owner instruction for it is recorded. Preserved untouched; key sets in `bn.json`/`en.json` match (735 each). PRs #1–#9 merged, none open.
- **Motomation:** `npx skills add asfakulsiam/asfakulsiam-motomation-design -y` installed v3.0.2, byte-identical to upstream `1a22531`, `computedHash` equal to `skills-lock.json`. The installer rewrote the lock's `source` to the agent git proxy; that change was reverted (the lock is unchanged).
- **Checks on `e517154` (Node 24.22.1):** lint OK; typecheck OK; unit 107/107; `db:validators --check` OK; `catalogue:validate` OK; integration 81/81; zero-variable build OK; `check:bundle` OK; Playwright 215 passed, 58 skipped (opt-in screenshot suite; WebKit maintenance check), 0 failed; `test:e2e:db` 2/2.
- **Gate:** `node .agents/skills/asfakulsiam-motomation-design/scripts/gate.mjs http://127.0.0.1:3000 --no-record` (zero-variable standalone): **FAIL, exit 1**, 377 s. Re-run with `http://127.0.0.1:3000/`: **FAIL, exit 1**, 379 s; session 6/6.
  - Back-button finding resolved as a gate artefact, not an app defect. `sessionAxis` compares `page.url()` with the raw `home` argument; without a trailing slash Chromium reports `http://127.0.0.1:3000/` and the string compare fails. Probe calling the skill's own `sessionAxis` on `/` → `/categories`: `ok:false` with `http://127.0.0.1:3000`, `ok:true` with `http://127.0.0.1:3000/`. Run the gate with a trailing slash. The skill is not modified.
  - Remaining failures: SEO seo-03/04/06/18 on the setup-required `/` (noindex by design; real home metadata is B5); journey forms 80 missing states, all the native header search form (B5 search); completeness functions 0/8, states 2/11, edge cases 0/10, skeletons 0/6 (B5–B11); template 13/22 (`GATE.md`, `CRITIQUE.md`, `LICENSE`, `CHANGELOG.md`, `MEDIA.md`, `data/`: B11). No finding is a B4 defect.
- **Preview (`https://horekbazar-preview.vercel.app`, external probe):** `/api/health` now `database: connected`, `setupRequired: true` (was `not_configured`). `/admin/setup` renders the Owner form with no blockers, so the database, auth secret, email and `SETUP_TOKEN` are set there; no Owner and no settings exist yet. `/api/media/sign`: no Origin → 403 `cross_origin`; foreign Origin → 403; same Origin signed out → 401 `signed_out`. The earlier 403 is the intended same-origin check. Admin routes redirect to `/login`. Not verified: which database the deployment uses, Cloudinary, Resend domain, any signed-in workflow on the preview.
- **Security review:** every admin page calls `adminPage` → `gateStaffPage`; all 31 catalogue/merch actions call `staffContext`, staff actions call `staffActor`, account actions require a session; setup token compared with `timingSafeEqual` after a rate limit. Repository public; secret scanning and push protection enabled, 0 alerts; Dependabot security updates disabled.
- **Risk found:** the sample publish guard keys on the database name (`_dev`). If the public preview deployment points at `horekbazar_dev`, sample products can be published there and, from B5, shown publicly. Owner to confirm the preview database (recommend a separate `horekbazar_preview`).
- **GitHub plan (docs.github.com, 2026-10-22):** Pro gives branch protection on private repositories, but secret scanning on a user-owned private repository is not available on Pro (needs an organisation on Team with Secret Protection, or Enterprise). The HANDOFF option "upgrade then go private" keeps protection, not secret scanning.
- **Open:** owner decisions as before (D12/D21, D5, D20, D22), visibility, canonical Vercel project, preview database identity, status of `e517154`, credential rotation.
- **Next:** owner answers; B5 needs explicit approval.

## 2026-10-22 — Phase B4: catalogue administration (branch `preview/horekbazar-v1`; PR to `main`)

- **Owner instruction:** "OWNER APPROVAL CONFIRMED: BEGIN B4" (private repository approved; B4 approved; B5+ not approved), then the D11 change "for catelog source generate some catalogue source data and push to database, and admin will curd them for real and test", and "push latest and complete codebase after complete any step … summery for next agent".
- **Start / commits:** start = `main` `953eb4a`. Commits: `c000e70` plan, `9afbc15` catalogue domain, `ec88091` settings and merchandising, `ebc14ce` media, `8935237` admin pages and actions, `0e9bd01` sample seed, `9fdc7e9` signed-in e2e, then this docs commit. PR #8 (head `013f928`; CI `check` pass, including the new signed-in suite 2/2) merged as `04158f2`; post-merge CI `push` on `04158f2` success; Vercel `horekbazar-preview` status success on `04158f2`, and https://horekbazar-preview.vercel.app/api/media/sign answers 403 `cross_origin` (B4 code is live; database still `not_configured`, so the admin cannot be used there).
- **Built:**
  - Catalogue domain (`lib/modules/catalogue/`): categories (depth ≤ 3, cycle check under a tree lock), products and variants (optimistic `version`, slug frozen after first publish, publish needs a published category and an active variant priced above 0, compare-at must be higher than the price), stock and an idempotent inventory ledger (receive, adjust with a reason), delete only if never published and no ledger rows. Every write is audited.
  - Settings (single document; brand accent rejected below 4.5:1; delivery zones without area mapping until D12) and merchandising (manual collections, banners, six homepage section types).
  - Media: `/api/media/sign` (same origin, `catalogue.write` or `merch.write`, folder-scoped, type and size allow-list, short-lived) and the Cloudinary uploader; product images record alt text in both languages and the rights source.
  - Admin pages: products (list with search, status, category and sample filters, pagination; create; editor with LabelTile preview, status, details, SEO, variants, images, delete), categories, inventory (step-up), collections, banners, homepage, settings, delivery. `/admin/settings/features` is folded into `/admin/settings`; `/admin/settings/integrations` is deferred (SCHEMA.md).
  - Authorisation: every page calls `gateStaffPage` with its section capability (`adminPageFor`); every server action re-checks the capability via `staffContext` (mutation; step-up where required). Prices are parsed from taka to integer paisa on the server; stock totals, roles and authorisation are never taken from the client.
- **Migrations (verified target):** `db:migrate` on `horekbazar_dev` (name printed by the script before writing) created `categories`, `products`, `variants`, `stock`, `inventoryLedger`, `catalogueLocks`, `settings`, `collections`, `homeSections`, `banners`, with validators and indexes. 16 validators; `db:validators --check` in CI.
- **Sample data (D11 change):** `npm run db:seed` loads `catalogue/horekbazar/` through the services into `_dev` databases only. On `horekbazar_dev`: dry run 39/144/235 to create; `--confirm` created 39 categories, 144 products and 235 variants. An independent count found all records `sample: true`, 0 published, 235 stock rows all at 0, 0 ledger rows and 418 audit rows by `system:db-seed`; a second dry run had 0 to create. Provenance: generated by the agent 2026-10-21; prices are TCB references or estimates (not selling prices); no images; net quantities unverified.
- **Checks (agent sandbox, Node 24.22.1):**
  - Lint 0 problems; typecheck OK; unit 107/107; integration 81/81 (disposable MongoDB 8.0.4 replica set; seed suite 5/5); zero-variable `next build` OK.
  - Playwright zero-variable: 215 passed, 58 skipped, 0 failed. The 58 skips are the same opt-in screenshot suite and WebKit maintenance check as before.
  - `npm run test:e2e:db`: 2/2 passed. This is the production build with an in-memory replica set: a catalogue editor creates and publishes a category, creates a product (LabelTile, no stock image), is refused publish without a variant, adds a variant (1250.50 taka → 125050 paisa, stock 0), publishes, lists it, and the audit rows exist. The nav hides other sections, and the server answers 403 for `/admin/inventory` and `/admin/settings`.
- **Motomation gate:** `gate.mjs http://127.0.0.1:3000 --no-record` (zero-variable standalone) gave **FAIL, exit 1**.
  - Page checks pass: contrast, overflow, focus 12/12, targets, zoom, reflow, forced colours, keyboard trap, copy, performance and security.
  - Failing: SEO seo-03/04/06/18 on the setup-required `/` (B5); journey forms 80 missing states from the header search form (native submit, B5); the session back-button check ("back went to /"). A manual Chromium probe of the same sequence returns to the previous page, and B4 changed no storefront code; recorded, not fixed.
  - Completeness: routes 33/33, admin 29/29, template 13/22 (GATE.md, CRITIQUE.md, LICENSE, CHANGELOG.md, MEDIA.md and `data/` are not present). Functions, states, edge cases and skeletons belong to B5–B11.
  - The B4 run first flagged `.env.example` coverage (the new test variables) and a component header. Both were fixed and the re-run no longer lists them. Admin pages need a session, so the gate cannot reach them; the signed-in admin is covered by `test:e2e:db` instead.
- **Fixed on the way:** `CatalogueError` used TypeScript parameter properties, which Node's type stripping rejects in scripts. The e2e harness deadlocked with a synchronous child process (the in-memory mongod's pipe filled up), so it now spawns asynchronously.
- **Correction:** older entries and HANDOFF said B4 waited for a D11 answer. The owner approved B4 and changed D11 on 2026-10-22 (above), so that statement is superseded.
- **Repository visibility:** held. Secret scanning and push protection are enabled (verified). The repository stays public because on GitHub Free a private personal repository loses branch protection and secret scanning; the owner chooses (HANDOFF).
- **Open:** D12/D21, D5, D20, D22; Cloudinary credentials (uploads show a notice until set); owner-set delivery fees; real catalogue approval (stages 2–4 in `catalogue/horekbazar/IMPORT.md`).
- **Next:** owner actions in docs/HANDOFF.md; B5 needs its own approval.

## 2026-10-22 — Takeover audit after B3; dock focus defect fixed (no new phase)

- **Owner instruction:** the "Master handoff & implementation prompt" (audit, verify Motomation, establish the baseline, fix what is safe, then ask for B4 approval). B4 was **not** started.
- **Verified repository state:** `main` = `7adc38f` (merge of PR #6); `preview/horekbazar-v1` was level with `main`; PRs #1 to #6 merged, none open; no uncommitted work. Branch protection on `main`: required check `check`, enforced for admins, no force pushes, 0 required reviews. Repository visibility is **public**, while AGENTS.md says private. GitHub secret scanning and push protection are **disabled**. A pattern scan of the full Git history for credentials found only three test fixtures (localhost, a `.invalid` CI canary and a sanitiser test string), no real credential.
- **Motomation:** `asfakulsiam-motomation-design` 3.0.2 at `.claude/skills/` (git-ignored), identical file-for-file to the upstream clone at `1a22531` (2026-10-19); `skills-lock.json` unchanged. Not modified.
- **Baseline (agent sandbox, Node 24.22.1, on `7adc38f`):** `npm ci` OK; lint OK; typecheck OK; unit 86/86; `db:validators --check` OK; integration 39/39 (MongoDB 8.0.4 replica set); zero-variable build OK; Playwright 179 passed, 58 skipped, 0 failed. The 58 skips are the opt-in screenshot suite (`SCREENSHOTS=1`) and the WebKit-only maintenance check skip documented in tests/e2e, unchanged since B1.
- **Intermittent WebKit 375 px focus test: root cause found and fixed in the product.** After a text field loses focus the dock slides back over 200 ms (`transform` transition), and its links become focusable at once (`inert` lifted). A keyboard user who reaches the dock during the slide had the focused link partly below the screen. Probe (Chromium, 375 × 812): focused link bottom 869, 857, 825, 819, 815, 814, 812 px over about 150 ms. That matches the recorded CI failure (831.5 > 812.5) and is a WCAG 2.4.11 defect, not just a slow test. Fix: `.bottom-dock:focus-within { transition: none; transform: none; }` in `app/globals.css`, so focus inside the dock shows it at once. New deterministic regression test in tests/e2e/shell.spec.ts ("focus entering the dock right after the search field is fully visible at once", dock viewports only). Evidence: without the fix the new test fails on 2 of 3 engines (bottom 851.0 and 831.4 px); with the fix, both dock tests pass 60/60 (`--repeat-each=5`, three engines). The original assertion is unchanged and retries were not added.
- **Motomation gate on `/login`, rerun:** `node .claude/skills/asfakulsiam-motomation-design/scripts/gate.mjs http://127.0.0.1:3000/login --no-record` against a zero-variable standalone build finished in 6 min 16 s with **FAIL, exit 1**. The page-level checks pass: contrast 0 below AA at 375/390/768/1440, overflow 0, focus 12/12 visible, targets 0 under 24 px, zoom 200 % 0 lost, reflow 0, forced colours 0, keyboard trap none, copy 0, performance 0, security 0. Failing: SEO seo-03 (noindex, intended for a private page), seo-04 (no canonical), seo-18 (no og:image); journey forms 80 missing states, all from the header search form (native submit, B5); completeness and template inventory (routes 33/33, admin 29/29; functions, states, edge cases, skeletons and template files are B5 to B11 scope). Yesterday's timeouts (exit 3) happened only with the server connected to the Atlas development database from this sandbox; with no database the gate completes, so that run is not repeated here.
- **Deployment:** GitHub reports CI `push` success for `a8a26a6`, `67e5042` and `7adc38f`, and a Vercel `success` status for `7adc38f` on project `horekbazar-preview`. https://horekbazar-preview.vercel.app/api/health still reports `database: not_configured`; `/admin/health` answers 307 to login; `/admin/setup` 200 (lists missing variables by name only); `/robots.txt` 404 (B5). `https://horekbazar.vercel.app/` answers 404. The agent has no Vercel access (connector not connected; the earlier token got 403 on `dev-choice`), so environment scopes and the canonical project are not verified.
- **Authorisation re-check:** every admin page calls `gateStaffPage()` (index, health, security, staff and the catch-all); `/admin/setup` is intentionally ungated but refuses once an Owner exists and needs `SETUP_TOKEN`; every staff action in `lib/actions/admin.ts` goes through `requireStaff(capability)` plus step-up; customer account pages call `requireCustomer()`, and customer session revocation filters by the signed-in user's id.
- **Next:** owner approval for B4 and a D11 answer; the owner actions listed in docs/HANDOFF.md.

## 2026-10-21 — B3 merged to `main` and deployed (preview project)

- **Merge:** PR #4 merged by the agent on the owner's instruction ("pr and marge if margable") at 17:14:58 UTC, after every check passed on head `ec40573`: CI `check` on push and pull_request (unit 86/86, integration 39/39, Playwright 179 passed / 58 skipped / 0 failed), Vercel `horekbazar-preview` preview success. `main` is `a8a26a6`.
- **This time GitHub delivered the push:** CI `push` run on `a8a26a6` succeeded, and Vercel reported a completed deployment for `horekbazar-preview`.
- **Deployed behaviour (https://horekbazar-preview.vercel.app):** `/admin/health` answers 307 to `/login?next=%2Fadmin%2Fhealth` (B3 behaviour; B1 answered 404), `/api/auth/sign-in/email` 404 (auth HTTP API narrowed), `/login` 200, `/api/health` `{"setupRequired":true,"checks":{"database":"not_configured"}}`. So the deployment runs B3 code with **no database configured** on Vercel; nothing beyond setup-required works there until the owner adds the variables. Whether this project is the canonical production is still the owner's decision.

## 2026-10-21 — Phase B3: identity (built locally on `feat/b3-identity`, pushed to `preview/horekbazar-v1`, PR #4)

- **Owner instruction:** "yes … continue building" in answer to the B3 approval request and to running `db:migrate` on the development database `horekbazar_dev`. D23 was not answered explicitly, so the BUILD-PLAN default, **option (a) email verification**, is implemented, with the deployer's `SETUP_TOKEN` as an added, **proposed** hardening (see DESIGN.md Decision trace).
- **Built:**
  - Better Auth 1.7.12 (pinned) on the MongoDB port: email + password (scrypt hashing, Better Auth default), email verification, password reset, optional Google sign-in (hidden when unset), TOTP two-factor with backup codes, database sessions with `stepUpAt` and `secondFactorAt` fields.
  - Customer pages (bn and en): `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/account` (profile, sessions, sign out). Server actions in `lib/actions/identity.ts` with Zod validation, error summary and per-field errors, rate limits per IP and per email (`lib/modules/identity/limits.ts`).
  - Staff: capability model `lib/modules/identity/capabilities.ts`, built-in roles migration `0001-built-in-staff-roles` (`staffRoles` collection), `installation` singleton (written once with a fixed `_id`), first-Owner setup `/admin/setup` (email verification + `SETUP_TOKEN`, rate limited), staff management `/admin/staff` (invite, change role, reset 2FA, remove; each needs a fresh step-up and is audited), `/admin/security` (TOTP enrolment, second-factor challenge, step-up), admin index and navigation by capability.
  - Server enforcement: `gateStaffPage()` in `lib/auth/server.ts` on every admin page; every admin action re-checks the principal and capability on the server. `proxy.ts` only does a cookie-presence 307 to `/login?next=` (not an authorisation decision) and sets the `x-hb-path` request header so the 403 page can name the missing capability.
  - Owner recovery CLI `npm run admin:recover-owner` (audited, revokes sessions).
  - Email through the outbox (`lib/adapters/email/`, `lib/modules/identity/mail.ts`, bn/en templates in `emails.ts`) with inline delivery on request and outbox retry on failure.
  - Removed the development-open admin (`lib/platform/access.ts`, HealthView dev notice); `/admin/health` now needs `platform.read` like every other admin page.
- **Defects found by the tests and fixed:**
  - `verifyTOTP` returns the *old* session token, while it rotates the cookie; the new token is now read from `Set-Cookie` (`sessionTokenFromSetCookie`) before marking the second factor.
  - Google sign-in bypassed staff 2FA, because Better Auth only challenges the email/password path. Fixed with a `secondFactorAt` session field: staff with 2FA enabled are sent to `/admin/security` until the TOTP or backup code is verified in this session (**proposed**, DESIGN.md).
- **Correction to D7:** the capability table had `order_operator` as 2FA-required; DESIGN.md D7 requires it for Owner and Manager only. Changed to match D7.
- **Deviations noted:** Motomation rule sec-05 names bcrypt/argon2; Better Auth uses scrypt (memory-hard, OWASP-acceptable). Kept, recorded. No QR-code dependency: the TOTP secret is shown as text plus an `otpauth://` link. The Better Auth HTTP API is narrowed to the Google OAuth GET callback; everything else goes through server actions.
- **Database:** `db:migrate` on `horekbazar_dev` (owner approved): 11 collections created with validators and indexes, migration `0001-built-in-staff-roles` applied; second run a no-op. No Owner was created; that is the owner's step.
- **Evidence (agent sandbox, Node 24.22.1):** lint OK; typecheck OK; unit 86/86; integration 39/39 (disposable MongoDB 8.0.4 replica set; identity and migrate re-run 24/24 after the second-factor change); `db:validators --check` OK; zero-variable `next build` OK; Playwright (zero variables, Chromium, Firefox, WebKit) 178 passed, 58 skipped (opt-in screenshots and the WebKit maintenance check, as before), 1 failed: the known intermittent WebKit 375 px "keyboard focus is never hidden by the dock" test, which passed 12/12 with `--repeat-each=4`.
- **Live smoke (local production build against `horekbazar_dev`; this is not production):** `/api/health` database connected; `/admin/setup` renders the form with no blockers; `/login`, `/register`, `/forgot-password` render; `/account` and `/admin` answer 307 to login; empty submit shows the error summary and field errors; wrong credentials show the generic "no account" message.
- **Motomation gate:** **not verified** (exit 3, "sandbox too constrained"). `/login`: standard and light scans each timed out after 600 s; a control run on `/` (light, 240 s) also timed out, with the machine idle (load 0.02 to 0.84). The page itself reaches network-idle in 0.7 s in Playwright, so the stall is in the gate run in this sandbox, not in the page; `/admin/setup` and `--journey` were not run. The skill was not modified. Next agent: run `node .claude/skills/asfakulsiam-motomation-design/scripts/gate.mjs <url>` on a machine with more CPUs
- **Known gaps (not built in B3):** backup-code regeneration; an Owner action to revoke any staff member's sessions (role change and 2FA reset do revoke); customer Google sign-in is not 2FA-challenged (customers have no 2FA); the storefront `SetupRequired` page still shows variable names publicly (names only); Resend needs a verified domain before any email is delivered.
- **Next:** owner verifies a Resend domain, sets `SETUP_TOKEN`, creates the first Owner at `/admin/setup`, confirms D23 and the two proposals; then B4 (catalogue admin), which waits for its own approval and for D11.

## 2026-10-21 — Vercel deep check (read-only)

- **Network ruled out:** `api.vercel.com` resolves to the same address (76.76.21.112) via the system resolver and via Cloudflare DNS-over-HTTPS; it answers in 0.3 s; pinning the request to the Cloudflare-resolved address gives the same answer. The refusals are authentication responses, not connectivity.
- **Agent token:** `vercel whoami` now reports "The token provided via `--token` argument is not valid". This follows the re-authorisation the agent requested at about 14:44 UTC: the old token was retired and the new one has not been issued, because the owner has not finished the reconnection. Earlier, the same token was valid for user `dev-asfakul` but had no access to `dev-choice`.
- **Vercel's GitHub App, per commit (check-run app slugs):** `854cd70`, `28acdc5`, `41856d9`: `github-actions` + `vercel`. `a7b4a64` (pushed 14:47; GitHub logged the push event late, at 14:48:06, and Actions ran): **`github-actions` only**. `87e62d0` (14:53): nothing yet. The last Vercel reaction on GitHub was at 14:16:24 UTC. Vercel has created no GitHub Deployment records at any time.
- **`main` (`a22f81b`):** still absent from GitHub's activity log about 50 minutes after the merge, while later pushes do appear. So two separate faults: (1) GitHub never emitted a push for the PR #2 merge; (2) since about 14:16, Vercel's integration has not reacted to pushes that GitHub did deliver.
- **Not established:** the cause of (2). It is decided inside Vercel or the GitHub App installation, which the agent cannot read. Possibilities to check in the dashboard: the Git connection of `horekbazar-preview` (repository, production branch), the GitHub App's repository access, an ignored-build-step setting, or a change made while removing the second project `horekbazar` (it last built at 13:33).

## 2026-10-21 — Owner decision report: deployment evidence, D19/D23 guidance (no feature phase started)

- **Push events (GitHub activity API, `repos/…/activity`):** the PR #1 merge appears as `pr_merge refs/heads/main 0f35772`, and a CI `push` run exists for it. The PR #2 merge (`a22f81b`, 14:03 UTC) and the push of `a7b4a64` (14:47 UTC) **do not appear at all**, although `git ls-remote` shows both refs. Neither commit has an Actions `push` run or a Vercel status. Pull-request events were delivered (PR #2 `merged`, PR #3 `opened`, and its CI ran). GitHub status: operational. Conclusion: GitHub did not process these two ref updates as push events, so no consumer (Actions, Vercel) was notified. This is not a Vercel build failure. Why GitHub dropped them is not established from the repository side.
- Vercel: the agent's token now gets 403 even on `/v2/user`, not only on the `dev-choice` team. A re-authorisation was requested; nothing changed afterwards.
- **CI on PR #3 (docs only):** first run failed one WebKit test (`shell.spec.ts` "at 375 px › keyboard focus is never hidden by the dock": the focus box of the dock's Home link measured 831.5 > 812.5). The re-run of the same commit passed. Recorded as an **intermittent test** (`retries: 0`); not fixed, not weakened.
- Sandbox hygiene: the local `.env.local` holding the pasted (compromised) values and the agent-generated `AUTH_SECRET`/`CRON_SECRET`/VAPID keys was deleted. Treat those generated values as never issued.

## 2026-10-21 — Full audit (no feature phase started)

- **Owner instruction:** a full audit and completion request, explicitly *not* crossing approval gates; B3 stays unapproved.
- **State:** `main` = `a22f81b`. GitHub never recorded a push event for the PR #2 merge, so CI never ran on `main` and no production build started. `horekbazar-preview.vercel.app` still serves B1. The Vercel token gets 403 on `dev-choice` (CLI and REST); the agent asked the owner to re-authorise; still 403 afterwards.
- **Re-run, all passing:** lint, typecheck, unit 74/74, validators check, integration 24/24, catalogue checks, zero-variable build, and Playwright 134 passed / 58 skipped / 0 failed.
- **Findings:** no dead controls (header and dock links reach real routes that show setup-required); `/robots.txt` and `/sitemap.xml` return 404 (B5 scope per BUILD-PLAN SEO table); no new security defect found in B0–B2 code. The known item stands: the public setup page shows variable names, never values; this is restricted with B3. Full checklist: `docs/STATUS.md`.
- **Why no implementation:** every remaining phase depends on B3 (B4 and B10 directly; B5–B9 through B4), and each phase needs its own approval (BUILD-PLAN §0). Nothing was built ahead of approval.
- **Next:** owner answers on B3 + D23, the canonical Vercel project and a redeploy of `main`, the D19 dev cluster with a least-privilege user, and rotation of pasted credentials.

## 2026-10-21 — PR #2 merged; owner credentials received and checked

- **Merge:** PR #2 merged by the agent on the owner's instruction at 14:03 UTC, after every check passed on head `28acdc5` (CI `check` on push and pull_request: success; Vercel `horekbazar-preview` preview: success). `main` is now `a22f81b`.
- **Deployment of `main`: not verified.** 12 minutes after the merge GitHub had recorded no push event for `main`: no CI run, no Vercel status, no deployment. [githubstatus.com](https://www.githubstatus.com/) reported all systems operational. `https://horekbazar-preview.vercel.app` still serves B1 (`/admin/health` and `/api/jobs/drain` return 404). Nothing was forced. The owner can start it with Vercel → `horekbazar-preview` → Deployments → Redeploy on `main`, or it will start when GitHub delivers the event. A second project, `horekbazar` in `dev-choice`, also built the 13:33 preview push. Which project is canonical is for the owner to decide; neither was changed.
- **Credentials:** the owner pasted a filled environment file (labelled production) into the chat. The values were written only to a git-ignored, mode-600 `.env.local` in the agent sandbox. They were not committed, logged or put in any document. The agent generated `AUTH_SECRET` (32 random bytes), `CRON_SECRET`, a VAPID P-256 key pair and `JOBS_TRIGGER=http`. The courier placeholders (`willbeaddlater`) were left unset, so those integrations stay "not configured".
- **Read-only verification (states only):**
  - MongoDB Atlas: replica set, MongoDB 8.0.34, database `horekbazar` empty (0 collections). The user's role is **`atlasAdmin@admin`**, not least privilege. The sandbox resolver cannot answer SRV queries (`querySrv EBADRESP`), so the check used the three shard hosts and TXT options resolved over DNS-over-HTTPS. This is a sandbox limit; Vercel resolves `mongodb+srv` normally. `db:migrate` was **not** run (see below).
  - Upstash: `PING` → `PONG`. Cloudinary: usage API 200 (Free plan). Gemini: models API 200. Ably: REST 200.
  - Resend: the key is **send-only** (`restricted_api_key`), so domains cannot be listed. `EMAIL_FROM` is a `gmail.com` address. Resend only sends from a domain verified in the owner's account, so email will fail until a domain the owner controls is verified and `EMAIL_FROM` uses it.
- **Open for the owner:** rotate every value that was pasted into the chat. Create a least-privilege database user (`readWrite` on `horekbazar` only). Decide whether this cluster is the D19 development database or production; the contract forbids sharing one between environments. Add the variables to Vercel per environment (the agent gets 403 on `dev-choice`). Verify a sending domain in Resend.

## 2026-10-21 — B2 owner decisions; PR #2 merge authorised

- **Owner answers (19:50 +06):** merge PR #2 now. Decisions: fail closed without Upstash in production **approved**; development-only open `/admin/health` **approved** provided deployed environments always require authentication (met: only `NODE_ENV=development`; every build and Vercel deployment is `production`); `experimental.authInterrupts` **kept proposed** until its necessity, compatibility and 403 behaviour are shown (explanation added to the DESIGN.md Decision trace; 403 demonstrated by Playwright and on the deployed URL after merge); schema additions **approved** with documentation and tests (SCHEMA.md "B2 platform additions" table). **D19: (a) owner-provided Atlas dev cluster** (URI not yet supplied). **B3: not yet** (not approved).
- **Next:** merge PR #2, verify the production deployment of `main`; then the owner adds the Atlas dev `MONGODB_URI`; B3 waits for the owner.

## 2026-10-21 — Phase B2: data platform (pushed to `preview/horekbazar-v1`; PR to `main` awaiting the owner's merge answer)

- **Owner instruction (this session):** the owner asked to inherit the latest state, set up the environment, install and use Motomation, audit every branch, and "continue the remaining roadmap … start the next authorized implementation task", with a PR per phase, verified CI and Vercel checks, and merges only after required owner approval. Read as authorising **B2** (the next phase in §11). B2 approval does not approve B3. Merging B2 to `main` waits for the owner's explicit answer (D18: the owner merges to `main`).
- **Audit before work (fresh clone, `git fetch --all --tags`):**
  - Remote branches: `main` at `0f35772` (merge of PR #1) and `preview/horekbazar-v1` at `d66bd0a`, 2 commits ahead and 0 behind (`846fc9e`, `d66bd0a`: docs-only, `docs/PROGRESS.md`). No tags. No other remote branches; `spike/csp` does not exist remotely (as recorded). Working tree clean; nothing local was unpushed.
  - PRs: #1 merged. CI (GitHub Actions `check`) success on `0f35772` and `d66bd0a`. No branch protection on `main`.
  - **Vercel, reconciled:** after the B1 entry was written, the owner created project `horekbazar-preview` in the `dev-choice` team. Its Git integration posted `Vercel: success` on `0f35772` (12:23 UTC), and [horekbazar-preview.vercel.app](https://horekbazar-preview.vercel.app/) serves the B1 setup-required page with a nonce CSP, `/en` in English, and `/api/health` `{"setupRequired":true, "database":"not_configured"}`. `d66bd0a` has no Vercel status (pushed before the project existed). The Vercel connection used by the agent still returns 403 for scope `dev-choice`, so the project's settings, production branch, environment variables, logs and the deployed SHA cannot be read from here; the B1 "not deployed" line is superseded by this.
  - B1 gate reproduced on a fresh standalone build: **FAIL**, same findings as recorded (rules S4: seo-03 noindex, seo-04 canonical, seo-06 description, seo-18 og:image on the noindex setup page; journey forms 72 missing states on the header search GET form). Classified as B5 storefront scope (SEO and search states), not fixed in B2.
- **Environment (this sandbox):** Ubuntu 26.04, Git 2.53, system Node.js 20.20.2 (below `engines`); Node.js **24.22.1** installed under `~/.local` from nodejs.org with SHA-256 verified, npm 11.19.1. `npm ci` from the lockfile: OK (npm 11 does not run the install scripts of `@parcel/watcher`, `@swc/core`, `unrs-resolver`, `mongodb-memory-server`; nothing depends on them). `npx playwright install --with-deps chromium firefox webkit`: OK. Skill v3.0.2 installed with `npx skills add asfakulsiam/asfakulsiam-motomation-design` into `.agents/skills/` with the `.claude/skills` link; its content hash equals `skills-lock.json` (the installer rewrote the lock's source to the sandbox's git proxy URL; that change was reverted, not committed). Test MongoDB: 8.0.4 from `mongodb-memory-server`; on Ubuntu 26.04 it needs `MONGOMS_DISTRO=ubuntu-24.04` (CI runs on ubuntu-24.04 and does not).
- **Done (code):**
  - Dependencies (the versions approved in DESIGN.md §1, pinned): `mongodb` 7.7.0, `@upstash/redis` 1.39.0, `@upstash/ratelimit` 2.2.0; dev `mongodb-memory-server` 11.3.0 (test-only).
  - **Database port** `lib/adapters/db/client.ts`: one `MongoClient` per process (survives dev hot reload), `ignoreUndefined`, 5 s timeouts; `hello` topology check (replica set or mongos) cached 30 s when healthy, 5 s otherwise; `getDatabase()` throws `DatabaseNotReadyError` for `not_configured`, `not_replica_set` or `unreachable`. Never logs or returns the URI.
  - **Setup status** is now real: `getSetupStatus()` checks the database; `SetupRequired` tells the store owner which of the four states applies (not configured; unreachable; not a replica set; connected but no settings or Owner yet). `ready` stays false until B3/B4 create the Owner and settings. `/api/health` reports the checked state.
  - **Zod → `$jsonSchema`**: `lib/db/bson-zod.ts` (ObjectId, date, int helpers), `lib/db/json-schema.ts` (draft 2020-12 → MongoDB's draft-4 dialect: `bsonType`, numeric exclusives, `const`→`enum`; drops `$schema`/`format`/`propertyNames`; fails on `$ref`, unknown keywords and unconstrained fields). `lib/db/collections.ts` registers each collection with schema, indexes and the rules enforced in services instead. `npm run db:validators` writes `db/validators/*.json` (committed); `-- --check` fails on drift.
  - **Platform schemas** `lib/modules/platform/schema.ts`: `outbox`, `auditLog`, `jobs`, and `migrations`.
  - **Migrations** `npm run db:migrate` (`lib/db/migrate.ts`): creates each collection with its validator or applies `collMod` (`strict`, `error`) when it drifted, creates indexes, then runs one-time data migrations once each (recorded in `migrations`). None exist yet. Idempotent; prints names and counts only.
  - **Outbox** `lib/modules/platform/outbox.ts`: deterministic key `<type>:<aggregateId>:<seq>`; enqueue is an upsert, so a retry inside a transaction is a no-op, not a duplicate-key abort; atomic leased claim (`findOneAndUpdate`, pending/failed and due, or processing with an expired lease); complete and fail only by the lease owner; backoff 30 s · 2^(n−1) capped at 1 h with 50–100 % jitter; `dead` after 8 attempts; errors stripped of credential-shaped text. No handlers exist yet (`lib/adapters/jobs/handlers.ts`); a row with no handler is retried, then dead-lettered, never marked done.
  - **Triggers** (`JOBS_TRIGGER`, added to `.env.example` and the env schema): `npm run worker` (separate process, 5 s poll, clean stop on SIGINT/SIGTERM) and `POST /api/jobs/drain` (bearer `CRON_SECRET`, SHA-256 + `timingSafeEqual`; 503 without a secret, 401 wrong bearer, 409 when the trigger is `worker`; 20 s budget; counts only). No in-process timer.
  - **Audit log** writer `lib/modules/platform/audit.ts`: changed fields only, personal and secret keys redacted at any depth, IP truncated to /24 or /48, insert only.
  - **Cache / rate-limit port** `lib/adapters/cache/rate-limit.ts`: Upstash sliding window when configured; in development an in-process window (health shows "limited"); in production without Upstash, limited operations fail closed (`RateLimitUnavailableError`) and health is failing. Only consumer from B3 (sign-in).
  - **Integration health registry** `lib/platform/health.ts`: database and Upstash checked live; the other ports report configured / not configured / incomplete until their phase adds a check; jobs trigger, last successful drain (stale after 5 min with rows waiting), oldest waiting age, dead letters. Names and states only.
  - **`/admin/health`** (read-only; SCHEMA.md sections `#ports`, `#outbox`, `#jobs`) in a new admin root layout (`AdminShell`, no storefront dock, `noindex`, `frame-ancestors 'none'`, nonce CSP). `/admin` is no longer locale-routed. A production build answers **403** naming `platform.read` (no staff identity exists before B3); a local `next dev` server opens it with a visible notice. Unbuilt `/admin/*` paths are a designed 404. Admin language: the store default locale until the staff preference exists (B3). Bengali and English messages added; Bengali times use a 24-hour clock.
  - CI: `db:validators --check`, then `npm run test:integration` on a disposable MongoDB 8.0.4 replica set (binary cached).
- **Proposed in B2 (not approved; Decision trace rows marked proposed):** (1) "Upstash missing in production → refuses to start" (BUILD-PLAN §10) implemented as fail-closed limited operations plus a failing health state, because refusing to boot would break the zero-variable build and setup-required state (D2); (2) development-only open `/admin/health` until B3; (3) `experimental.authInterrupts` for `forbidden()` (403 from a server component); (4) SCHEMA additions `outbox.leaseOwner`, `jobs.lastSuccessAt`, collection `migrations`; (5) `JOBS_TRIGGER` unset = "not configured" in health (no default); (6) Node 24 native type stripping runs the CLI scripts (relative `.ts` imports in the modules they load; `allowImportingTsExtensions`).
- **Checks run (real outcomes, this sandbox, Node.js 24.22.1):**
  - `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm test`: **74 of 74** passed (13 files). `npm run db:validators -- --check`: OK, 4 validators. `catalogue:validate`, `catalogue:schema`: OK.
  - `npm run test:integration` (replica set + standalone from mongodb-memory-server, MongoDB 8.0.4): **24 of 24** passed: migrations create all 4 collections then are no-ops; live validators equal the generated ones (`strict`/`error`); declared indexes exist (outbox key unique); each collection accepts a valid and rejects a known-invalid document (code 121); drifted validator restored by `collMod`; a data migration runs once; standalone `mongod` refused (`not_replica_set`, `getDatabase` throws, setup status reports it); unreachable server reported without leaking the URI; enqueue once per key inside a transaction and rolled back with an aborted one; 5 concurrent drains process 30 rows exactly once; an expired lease is reclaimed and the crashed worker cannot complete it; backoff 30 s, 60 s, then `dead` at the limit; no-handler rows are retried, not done; drains recorded for monitoring; audit rows redacted and truncated; the drain route's 503/401/409/200 and counts-only body.
  - `next build` with zero variables: OK. Routes add `ƒ /admin/health`, `ƒ /api/jobs/drain`; `authInterrupts` listed as an experiment. Playwright against the standalone build: **134 passed, 58 skipped, 0 failed** (Chromium, Firefox, WebKit over HTTPS); new: `/admin/health` 403 naming `platform.read` with `frame-ancestors 'none'`, nonce CSP, noindex, no variable names and zero CSP violations; `/admin` and `/admin/orders` designed 404; `/en/admin/health` 404; drain 503 without `CRON_SECRET`, 405 on GET. Skipped: opt-in screenshot tests and the WebKit maintenance browser check (as in B1).
  - Canary build with 7 server-only values + `npm run check:bundle`: OK (16 client files).
  - Real local run: a single-node replica set on `127.0.0.1` (disposable), `npm run db:migrate` (created 4 collections, 5 indexes; second run: none created or updated), `npm run worker` (started, drained, stopped on SIGTERM), `next dev` with the database: `/api/health` → `connected`; `/admin/health` and `/`, `/en` captured at 375, 768 and 1440 px, no horizontal overflow; reviewed by eye. Screenshots are not committed.
  - Skill gate on `/admin/health` (dev server, the only place it renders): FAIL, stamp `e43ed35a59`. Passed: contrast 0, overflow 0, words 0, names 0, numbers 0, motion 0, copy 0, security 0, targets, zoom, reflow, forced colours, keyboard trap. Failed: seo-03/04/06/11/18 (admin is noindex by contract and has no admin navigation before B3), perf-04 (774 KB gzip, the unminified dev bundle) and perf-11 (empty dev HMR script), access focus 1 (`nextjs-portal`, the dev overlay). Not a pass; none of the failures is in the B2 page itself, and none is claimed as fixed.
- **Not run:** a real development database (D19 open), Upstash (no credentials; the Upstash adapter is untested against a live instance), the HTTP drain against a deployed URL, Vercel deployment of this branch (403 on the `dev-choice` scope from here; the Git integration may build it), real devices, axe and screen readers.
- **Open:** D11, D12, D5, D19 (development database; tests do not need it), D20–D23, coupon-usage restoration on cancellation; B5 SEO and search-form states from the B1 gate; Vercel access for the agent (`dev-choice`).
- **Next:** owner review of PR B2 and an explicit merge answer; then **B3 Identity** (needs owner approval, `AUTH_SECRET`, D7/D23 decisions, and Resend for staff email verification).

## 2026-10-21 — Phase B1: Khata tokens, fonts and storefront shell (pushed to `preview/horekbazar-v1`)

- **Owner decision:** **D17 approved, option (a)**: nonce-based CSP on every rendered page, including the public storefront. No `'unsafe-inline'` to enable HTML caching. Server-side data caching only where verified with Next.js 16.4.2 and nonce rendering. Storefront HTML is rendered per request and is not claimed as cached. CSP and security-header regression tests stay in the plan. WebKit script-loading tests use HTTPS or an isolated test-only setup; production CSP is not weakened for HTTP tests. CSP hashes, CDN behaviour and `"use cache"` remain unverified. The B0 spike record (option (b) failed in all three engines) is kept in `docs/BUILD-PLAN.md` §9.1. **Phase B1 approved.** B1 approval does not approve B2. Recorded in `DESIGN.md` (status, Decision trace) and `docs/BUILD-PLAN.md` (render note in §1, §8 Caching and Fonts rows, §9 Headers row, §9.1, §13 D17 row, R10).
- **Audit before work:** branch `preview/horekbazar-v1` level with origin at `f251bcf`, working tree clean; `main` at `dacc199` untouched; `spike/csp` local only. Work done on a local branch from `f251bcf` and pushed fast-forward.
- **Done (code):**
  - Tokens and presets in `app/globals.css`: Khata colours, type scale, spacing, radii, focus ring, dock height, safe-area insets (`viewport-fit=cover`), and `prefers-reduced-motion` (no transitions or animation). Font presets `plain` (Noto Sans Bengali only) and `khata` (Tiro Bangla for display text), switched by `html[data-font-preset]`.
  - Fonts self-hosted in `public/fonts/v1/` with `unicode-range` subsets, metric-matched fallbacks and OFL licences. Exactly one file is preloaded per locale (Bengali subset on `/`, Latin subset on `/en`), checked in the Link header. Files cached for one year, `immutable`. `next/font/google` was tried first and preloaded both subsets on both locales (measured), so it was not used (proposed).
  - Locales with `next-intl` 4.14.9 (pinned): messages in `messages/bn.json` and `messages/en.json`, locale from `next/root-params`; routing stays in `proxy.ts` (no next-intl middleware). Only the error-boundary messages are sent to the client.
  - Shell components: skip link, `SiteHeader` (wordmark, persistent search row as a plain GET form, language switch that keeps path and query), `SiteFooter` (COD statement, policy links, contact pending note), `BottomDock` with `BottomNav` (five destinations: Home, Categories, Search, Cart, Account; the dock hides while a text field has focus and its height is published as `--dock-h`). DOM order: skip link, header, `main#main`, footer, dock.
  - States: setup-required (lists missing variable names, never values), 404 (designed, HTTP 404), 500 (`error.tsx` with retry, bilingual `global-error.tsx`), `/offline`, and maintenance (`MAINTENANCE_MODE=on`: the proxy returns a self-contained 503 page with `Retry-After: 600` and `no-store`; a rewrite could not carry 503, measured). `/api/health` reports `maintenance`.
  - `lib/routes.ts`: the route table from BUILD-PLAN §1. Known storefront routes (for example `/categories`, `/cart`, `/account`, `/privacy-policy`) show setup-required, not invented content; unknown routes return 404.
  - `PriceTag` with `lib/format/money.ts` (minor units, Bengali or Latin digits, South Asian grouping, `৳`; compare-at shown only when greater), `LabelTile`, `Button` and `ButtonLink` (loading state with `aria-busy`, a static ellipsis under reduced motion). Every component has a Tier, Use-when, Avoid-when, Reduced-motion and Touch header.
  - CI: `actions/checkout` and `actions/setup-node` v4 → v7 (release notes checked; none of the inputs used here changed), `upload-artifact` v7 for the Playwright report on failure, runner pinned to `ubuntu-24.04`, 30-minute timeout, Playwright in Chromium, Firefox and WebKit.
  - Tests: Playwright starts three production servers: the app on HTTP for Chromium and Firefox, a test-only HTTPS proxy (`scripts/e2e-https-proxy.mjs`, throwaway self-signed certificate) for WebKit, and a second server with `MAINTENANCE_MODE=on`. A test asserts that the real response still has `upgrade-insecure-requests`.
- **Proposed in B1 (not approved; Decision trace rows marked proposed):** self-hosted fonts; fresh-install preset `plain` (HorekBazar's own store selects `khata` in settings); dock space reserved on `<body>`; wordmark "নতুন স্টোর" / "New store" until settings exist; Categories goes to `/categories` until the B5 sheet; setup-required shows variable names to everyone until staff sessions exist (B3); maintenance via environment variable; CI runner pin and action updates.
- **Checks run (real outcomes, this sandbox, Node.js 24.22.0):**
  - `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm test`: 44 of 44 passed (9 files).
  - `next build` with zero environment variables: success. Routes: `ƒ /[locale]`, `ƒ /[locale]/[...rest]`, `ƒ /[locale]/offline`, `ƒ /api/health`, `○ /_not-found`, plus the proxy.
  - Playwright against the standalone build: 122 passed, 58 skipped, 0 failed (Chromium, Firefox, WebKit over HTTPS). Covers 375, 768 and 1440 px layout without horizontal scroll, skip link, keyboard order and visible focus, dock hiding on text focus and reserved space, five dock destinations, language switch, mixed Bengali/Latin text, one font preload per locale and loaded font faces, 404 / setup-required / offline / maintenance 503, CSP nonce on every script and zero CSP violations, and reduced motion. Skipped: 57 opt-in screenshot tests and the maintenance browser check on WebKit (HTTP-only server; the 503 is checked by request).
  - Screenshots (Chromium, opt-in run, 19 passed): 375, 768 and 1440 px for `/`, `/en` and a 404, in both presets, plus a conjunct fixture (ক্ষ ন্ত্র র্য ঙ্ক স্ট্র at 12, 14 and 16 px in Noto and Tiro). Reviewed by eye; not committed.
  - `npm run check:bundle`: OK on a build with 7 server-only canary values. `catalogue:validate` and `catalogue:schema`: OK.
  - Client JavaScript on `/` and `/en`: about 192 KB gzip in total including the framework; the app's own shell chunk about 5 KB and the next-intl client about 12 KB (approximate, local measurement).
  - `npm audit --omit=dev`: 0. Full audit: the same 5 high dev-only `braces` findings ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)); framework not downgraded.
  - Skill `completeness.mjs`: exit 1 (expected). States 2/11, Template 13/22, Functions 0/8, Edge cases 0/10, Skeletons 0/6. Routes 33/33 and Admin 29/29 are inflated by the `[locale]/[...rest]` catch-all and are not real. No warnings.
  - Skill gate: **FAIL** on the final build for `/` (gate/4, stamp `2a08c65c20`). Passed: contrast 0 below AA at 375/390/768/1440, overflow 0, names 0 missing, motion 0, focus 12 of 12 visible, targets 0 under 24 px and 0 under 44 px (after raising the search input and button to 44 px), 200% zoom 0 lost, 320 px reflow 0, forced colours 0, keyboard trap none, copy rules 0; journey nav 18 of 18 routes in 3 clicks or fewer, mobile 35 of 35 elements respond and 4 of 4 widths fit, designed 404, session 6 of 6. Failed: (1) SEO rules seo-03 (noindex), seo-04 (canonical), seo-06 (meta description), seo-18 (og:image); the setup-required page is noindex on purpose, and storefront SEO is B5/B11 scope. (2) Journey forms: 72 missing states, because the header search is a plain GET form with no designed validation, loading, success or server-error state; search states are B5 scope. Not in the stamp: no archetype or tier recorded, no handoff record. The runs for `/en` and `/nope` had not finished at the time of this entry.
- **Not run:** real devices (safe-area insets cannot be emulated; only the CSS rule and `viewport-fit` are checked), the 500 page in a browser (unit-tested markup only), Lighthouse, LCP, axe, screen readers, and any database, auth, transaction or concurrency test. None is claimed.
- **Open:** D11, D12 (still blocks checkout that needs the location dataset), D5, D19–D23, and coupon-usage restoration on cancellation.
- **Owner instruction (after the push):** CI passed on `01bcba4` (GitHub Actions run 39596727627, success). The owner asked to open a PR, merge to `main` and deploy the first Vercel preview. Recorded in the `DESIGN.md` Decision trace. This applies to B1 only; the skill gate had not passed at merge time.
- **Merge and deploy:** [PR #1](https://github.com/dev-asfakul/horekbazar/pull/1) merged to `main` as `0f35772` (merge commit, no force). Vercel preview **not deployed**: the Vercel connection authenticates as `dev-asfakul`, but the account's personal scope is the Hobby team `dev-choice` (the default team), and every project read or write there returns 403 "Not authorized … scope dev-choice". No project was created and nothing was uploaded. The connection needs re-authorization with access to `dev-choice`.
- **Next:** owner review of B1 on `preview/horekbazar-v1`; owner approval needed to start B2. B2 also needs D19 (a development database the owner provides).

## 2026-10-21 — Phase B0: toolchain skeleton and D17 CSP/caching spike (pushed to `preview/horekbazar-v1`)

- **Owner decision:** Checkpoint 3 (the amended "Khata" direction) **approved**. Checkpoint 4 **approved with conditions**: `docs/BUILD-PLAN.md`, `MOTION.md`, `SCHEMA.md` v0.2.2 and the canonical ledger-key format in `docs/domain-rules.md` §4.1, as a design contract (`order:<orderId>:<lineId>:<kind>`; `return:<returnId>:<lineId>:<kind>`; `rto:<orderId>:<lineId>:<kind>`; `stock:<adjustmentId>:<variantId>:<kind>`). The approval does not authorise invented catalogue data, unapproved prices, unlicensed images or location data, or silently resolving open decisions. The owner authorised **Phase B0 only**.
- **Audit before work:** `main` clean and level with `origin/main` at `dacc199`. No application code existed. Skill v3.0.2 installed (git-ignored). Node.js 24.22.0 was installed locally for the build (SHA-256 verified); the system Node.js 20 is end-of-life and below Vitest 5's engine range.
- **Done (code, branch `preview/horekbazar-v1`):**
  - Toolchain, all versions pinned exactly in `package.json` and `package-lock.json`: next 16.4.2, react and react-dom 19.3.1, zod 4.6.7; dev: typescript 6.0.3, tailwindcss and @tailwindcss/postcss 4.3.3, eslint 9.39.5 with eslint-config-next 16.4.2, vitest 5.0.5, @playwright/test 1.64.1, ajv 8.20.0, ajv-formats 3.0.1. `.nvmrc` 24; `engines` `>=24 <25`.
  - Strict `tsconfig.json`, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. `next.config.ts` uses `output: "standalone"`, no `X-Powered-By` header and no browser source maps.
  - ESLint (Next core-web-vitals and TypeScript rules). Application code may not import `catalogue/**`, and `console` is not allowed.
  - `lib/env.ts`: Zod schema that validates each variable separately. It reports integration states and never echoes values.
  - `proxy.ts` skeleton: `/` serves Bengali, `/en` serves English, `/bn/...` gets a 308 redirect to the canonical URL, and unknown locale-like segments return 404. A fresh nonce CSP is sent per request (D17 option a, the approved rule). Security headers: HSTS outside development (no preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors 'none'` on private prefixes.
  - Setup-required page in Bengali and English (noindex). `/api/health` returns `setupRequired` and database `not_configured` or `not_checked`, with `no-store`. It never claims a database connection.
  - Vitest unit tests (locales, headers, env). A Playwright smoke suite runs against the standalone production server. Scripts: secret scan of the client bundle, standalone start, catalogue JSON Schema check.
  - `.github/workflows/ci.yml`: lint, typecheck, unit tests, both catalogue checks, a zero-environment build, Playwright (Chromium), and a build with canary values followed by the bundle secret scan.
- **Done (documentation, commits `0eee9f4` and later):** approval status in `README.md`, `DESIGN.md` (status, §1 TypeScript pin, Checkpoint 3 and 4 status, Decision trace), `docs/BUILD-PLAN.md` (status, checkpoint table, §9.1 spike result, D17 and D18 rows), `MOTION.md`, `SCHEMA.md` and `docs/domain-rules.md` §4 and §4.1. `README.md` has a development setup section. `catalogue/horekbazar/README.md` and `CATALOGUE-SCHEMA.md` now point to `npm run catalogue:schema`. Catalogue data unchanged.
- **Checks run (real outcomes, this sandbox, Node.js 24.22.0, npm 11.19.1):**
  - `npm run lint`: exit 0. `npm run typecheck`: exit 0. `npm test`: 18 of 18 passed (3 files).
  - `next build` with zero environment variables (`env -i`): success. Routes: `ƒ /[locale]`, `ƒ /api/health`, `○ /_not-found`, plus the proxy.
  - Playwright smoke suite, standalone server: Chromium 7 of 7 passed (the CI configuration). A one-off run with a temporary configuration (not committed): Firefox 7 of 7 and WebKit 7 of 7. These tests do not check script loading in WebKit (see the spike note).
  - `npm run check:bundle`: OK on the zero-environment build. Earlier in B0: OK on a build with 7 server-only canary values, and a planted canary made it exit 1 as expected.
  - `catalogue:validate`: 0 errors and 0 warnings. `catalogue:schema`: 4 of 4 files valid.
  - Lint probe: importing `catalogue/` from app code was flagged (1 error).
  - `npm audit --omit=dev`: 0 vulnerabilities. Full audit: 5 high, all in the dev-only chain eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces 3.0.3 ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)). No patched `braces` exists. npm's suggested fix downgrades eslint-config-next to 14, so it was rejected. Recorded as a known issue.
  - Skill `completeness.mjs`: exit 1 (expected, the template is not built). Template 11/22, Routes 18/33, Journeys 1/12, Functions 0/8, States 0/11, Admin 1/29. The route count is the script's own match; only `/[locale]` and `/api/health` exist. It flags `.env.example` for missing the test-only `E2E_PORT`.
  - **Not run locally:** the skill gate; any database, auth, transaction, concurrency, accessibility, performance or load test. None is claimed.
- **D17 spike (local branch `spike/csp`, never merged, not pushed by owner decision).** Full result in `docs/BUILD-PLAN.md` §9.1. Production standalone build over HTTP; Chromium 156, Firefox 157, WebKit 27.2.

  | Route on the spike | CSP | Build | Cache headers (3 requests) | Scripts in HTML | Violations (Cr / Fx / WK) | Hydration |
  |---|---|---|---|---|---|---|
  | `/spike-static` (`revalidate 60`) + `experimental.sri` | `script-src 'self'` (static, no nonce) | `●` SSG | `x-nextjs-cache` STALE then HIT; `s-maxage=60, stale-while-revalidate=31535940` | 3 inline; 7 `src`, 5 with `integrity`; 0 nonce | 3 / 3 / 3 (`script-src-elem` inline) | **failed** in all three |
  | `/spike-data` (`connection()` + `unstable_cache` 300 s) | nonce + `'strict-dynamic'` | `ƒ` | `private, no-cache, no-store, max-age=0, must-revalidate`; cached value identical across requests | 3 inline + 6 `src`, all 9 nonced | 0 / 0 / 0 | n/a (no client component); app booted in Chromium and Firefox |
  | `/` (B0 page) | nonce | `ƒ` | same as above | 9 nonced | 0 / 0 / 0 | WebKit booted only with `upgrade-insecure-requests` removed (plain-HTTP artifact) |

  - **Reading:** option (b), "experimental SRI with a strict static CSP", **does not work as specified** on Next.js 16.4.2: the inline scripts are not covered. Option (a), the approved rule, works on the spike, and server data caching still works. CSP hashes, `"use cache"` and CDN behaviour were **not tested**. **D17 stays open for the owner.**
  - Process note: the spike's files were not committed when its worktree was first removed. The app files were restored from the session record's creation command, and the measurement script was rewritten with two extra fields (render time, `window.next`). The spike was then rebuilt and measured again, with the same numbers, and committed (`spike/csp` at `16a5264`). No owner work was affected.
- **Known issues (proposed handling, not decided):** the dev-only `braces` advisory above. npm 11 notes that the `unrs-resolver` install script was not run; lint works without it. WebKit over plain HTTP with `upgrade-insecure-requests` (§9.1). CI uses Chromium only.
- **Open (unchanged):** D11 catalogue (235 unapproved prices: 39 historical TCB references, 196 estimates; images absent; compliance flags provisional); D12 location dataset (still blocks checkout behaviour that needs it); D5 hosting; D17 CSP and caching; D19–D23; coupon-usage restoration on cancellation.
- **D18 decided (owner, 2026-10-21):** B0 is pushed to `preview/horekbazar-v1`; `main` is untouched; `spike/csp` stays local, so its code exists only in the sandbox, and its results are recorded here and in BUILD-PLAN §9.1.
- **CI on GitHub (real outcome):** [run 39589426299](https://github.com/dev-asfakul/horekbazar/actions/runs/39589426299) on `preview/horekbazar-v1` at `6be1317` from a clean checkout: **success**. All steps passed: `npm ci`, lint, typecheck, unit tests, both catalogue checks, the zero-environment build, the Chromium smoke test (7 passed), and the canary build with the bundle scan. GitHub warnings (not failures): `actions/checkout@v4` and `actions/setup-node@v4` target the deprecated Node.js 20 action runtime; `ubuntu-latest` migrates to Ubuntu 26 from 2026-10-19. Proposed handling: update the action versions in B1 (not decided).
- **B0 pass criteria (BUILD-PLAN §11):** CI green on a clean clone, `next build` works with zero environment variables and shows setup-required, no secrets in the bundle, spike report recorded: **met**. The skill gate was not run, and no database, auth, transaction, concurrency, accessibility, performance or load test was run.
- **Next:** the owner decides D17 (spike result above) and approves or redirects Phase B1. B1 does not start before that.

## 2026-10-21 — Handoff: environment set up, skill installed, ledger-key wording aligned (proposed)

- **Handoff audit:** fresh clone of `dev-asfakul/horekbazar`; `main` clean and level with `origin/main` at `25de626` (verified with `git status` and `git ls-remote`). No application code, no `package.json`, no CI configuration yet.
- **Environment:** Linux, bash, Git 2.53.0, Node.js 20.20.2, npm 10.8.2. The repository pins no runtime or package manager yet, so there is nothing to install. The Motomation Design skill was installed with `npx skills add asfakulsiam/asfakulsiam-motomation-design` into `.agents/skills/asfakulsiam-motomation-design` (git-ignored); `VERSION` and `SKILL.md` report **3.0.2**, and `skills-lock.json` is unchanged (same `computedHash`).
- **Done (documentation only):**
  1. `docs/BUILD-PLAN.md` → Idempotency summary: the stock ledger key now reads `stock:<adjustmentId>:<variantId>:<kind>`, matching domain-rules §4, §4.1 and `SCHEMA.md`.
  2. `docs/domain-rules.md` §4.1 opening: it no longer says only one key format changed. It now describes the canonical `<namespace>:<entityId>:<lineRef>:<kind>` format and its namespaces (`order:` reserve, release, commit; `return:` customer-return restock and write-off; `rto:` inspected goods returned to origin after a failed delivery; `stock:` receipts and adjustments), and keeps the **proposed Checkpoint 4 amendment** status.
- **Checks run (real outcomes):**
  - Search for stock keys without `:<kind>` and for "only one key format": 0 matches. Old un-namespaced formats remain only in the two historical change notes.
  - Markdown table column-count check on the 2 changed plan files: 0 mismatches.
  - Catalogue checker `validate`: 0 errors, 0 warnings. Ajv: 4 of 4 files valid. Catalogue data unchanged.
  - Skill `completeness.mjs`: Template 10/20, Routes 0/33, Journeys 0/12, expected because nothing is built.
- No build, concurrency, transaction, security, browser, accessibility or performance test was run, and none is claimed.
- **Boundaries unchanged:** Checkpoints 3 and 4 **not approved**. D11 catalogue unapproved (235 prices: 39 historical TCB references, 196 estimates); images absent; compliance flags provisional; D12 open; D5 deferred; D17–D23 and coupon-on-cancel open.
- **Next:** the owner explicitly approves, redirects or amends Checkpoint 3 and Checkpoint 4. Phase B0 starts only after that.

## 2026-10-21 — Checkpoint 4 final corrections: order-line identity and canonical ledger keys (proposed)

- **Owner review:** two inconsistencies to fix. Documentation only. Checkpoint 3 and Checkpoint 4 remain **not approved**.
- **Audit:** `main` clean, level with `origin/main` at `34d4c31` (verified with `git status` and the GitHub API). Found:
  1. `SCHEMA.md` OrderLine had no `lineId`, although reservations, ledger keys and returns referenced one.
  2. The `docs/domain-rules.md` §4 table still used `orderId:lineId:<kind>`, `returnId:lineId:<kind>` and "adjustment id", while §4.1 used namespaced keys.
  3. Returned-to-origin restock was keyed by `returnId`, but that case has no return record.
  4. §4.1 assumed at most one line per variant.
  5. `docs/BUILD-PLAN.md` §4 still showed `orderId:lineId:release`.
- **Done:**
  - **`lineId`** defined in `SCHEMA.md` → OrderLine and in domain-rules §4.1: a server-generated ObjectId created in the placement transaction, stable for the line's lifetime, never replaced by `variantId`. Reservations, ledger keys, partial cancellation (§3), returns and line status all reference it. The "one line per variant" assumption is removed. Cart operations use `variantId` (the cart's own key) and are kept distinct from order `lineId`.
  - **One canonical ledger-key format** `<namespace>:<entityId>:<lineRef>:<kind>` in the §4 table, §4.1, `SCHEMA.md` and `docs/BUILD-PLAN.md`. The namespaces are `order`, `rto` (new, for returned-to-origin goods), `return` and `stock`. `adjustmentId` is the inventory request key.
  - The §4 table change is marked as a **proposed Checkpoint 4 amendment** of the approved Checkpoint 2 format; the rule itself is unchanged.
  - `SCHEMA.md` → v0.2.2: ledger `refType`/`refId`/`lineRef`; line-status enum marked **[A]**.
- **Checks run (real outcomes):**
  - Markdown table column-count check on the 4 changed files: 0 mismatches.
  - Search for old key formats and the one-line-per-variant assumption outside the two change notes: 0 matches.
  - Catalogue checker: 0 errors and 0 warnings; Ajv: 4 of 4 files valid. The catalogue is unaffected and was re-run as a guard.
  - Diff review: only the 4 intended files changed.
- No concurrency, transaction, security, browser, accessibility or performance test was run, and none is claimed.

## 2026-10-21 — Checkpoint 4 amended after the owner's plan review; awaiting owner approval

- **Owner review:** three corrections requested (idempotency, CSP and caching, breakpoints). Checkpoint 3 and Checkpoint 4 are **not approved**. Moving to Checkpoint 4 authorised planning only.
- **Audit:**
  - `main` clean and level with `origin/main` at `8d9987b` (verified with `git status` and the GitHub API).
  - The commit contains the 6 files reported.
  - The approved Next.js version is 16.4.2 (`DESIGN.md` §1).
  - The Next.js CSP guide was re-fetched live; its version label is "Latest v16.4.2".
- **Corrections:**
  1. **Idempotency and concurrency:** new **`docs/domain-rules.md` §4.1 (proposed)**.
     - Each layer gets its own key: request keys `{scope, principalId, key}` with a fingerprint; orders `{userId, checkoutKey}`; cart compare-and-set; reservations `{orderId, lineId}`; deterministic ledger keys (including the corrected `stock:<adjustmentId>:<variantId>:<kind>`); order compare-and-set with `orderEvents {orderId, seq}`; coupon redemption per order plus guarded counters (new `couponCustomerUsage`); deterministic outbox keys.
     - The section also defines the transaction boundary, bounded retries, conflict responses and all seven cases.
     - `SCHEMA.md` → v0.2.1: reservation key fixed; `outbox` aligned with domain-rules §13 (v0.2 had used different field names); `cart.status`/`version`, `orders.checkoutKey`/`version` added; API errors added.
     - `docs/BUILD-PLAN.md` §4 points to §4.1; tests I1–I10 added; B6–B8 pass criteria use them.
  2. **CSP and caching:** new **`docs/BUILD-PLAN.md` §9.1**, with route requirements, documented facts quoted, and SRI marked **unverified**.
     - D17 options: (a) nonces everywhere (approved rule, fallback); (b) SRI only if a B0 spike proves it; (c) `'unsafe-inline'`, rejected.
     - B0 gains the spike (a throwaway branch, never merged).
     - "ISR" in SCHEMA and the plan is marked conditional on D17.
     - D17 stays owner-pending.
  3. **Breakpoints:** one definition in `DESIGN.md` → Layout → **Viewport bands**: S 0–767, M 768–1023, L 1024–1279, XL ≥ 1280. 768 px is band M: no dock, 3 columns, filter sheet.
     - SCHEMA, DESIGN and the plan were aligned to it.
     - B1 pass criteria and the responsive tests now cover both sides of each edge.
  4. **Decisions table:** "Blocks" and "If left open" columns added for D17–D23, plus the coupon-on-cancel assumption and the Checkpoint 3 and 4 approvals. Risk R10 updated; R16 added (hot-SKU write conflicts).
- **Unchanged:**
  - The Khata direction and its amended interaction rules.
  - The phases B0–B11 (only the B0 spike was added).
  - Every measured / hypothesis / not-verified label.
  - `MOTION.md`, `README.md` and `DATA.md` (no material change needed).
- **Checks run (real outcomes):**
  - Catalogue checker: 0 errors and 0 warnings; Ajv: 4 of 4 files valid. Catalogue data unchanged.
  - Skill `completeness.mjs`: Template 10/20, Routes 0/33. These are expected because nothing is built.
  - Markdown table column-count check on the 5 changed files: 0 mismatches.
  - A search for leftover statements ("768 px and below", the old reservation key, the old outbox field names, the old D17 wording) found none outside the C12–C14 descriptions.
  - A diff review for excluded scope (payments, SMS, wishlist, gift cards, subscriptions, POS, warehouses, Q&A): none added.
- Nothing was built, so no build, browser, accessibility, security, concurrency or load test was run, and none is claimed.
- **Boundaries unchanged:** D11 catalogue unapproved; all 235 prices unapproved (39 historical TCB references, 196 estimates); images absent; compliance flags provisional; D12 open; D5 deferred. No application code, migrations, imports or deployment.

## 2026-10-21 — Checkpoint 4 (build plan) proposed; awaiting owner approval

- **Owner direction:** the Checkpoint 4 brief says "We are deliberately moving forward from Checkpoint 3". Recorded as proceeding by owner direction. Explicit Checkpoint 3 approval is requested together with Checkpoint 4.
- **Audit:**
  - Branch `main`, clean, level with `origin/main` at `4a87a82` (verified with `git status` and the GitHub API).
  - No application code exists.
  - The Checkpoint 3 amendments were confirmed in the files.
  - Read the skill's workflow (`thinking/sequence.md` Checkpoint 4 to 6, preview vs handoff push), `gates/rules.md`, `adapters/next.md`, `motion/*` and `templates/MOTION.md`.
- **Done (documentation only):**
  - New `docs/BUILD-PLAN.md`:
    - audit and contradictions C1–C11;
    - routes; components; states; domain mapping; responsive plan; accessibility; SEO and i18n; performance; security; integrations;
    - phases B0–B11, then Checkpoints 5–6;
    - verification matrix and k6 plan (goal, not a claim);
    - risks R1–R15; owner decisions D17–D23; definition of done.
  - New `MOTION.md` (required by the skill at this checkpoint): Tier 1 only, no motion library.
  - `SCHEMA.md` v0.2: category-depth definition with the move rule; remaining entity fields; API surface; admin section contracts.
    - While writing it I checked roles, order states and return states against `docs/domain-rules.md` and corrected my draft to match: six roles, custom roles allowed, customer cancellation up to `confirmed`, and return states including `credited` and `closed`.
  - `DESIGN.md`: status; build-plan pointer; `proxy.ts` note on the Scope row; sticky search-row refinement (proposed); decision-trace row.
  - `README.md`: status.
- **Contradictions recorded, not silently resolved:**
  - C1 nonce CSP vs cached pages: Next.js documents that nonces disable static optimisation and ISR. Proposed D17.
  - C2 `middleware.ts` → `proxy.ts` (Next.js 16 rename).
  - C3 push-every-update vs the skill's "nothing reaches main" before the gate. Proposed D18: `preview/` branch.
  - C4 row-level security → repository scoping.
  - C6 D12 blocks checkout (D21).
  - C7 review content under D11 (D20).
  - C8 preview vs D5.
  - C9 first-Owner verification (D23).
  - C10 JS budget (D22).
- **Checks run:**
  - The catalogue checker and Ajv still pass. No catalogue data changed.
  - `scripts/completeness.mjs`: expected missing-build failures only.
  - Consistency search across the documents for columns, dock rules, depth, Index/noindex classification and decision IDs.
  - Nothing was built, so no build, browser, accessibility, performance or load test was run, and none is claimed.
- **Boundaries unchanged:** D11 catalogue unapproved; all 235 prices unapproved (39 historical TCB 26 Feb 2026 references, 196 estimates); images missing; compliance flags provisional; D12 open; D5 deferred. No application code, migrations, imports or deployment.
- **Next:** the owner approves, redirects or amends Checkpoint 4 (and confirms Checkpoint 3), and decides D17–D23. Implementation (phase B0) starts only after explicit approval.

## 2026-10-21 — Checkpoint 3 amended after owner review ("Khata" accepted in principle; not yet approved)

- **Owner decision:** the "Khata" direction is accepted in principle; **Checkpoint 3 is not approved**. Six amendments requested; the product contract is not to be changed to fit the design.
- **Done:**
  1. **Mobile navigation.** The contract's five-item bottom bar (Home, Categories, Search, Cart, Account) is restored in `DESIGN.md` → Layout and Components.
     - The RunningTotalBar now sits above the bottom bar inside one `BottomDock`, which shows at most one context strip, by priority: PDP sticky add-to-cart > checkout summary strip > RunningTotalBar.
     - The dock applies the `env(safe-area-inset-bottom)` safe area, publishes its height as `--dock-h`, and drives `main` bottom padding and `scroll-padding-bottom`, so focus is not hidden (WCAG 2.2 SC 2.4.11, technique C43 / failure F110).
     - The dock hides while a text field is focused. The place-order button is repeated in the normal page flow.
     - All of this is proposed; it was written to fit the contract, which is unchanged.
  2. **Category depth.** Sources checked:
     - The approved product contract says "category tree up to 3 levels".
     - `docs/domain-rules.md` has **no** depth rule (not changed).
     - The generated taxonomy uses 2 levels.
     - `SCHEMA.md` v0, `catalogue/horekbazar/TAXONOMY.md`, `CATALOGUE-SCHEMA.md` and the catalogue checker all said "maximum 2". SCHEMA v0 also cited domain-rules §2 incorrectly.
     - **Resolution: maximum 3 levels everywhere; source: the approved product contract.**
     - The checker now walks the parent chain, rejects depth > 3 and detects parent cycles. The catalogue data is unchanged.
  3. **Other contract mismatches found and fixed** (contract unchanged; the design was realigned):
     - Listings are now 2 columns at 375 px, 3 at 768 px and 4–5 at 1440 px, as a ruled khata grid (v0 had single-column rows).
     - Persistent header search with the category entry beside it.
     - Mega-menu and persistent filter sidebar at 1440 px.
     - Admin uses cards on a phone and full tables from 1024 px.
  4. **Khata direction preserved:** ruled entries and rows, LabelTile, the Bangla type research, contrast, QuantityStepper, full-cost visibility and RunningTotalBar are all kept. No research restarted, no decoration added.
  5. **New `DESIGN.md` → Verification status section:** results are split into **measured**, **hypotheses** and **build checks**. The build checks cover conjuncts, mixed script, fallback-font CLS, keyboard, screen readers, 375 px usability, safe area, reduced motion, performance budgets and rendered contrast. None has been run.
  6. `SCHEMA.md` is now v0.1 (depth, removed `display` field, `#site-header` and `#bottom-dock` global sections, dock states). `DATA.md` and `README.md` updated to agree.
- **Validation run:**
  - Catalogue checker on the real package: 0 errors, 0 warnings.
  - Negative test (copy with a 3rd and a 4th level added): depth 4 rejected, depth 3 accepted; exit code 1.
  - Ajv: all 4 catalogue files valid.
  - Search for leftover "depth 2", "no bottom tab bar" and `display` field references: none remain.
  - Skill completeness: expected failures only (no app yet).
- **Boundaries unchanged:** D11 catalogue unapproved; all 235 prices unapproved (39 historical TCB references, 196 estimates); images missing; compliance flags provisional; D12 open; D5 deferred. No application code, no database connection or import, no deployment.
- **Next:** the owner approves, redirects or asks for alternatives at **Checkpoint 3**. Checkpoint 4 does not start before explicit approval.

## 2026-10-21 — Checkpoint 2 approved with conditions; Checkpoint 3 (Research and direction) proposed, awaiting approval

- **Owner decision:** Checkpoint 2 (Product contract) **approved with seven conditions**:
  1. The generated catalogue remains an unapproved research artifact: not imported, not published, not in the reusable template. D11 stays pending owner review.
  2. All 235 prices remain unapproved. The 39 historical TCB reference prices (26 Feb 2026) and the 196 estimates are kept distinct, and neither is a verified current selling price.
  3. Images stay missing until exact-product suitability and commercial rights are verified. BSTI and other compliance flags stay provisional.
  4. D12 stays open and is resolved before any location-data-dependent behaviour.
  5. D5 stays deferred and does not block the contract.
  6. Decision status is reconciled across the six docs; validation and provenance records are preserved.
  7. Proceed to Checkpoint 3 only.
- **Done (Checkpoint 2 reconciliation):**
  - Status lines and decision tables updated in `DESIGN.md`, `docs/domain-rules.md`, `docs/LICENSING.md`, `README.md` and `AGENTS.md`; the conditions are recorded in `DESIGN.md` → Product contract.
  - D7, D8, D10 and D13–D16 are now **approved**; D9 is **approved as a proposal** (disabled for BD production until legal review). D11 is unchanged ("Owner authorized catalogue generation; generated catalogue pending owner review and approval."); D12 **open**; D5 **deferred**.
  - `catalogue/horekbazar/README.md` gained one status sentence; no catalogue data changed.
- **Done (Checkpoint 3, proposed):**
  - `DESIGN.md` gained: Research record (5 questions, 14 sources), Directions A/B/C compared, Divergence, Concept, Typography, Colour, Layout, Components, Imagery, Restraint Gate record, and a design decision trace.
  - New `SCHEMA.md` (draft v0: storefront entities, routes, core section contracts, states, environment variables) and `DATA.md` (D2 override: no mock data).
  - Chosen direction: **"Khata"** (shop-ledger rows, running total bar as the signature, Tiro Bangla title voice, Noto Sans Bengali text with same-width Bengali digits, khata-paper ground with a blue-ink accent).
  - Dials: storefront ENERGY 2 · RHYTHM 1 · MOTION 1; checkout, account and admin 1 · 1 · 1; Tier 1.
- **Research performed:**
  - Web sources: Baymard, Shwapno, Setka, Cashod, r12a, W3C, Next.js docs, Google Fonts metadata.
  - Font files downloaded from google/fonts and measured with fontTools. Anek Bangla's Bengali digits have uneven widths and no tabular alternates; Noto Sans Bengali's share one width. Bengali-subset WOFF2 sizes: Anek with both axes ≈ 446 KB; Noto at weights 400–600 ≈ 68 KB; Tiro ≈ 78 KB.
  - Node 20 `Intl` checked for `bn-BD` and `en-BD` money formats.
- **Validation run:**
  - `node scripts/contrast.mjs` on all 13 token pairs. Text pairs are 5.03:1 to 16.26:1; the control border is 3.41:1, enough for its UI-component use. `--line` is 1.40:1 and is decorative only.
  - Catalogue validator: 0 errors, 0 warnings. Ajv: all 4 catalogue files valid.
  - Decision-status consistency check across the six docs.
  - Skill completeness: expected failures only (no app yet).
- **Not done (not authorised):** no application code, no database connection or import, no deployment, no motion plan or build plan (those are Checkpoint 4).
- **Open:** D11 catalogue review; all prices; all images; BSTI, BTRC, courier and polythene checks **[L]**; D12 location dataset; D5 hosting; Bengali rendering and font sizes to be verified in the build prototype; `SCHEMA.md` API surface and admin sections to be completed at Checkpoint 4.
- **Next:** owner approves, redirects or asks for alternatives at **Checkpoint 3**. Checkpoint 4 (motion plan and build plan) does not start before that approval.

## 2026-10-21 — D11 owner decision: generated starter catalogue (pending owner review; Checkpoint 2 still awaiting approval)

- **Owner decision:** no existing catalogue; the owner authorized the agent to generate a proposed starter catalogue from scratch. D11 is now: **Owner authorized catalogue generation; generated catalogue pending owner review and approval.** The catalogue itself is **not approved**.
- **Done:**
  - Created `catalogue/horekbazar/`, a draft review/import package kept outside `data/` and outside core logic, never read at runtime and excluded from the sellable template.
  - Contents: 39 categories (9 top-level, 30 leaf); 144 products and 235 variants with original Bangla/English names, descriptions, attributes, SKUs (`HB-<CAT>-<NNN>-<VAR>`) and SEO; JSON Schema 2020-12; price research (`PRICE-RESEARCH.md`, `prices.csv`); image manifest plus acquisition checklist; sources; review checklist; gated import instructions; and a zero-dependency validator and report tool.
  - Added `docs/domain-rules.md` §16 (catalogue workflow).
  - Updated `DESIGN.md`, `docs/LICENSING.md`, `README.md` and `AGENTS.md`.
- **Research:**
  - Market mix: DHL/ECDB, BSS reporting BBS 2024-25, DCIF (figures conflict with BSS, unresolved), ShopRank.
  - Prices: official TCB Dhaka retail list of 26 Feb 2026 (XLSX downloaded and read); the TCB daily page returned HTTP 502 on 2026-10-21; October 2026 news corroborates the rice ranges.
  - BSTI mandatory-certification lists: two official PDFs plus secondary reports of later additions.
- **Draft state (verified by the validator):**
  - Every record is `draft` / `pending_owner_review`.
  - Stock is 0, `unverified` and `unavailable`.
  - `brand: null`, and all 144 products have images `missing`.
  - Prices: 39 are reference-derived from TCB; 196 are unsourced estimates; all require owner review; no compare-at prices.
  - BSTI flags: 33 likely, 43 unknown, 68 not found. All flags are **[L]**.
- **Validation run:**
  - `node catalogue/horekbazar/tools/catalogue.mjs validate`: 0 errors, 0 warnings.
  - Ajv 8 (draft 2020-12, strict, formats; run outside the repo, no dependency added): all 4 files valid.
  - Negative test on a mutated copy: both validators rejected it. The validator reported 10 errors: stock above 0, an added `rating` field, a pre-approved record, an invented compare-at price, "100% pure organic" copy, a duplicate SKU, an SKU/id mismatch and `importAllowed: true`.
- **Not done (not authorized):** no database connection, no import, no application code, no images sourced.
- **Open:** owner review of taxonomy, products, brands and every price; image acquisition; BSTI, BTRC, courier and polythene checks **[L]**; D12 location dataset (unchanged, open); D5 deferred.
- **Next:** owner reviews the catalogue package and approves (or redirects) Checkpoint 2. Checkpoint 3 does not start until Checkpoint 2 is explicitly approved.

## 2026-10-21 — Checkpoint 2 amendments (waiting for final Checkpoint 2 approval)

- **Done:** applied owner decisions to `DESIGN.md` and `docs/domain-rules.md`; added §12 replica-set requirement, §13 outbox scheduler (`JOBS_TRIGGER`: `worker` / `http` / `vercel-cron` on Pro only), §14 Zod → MongoDB validator generation with CI checks, §15 legal basis register (all legal points marked **[L]**, need local legal review); rewrote §5 pricing (integer minor units, rounding, coupon eligibility/minimums, free-delivery coupons, largest-remainder allocation, partial-cancellation fairness rule); defined the 100-on-10 stock concurrency proof; researched BD location datasets (§6.1); updated `docs/LICENSING.md` with data attribution and catalogue-rights notes.
- **Verified:** `zod@4.6.7` ships `z.toJSONSchema`; `better-auth@1.7.12` exports `./plugins/two-factor`; MongoDB docs: transactions need a replica set; Atlas Free clusters: 3-node replication, 100 ops/s, 500 connections, backups available (corrected an earlier wrong claim); Vercel Hobby cron: once per day, per-hour (±59 min) precision; COD-AB Bangladesh: CC BY-IGO 3.0, 507 upazila features. Removed an unverified "cron not retried" claim; aligned `README.md` and `DESIGN.md` `data/` wording with D11.
- **Decided (owner, approved in principle):** D7 staff 2FA, D8 promotions, D9 rewards as non-cash loyalty discount (legal review before launch), D10 localisation, D13 phone + admin confirmation, D14 no SMS, D15 no online payments, D16 exclusions; D5 deferred.
- **Open:** D11 real catalogue (owner supplies/approves; empty dev DB meanwhile), D12 location dataset selection (licence, attribution, version, 495 vs 507 upazila count to reconcile).
- **Next:** owner approves Checkpoint 2 → Checkpoint 3 (design research and direction). No application code until Checkpoint 4 is approved.

## 2026-10-21 — Process rule added

- **Done:** added `AGENTS.md` (owner working rules, repo boundaries, hard rules) and this log.
- **Decided (owner):** push after every phase and change; summary per phase here; all changed `.md` files delivered as one copyable block.
- **Next:** owner answers Checkpoint 2.

## 2026-10-21 — Checkpoint 2: Product contract (PROPOSED, waiting for approval)

- **Done:** product contract, type research (Chaldal, Rokomari, Shajgoj Shop, Pickaboo, Medusa starter), Scope table (33 storefront routes, 27 admin surfaces, 12 journeys, states, edges, skeletons) in `DESIGN.md`; detailed rules in `docs/domain-rules.md`; licence plan in `docs/LICENSING.md`. Scope table parses with the skill's `completeness.mjs` (failures only for unbuilt routes and the Step 2 research record).
- **Decided (owner):** no mock-data fallback, real dev database, `data/` is seed input only; basic commercial licence, provisional. D1 Better Auth, D3 push library chosen later, D4 polling chat + optional Ably accepted with Checkpoint 1.
- **Open:** D5 Vercel scope/tier, D7 staff 2FA, D8 promotion stacking, D9 rewards legal shape, D10 URL strategy, D11 real catalogue, D12 BD location dataset, D13 customer verification, D14 SMS, D15 online payments, D16 exclusions.
- **Next:** after approval → Checkpoint 3 (design research, 2–3 directions, synthesis, type, colour, `DESIGN.md` + `SCHEMA.md`).

## 2026-10-21 — Setup and Checkpoint 1: Stack (approved with amendments)

- **Done:** `gh` authenticated as `dev-asfakul`; created private `dev-asfakul/horekbazar`; inspected `asfakulsiam/asfakulsiam-motomation-design` (public, untouched); installed skill v3.0.2 (identical to upstream); audited Node 20.20.2 / npm 10.8.2; Vercel CLI authenticates but default scope `dev-choice` rejects the token.
- **Decided:** Next.js 16 App Router, React 19, strict TS, Tailwind 4, Radix/shadcn, Zod, MongoDB official driver, Better Auth, Upstash Redis, MongoDB outbox + cron, Cloudinary, Resend, Gemini (server-only), next-intl; host-portable.
- **Next:** Checkpoint 2.
