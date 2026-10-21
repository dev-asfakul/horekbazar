# HorekBazar

A reusable, self-hosted single-store e-commerce template. HorekBazar is the flagship demo shop.

Status: **Phase B0 (toolchain)**. Checkpoints 1 (stack) and 3 (the amended "Khata" direction) are approved; Checkpoints 2 (product contract) and 4 (build plan, `docs/BUILD-PLAN.md`) are approved with conditions. The app is a toolchain skeleton that shows a setup-required page; there is no store functionality, no database import and no deployment. Open decisions: D11 (generated catalogue pending owner review and approval), D12 (location dataset, open), D5 (hosting, deferred). The architecture is being decided through the Motomation Design checkpoints:

- [`DESIGN.md`](./DESIGN.md): audit, stack, product contract and scope
- [`docs/domain-rules.md`](./docs/domain-rules.md): roles, order lifecycle, inventory, pricing, integrations, configuration, security, acceptance criteria
- [`docs/LICENSING.md`](./docs/LICENSING.md): provisional licensing plan

## Data policy

The application reads only real, configured data sources. There is no mock or demo fallback. `data/` holds only catalogue content the store owner supplies or explicitly approves (real prices, legitimate image rights). It is imported into a separately configured development database with an explicit seed command, and it may be empty: an empty database is a valid state.

`SCHEMA.md` is the data contract (draft v0.2.2, Checkpoint 4, approved with conditions), `MOTION.md` describes motion (Checkpoint 4, approved with conditions; not built yet), and `DATA.md` explains why `data/` contains no demo data.

`catalogue/horekbazar/` holds a **generated draft starter catalogue pending owner review** (decision D11). It is a review/import input only: never read at runtime, never published, never imported without explicit owner approval, and excluded from the sellable template. See [`catalogue/horekbazar/README.md`](./catalogue/horekbazar/README.md). Never copy production customer data into development.

## Development setup (Phase B0)

Requirements: Node.js 24 LTS (`.nvmrc`; `package.json` `engines` is `>=24 <25`) and npm 11.

```bash
npm ci
npm run dev            # http://localhost:3000 shows the setup-required page (B0 has no store features)
npm run lint
npm run typecheck      # next typegen && tsc --noEmit
npm test               # Vitest unit tests
npm run build          # works with zero environment variables
npx playwright install chromium
npm run test:e2e       # Playwright against the standalone production build (run build first)
npm start              # standalone production server (output: "standalone")
npm run check:bundle   # fails if a secret-shaped or server-only value is in the client bundle
npm run catalogue:validate && npm run catalogue:schema
```

`/api/health` reports whether the app is configured. It never echoes configuration values. With no configuration the app is a setup-required skeleton: no catalogue, no checkout, no database.

## For contributors and agents

Start with [`AGENTS.md`](./AGENTS.md) and [`docs/PROGRESS.md`](./docs/PROGRESS.md).


The design workflow skill is not vendored. Install it locally:

```bash
npx skills add asfakulsiam/asfakulsiam-motomation-design
```

Copy `.env.example` to `.env.local` for local configuration. Never commit `.env` files.
