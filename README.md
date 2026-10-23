# HorekBazar

A reusable, self-hosted single-store e-commerce template. HorekBazar is the flagship demo shop.

Status (2026-10-23): phases B0–B9 and B10 part a are merged to `main` and deployed to the development preview, https://horekbazar-preview.vercel.app (which database it uses cannot be verified without Vercel access). B10 parts b and c are in open pull requests. B11 (hardening and documentation) is in progress. **It is not production-ready.** See [`docs/STATUS.md`](./docs/STATUS.md) for what is verified, and for the blockers: location dataset (D12, blocks checkout addresses), courier credentials, legal copy (`[NEEDS COPY]`), store contact details, product images and banners, real push and e-mail delivery.

Documents:

- [`DESIGN.md`](./DESIGN.md): audit, stack, product contract, scope and the decision trace
- [`docs/domain-rules.md`](./docs/domain-rules.md): roles, order lifecycle, inventory, pricing, integrations, configuration, security, acceptance criteria
- [`docs/BUILD-PLAN.md`](./docs/BUILD-PLAN.md): phases, verification matrix, risks and owner decisions
- [`SCHEMA.md`](./SCHEMA.md), [`DATA.md`](./DATA.md), [`MOTION.md`](./MOTION.md): data contract, data policy, motion
- [`MEDIA.md`](./MEDIA.md): every font and image with its source and licence
- [`docs/LICENSING.md`](./docs/LICENSING.md) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md): provisional licensing plan and the dependency licence inventory (draft). There is **no `LICENSE` file yet**: the licence text must be written or reviewed by a lawyer before the template is sold
- [`CHANGELOG.md`](./CHANGELOG.md), [`GATE.md`](./GATE.md), [`CRITIQUE.md`](./CRITIQUE.md): history, the latest design-gate run, the advisory critique

## Data policy

The application reads only real, configured data sources. There is no mock or demo fallback. `data/` holds only catalogue content the store owner supplies or explicitly approves (real prices, legitimate image rights). It is imported into a separately configured development database with an explicit seed command, and it may be empty: an empty database is a valid state.

`SCHEMA.md` is the data contract (draft v0.2.2, Checkpoint 4, approved with conditions), `MOTION.md` describes motion (Checkpoint 4, approved with conditions; not built yet), and `DATA.md` explains why `data/` contains no demo data.

`catalogue/horekbazar/` holds a **generated draft starter catalogue pending owner review** (decision D11). It is a review/import input only: never read at runtime, never published, never imported without explicit owner approval, and excluded from the sellable template. See [`catalogue/horekbazar/README.md`](./catalogue/horekbazar/README.md). Never copy production customer data into development.

## Development setup

Requirements: Node.js 24 LTS (`.nvmrc`; `package.json` `engines` is `>=24 <25`) and npm 11.

```bash
npm ci
npx playwright install --with-deps chromium firefox webkit
npm run dev            # http://localhost:3000: setup-required until the store is set up
npm run lint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # Vitest unit tests
npm run db:validators -- --check   # generated MongoDB validators match db/validators/
npm run test:integration           # disposable MongoDB 8.0 replica set (downloads mongod once)
npm run build          # works with zero environment variables
npm run test:e2e       # Playwright against the standalone production build (run build first)
npm run test:e2e:db    # signed-in admin journeys, build + disposable in-memory database (Chromium)
npm start              # standalone production server (output: "standalone")
npm run check:bundle   # fails if a secret-shaped or server-only value is in the client bundle
npm run catalogue:validate && npm run catalogue:schema
```

`/api/health` reports whether the app is configured and the checked database state (`not_configured`, `connected`, `not_replica_set`, `unreachable`). It never echoes configuration values. `/admin/health` lists every integration by name and state and needs a staff account with the `platform.read` permission (Owner or Store manager).

### Accounts and the first Owner

Accounts need `MONGODB_URI`, `AUTH_SECRET` (32+ characters, e.g. `openssl rand -base64 48`) and `NEXT_PUBLIC_SITE_URL`. Email verification and password reset need `RESEND_API_KEY` and an `EMAIL_FROM` address on a domain verified in Resend.

1. Set `SETUP_TOKEN` (16+ random characters) on the server. Only the person deploying the store should know it.
2. Run `npm run db:migrate`, start the app and open `/admin/setup`. It lists anything still missing, by name only.
3. Enter your name, email, a password and the setup token. Open the verification email, sign in, and set up two-step verification with an authenticator app (required for the Owner). Keep the ten backup codes.
4. Add staff at `/admin/staff`: they register a normal account and verify their email first; you then give their email a role. Every staff change asks for a fresh authenticator code (valid 10 minutes).

5. Manage the catalogue at `/admin/products` and `/admin/categories`, stock at `/admin/inventory` (asks for a fresh code), and the homepage, collections, banners, store settings and delivery zones from the admin menu. Each staff member sees only the sections their role allows, and the server checks the permission on every save. Prices are entered in taka. A product can be published once its category is published and it has an active variant with a price. Image uploads need the Cloudinary variables.

Lost authenticator and backup codes on the last Owner account: run `npm run admin:recover-owner -- owner@example.com` with the deployment's database credentials. It clears two-step verification and signs the Owner out everywhere (audited); set it up again at the next sign-in. Use "Forgot password" for a lost password.

### Database

The store needs a MongoDB **replica set**, because orders use multi-document transactions; a standalone `mongod` is refused. Every MongoDB Atlas cluster, including the free M0, is a replica set. Locally, start `mongod --replSet rs0` and run `rs.initiate()` once.

1. Create `.env.local` (git-ignored) with `MONGODB_URI=` and optionally `MONGODB_DB=` (default `horekbazar`). Use a database user that can only reach this database, and a different cluster or database per environment.
2. `npm run db:migrate` creates the collections with their validators and indexes. It is idempotent: run it after every pull or deploy.
3. Optional, development databases only: `npm run db:seed` (dry run) and `npm run db:seed -- --confirm` load the generated sample catalogue (39 categories, 144 products, 235 variants) as drafts marked `sample: true`, so the admin can be tested with realistic data. It refuses any database whose name does not end in `_dev`. `--remove-samples --confirm` deletes only those records. Their prices are research estimates, not selling prices (`catalogue/horekbazar/IMPORT.md`).
4. Background work goes through the outbox. Set `JOBS_TRIGGER=worker` and run `npm run worker` next to the web server, or `JOBS_TRIGGER=http` with a `CRON_SECRET` and a scheduler that calls `POST /api/jobs/drain` with `Authorization: Bearer <CRON_SECRET>` (`docs/domain-rules.md` §13). The hosted setup uses cron-job.org every minute: `docs/JOBS.md`.

The integration tests never use `MONGODB_URI`; they start their own disposable replica set. On a Linux release that `mongodb-memory-server` does not recognise yet, set `MONGOMS_DISTRO=ubuntu-24.04`.

## For contributors and agents

Start with [`AGENTS.md`](./AGENTS.md) and [`docs/PROGRESS.md`](./docs/PROGRESS.md).


The design workflow skill is not vendored. Install it locally:

```bash
npx skills add asfakulsiam/asfakulsiam-motomation-design
```

Copy `.env.example` to `.env.local` for local configuration. It lists every variable with a comment saying which feature needs it; the app starts with none of them and shows what is missing, by name only, at `/admin/setup` and `/admin/health`. Never commit `.env` files, and use separate credentials for each environment.

### Load testing

`load/k6/storefront-mix.js` implements the read-only part of the k6 plan (docs/BUILD-PLAN.md §12). It has **not been run**: it needs a staging deployment equal to production, its own database and an approved budget. Never run it against production, the development preview or a free Atlas cluster. k6 is an external AGPL tool; install it separately.
