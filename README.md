# HorekBazar

A reusable, self-hosted single-store e-commerce template. HorekBazar is the flagship demo shop.

Status: **Phase B2 (data platform)** under review; B0 and B1 are merged to `main`. Checkpoints 1 (stack) and 3 (the amended "Khata" direction) are approved; Checkpoints 2 (product contract) and 4 (build plan, `docs/BUILD-PLAN.md`) are approved with conditions. The app is a toolchain skeleton that shows a setup-required page; there is no store functionality, no database import and no deployment. Open decisions: D11 (generated catalogue pending owner review and approval), D12 (location dataset, open), D5 (hosting, deferred). The architecture is being decided through the Motomation Design checkpoints:

- [`DESIGN.md`](./DESIGN.md): audit, stack, product contract and scope
- [`docs/domain-rules.md`](./docs/domain-rules.md): roles, order lifecycle, inventory, pricing, integrations, configuration, security, acceptance criteria
- [`docs/LICENSING.md`](./docs/LICENSING.md): provisional licensing plan

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
npm start              # standalone production server (output: "standalone")
npm run check:bundle   # fails if a secret-shaped or server-only value is in the client bundle
npm run catalogue:validate && npm run catalogue:schema
```

`/api/health` reports whether the app is configured and the checked database state (`not_configured`, `connected`, `not_replica_set`, `unreachable`). It never echoes configuration values. `/admin/health` lists every integration by name and state; a production build requires the `platform.read` staff permission (staff accounts arrive in B3), and a local `npm run dev` server opens it with a notice.

### Database

The store needs a MongoDB **replica set**, because orders use multi-document transactions; a standalone `mongod` is refused. Every MongoDB Atlas cluster, including the free M0, is a replica set. Locally, start `mongod --replSet rs0` and run `rs.initiate()` once.

1. Create `.env.local` (git-ignored) with `MONGODB_URI=` and optionally `MONGODB_DB=` (default `horekbazar`). Use a database user that can only reach this database, and a different cluster or database per environment.
2. `npm run db:migrate` creates the collections with their validators and indexes. It is idempotent: run it after every pull or deploy.
3. Background work goes through the outbox. Set `JOBS_TRIGGER=worker` and run `npm run worker` next to the web server, or `JOBS_TRIGGER=http` with a `CRON_SECRET` and a scheduler that calls `POST /api/jobs/drain` with `Authorization: Bearer <CRON_SECRET>` (`docs/domain-rules.md` §13).

The integration tests never use `MONGODB_URI`; they start their own disposable replica set. On a Linux release that `mongodb-memory-server` does not recognise yet, set `MONGOMS_DISTRO=ubuntu-24.04`.

## For contributors and agents

Start with [`AGENTS.md`](./AGENTS.md) and [`docs/PROGRESS.md`](./docs/PROGRESS.md).


The design workflow skill is not vendored. Install it locally:

```bash
npx skills add asfakulsiam/asfakulsiam-motomation-design
```

Copy `.env.example` to `.env.local` for local configuration. Never commit `.env` files.
