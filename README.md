# HorekBazar

A reusable, self-hosted single-store e-commerce template. HorekBazar is the flagship demo shop.

Status: **planning**. Checkpoint 1 (stack) and Checkpoint 2 (product contract, with conditions) are approved; Checkpoint 3 (research and direction): the "Khata" direction is accepted in principle and was amended after the owner's review, and the owner directed moving forward. Checkpoint 4 (build plan, `docs/BUILD-PLAN.md`) is proposed and awaiting approval, together with explicit Checkpoint 3 approval. No application code yet, no database import, no deployment. Open decisions: D11 (generated catalogue pending owner review and approval), D12 (location dataset, open), D5 (hosting, deferred). The architecture is being decided through the Motomation Design checkpoints:

- [`DESIGN.md`](./DESIGN.md): audit, stack, product contract and scope
- [`docs/domain-rules.md`](./docs/domain-rules.md): roles, order lifecycle, inventory, pricing, integrations, configuration, security, acceptance criteria
- [`docs/LICENSING.md`](./docs/LICENSING.md): provisional licensing plan

## Data policy

The application reads only real, configured data sources. There is no mock or demo fallback. `data/` holds only catalogue content the store owner supplies or explicitly approves (real prices, legitimate image rights). It is imported into a separately configured development database with an explicit seed command, and it may be empty: an empty database is a valid state.

`SCHEMA.md` is the data contract (draft v0.2, Checkpoint 4, proposed), `MOTION.md` describes motion (proposed), and `DATA.md` explains why `data/` contains no demo data.

`catalogue/horekbazar/` holds a **generated draft starter catalogue pending owner review** (decision D11). It is a review/import input only: never read at runtime, never published, never imported without explicit owner approval, and excluded from the sellable template. See [`catalogue/horekbazar/README.md`](./catalogue/horekbazar/README.md). Never copy production customer data into development.

## For contributors and agents

Start with [`AGENTS.md`](./AGENTS.md) and [`docs/PROGRESS.md`](./docs/PROGRESS.md).


The design workflow skill is not vendored. Install it locally:

```bash
npx skills add asfakulsiam/asfakulsiam-motomation-design
```

Copy `.env.example` to `.env.local` for local configuration. Never commit `.env` files.
