# HorekBazar

A reusable, self-hosted single-store e-commerce template. HorekBazar is the flagship demo shop.

Status: **planning**. No application code yet. The architecture is being decided through the Motomation Design checkpoints:

- [`DESIGN.md`](./DESIGN.md): audit, stack, product contract and scope
- [`docs/domain-rules.md`](./docs/domain-rules.md): roles, order lifecycle, inventory, pricing, integrations, configuration, security, acceptance criteria
- [`docs/LICENSING.md`](./docs/LICENSING.md): provisional licensing plan

## Data policy

The application reads only real, configured data sources. There is no mock or demo fallback. Content in `data/` (added later) is seed content for a separately configured development database, imported with an explicit seed command; replace it with your own before launch. Never copy production customer data into development.

## For contributors and agents

The design workflow skill is not vendored. Install it locally:

```bash
npx skills add asfakulsiam/asfakulsiam-motomation-design
```

Copy `.env.example` to `.env.local` for local configuration. Never commit `.env` files.
