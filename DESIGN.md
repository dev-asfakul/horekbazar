# HorekBazar: Design and Architecture Record

Status: **Motomation Checkpoint 1 of 6 (Stack): PROPOSED, awaiting approval.**
Nothing below is locked. No application code exists yet.

Skill: `asfakulsiam-motomation-design` v3.0.2 (installed with `npx skills add`, hash in `skills-lock.json`, verified identical to upstream `main`).
Rules: `gates/rules.md` and `principles/authority.md` read; designing within them.
Route: **full** (new brand, new product experience, commerce). Delivery mode: **Production template** (stated in the brief).

---

## 0. Startup audit (2026-10-21)

| Item | Finding |
|---|---|
| Workspace | Empty at start. Node 20.20.2, npm 10.8.2, git 2.53. pnpm not installed. |
| GitHub identity | `gh` authenticated as **dev-asfakul** (id 333819831) through the Perplexity git proxy. `gh auth setup-git` not needed: git is pre-wired to the proxy. |
| `dev-asfakul/horekbazar` | Did not exist (authenticated as the owner, so absence, not a permission error). **Created, private**, default branch `main`. |
| `asfakulsiam/asfakulsiam-motomation-design` | Exists, **public**, default branch `main`, 11 commits, 1 workflow (`.github/workflows/validate.yml`). dev-asfakul has **pull only** on it: this account cannot modify the skill repo, which is the intended separation. Left untouched. |
| Skill install | `npx skills add asfakulsiam/asfakulsiam-motomation-design -y` → `.agents/skills/…` and symlink `.claude/skills/…`. Diffed against the upstream clone: identical. Not vendored into this repo (`.gitignore`); pinned via `skills-lock.json`. |
| Vercel | CLI 50.28.0 authenticates as **dev-asfakul**, but its default scope `dev-choice` rejects the token and `vercel teams ls` fails. Project list not readable. **Blocker for deployment only**; not needed until Checkpoint 5. |
| Secrets | Only variable names inspected; no values printed or stored. `.env*` ignored except `.env.example`. |

---

## 1. Stack (Checkpoint 1)

### Proposed default

| Layer | Choice | Version checked (npm, 2026-10-21) | Licence | Why |
|---|---|---|---|---|
| Framework | Next.js App Router + React | next 16.4.2 · react 19.3.1 | MIT | Routes + data + SEO + streaming; skill default; brief preference. `adapters/next.md`. |
| Language | TypeScript, `strict` | Pin to the version Next 16 supports (TS 7.0.2 is `latest`; compatibility verified at Phase 1 install, else 5.x/6.x) | Apache-2.0 | Brief requirement. |
| Styling | Tailwind CSS v4, CSS variables as theme tokens | 4.3.3 | MIT | Buyer rebranding = token file, not code edits. |
| Accessible primitives | Radix primitives via shadcn/ui source (copied in, owned) | radix-ui 1.8.1 | MIT | Dialog, sheet, menu, combobox, tabs, toast are solved a11y problems; skill says adopt, don't rebuild. Alternative: React Aria. |
| Validation + types | Zod (one schema → TS types, server validation, Mongo `$jsonSchema`) | 4.6.7 | MIT | Replaces an ODM; no second DB abstraction. |
| Database | MongoDB Atlas + **official driver only** | mongodb 7.7.0 | Apache-2.0 | Brief requirement. Multi-document transactions for order + stock + ledger writes; collection validators; atomic `$inc` with guards. |
| Auth | **Better Auth** + official Mongo adapter | better-auth 1.7.12 · @better-auth/mongo-adapter 1.7.12 | MIT | See decision D1. Email/password, Google, reset, verification, DB sessions, roles. |
| Cache / rate limit | Upstash Redis (HTTP) behind a `cache` port | @upstash/redis 1.39.0 · @upstash/ratelimit 2.2.0 | MIT | Serverless-safe (no TCP pool). Port lets a buyer swap to self-hosted Redis without touching features. |
| Background work | **Transactional outbox in MongoDB + cron drain** (no extra vendor). QStash adapter optional | @upstash/qstash 2.12.1 (optional) | MIT | Emails, push, courier sync, search reindex are retried from an `outbox` collection written in the same transaction as the order. |
| Media | Cloudinary, signed direct uploads | cloudinary 2.11.0 (server only) | MIT | Brief requirement. Server signs; browser uploads; no file passes through functions. |
| Email | Resend | resend 6.34.1 | MIT | Brief requirement. Plain, bilingual templates; no React Email dependency unless needed. |
| AI assistant | Gemini, server only, per-buyer key, drafts require admin approval | @google/genai 2.30.0 | Apache-2.0 | Brief requirement. Feature hidden when key unset. |
| Web Push | Standard Push API + VAPID; library TBD (D3) | — | — | `web-push` fails the skill's maintenance and licence checks (below). |
| Realtime chat | `realtime` port: polling/SSE fallback by default, Ably adapter optional (D4) | ably 2.29.0 (optional) | Apache-2.0 | Works on any host; vendor only when a buyer enables live chat. |
| i18n | next-intl, `/[locale]` segments, `bn` + `en` | 4.14.9 | MIT | Localised routes, metadata and `hreflang`. Alternative: hand-rolled dictionaries. |
| Tests | Vitest (unit/integration), Playwright (journeys, gate), mongodb-memory-server (transaction tests) | vitest 5.0.5 · @playwright/test 1.64.1 · mongodb-memory-server 11.3.0 | MIT | Playwright is also what the skill's `gate.mjs` needs. |
| Load test | Grafana k6 as an external binary (not a dependency) | — | AGPL-3.0 (tool only, not distributed) | Reproducible 50K-VU plan in Checkpoint 4. |
| Hosting | Vercel for the HorekBazar demo; template kept host-portable (`output: "standalone"`, no Vercel-only APIs in core) | — | — | Buyers may deploy to Vercel Pro, a Node host or Docker. |

Package manager: **npm** (already present; zero setup for buyers). pnpm optional later.

### The three checks (`craft/stack.md`) on contested dependencies

- **Auth.js / next-auth**: `latest` is still 4.24.15; v5 has been `beta` (5.0.0-beta.32) for years. The Auth.js team announced it has [joined Better Auth](https://better-auth.com/blog/authjs-joins-better-auth) and "strongly recommend new projects to start with Better Auth". → **Rejected for a new commercial template.**
- **web-push 3.6.7**: last published January 2024 (over 12 months), MPL-2.0 (weak file-level copyleft, outside the skill's licence list). → **Flagged.** Candidates: `@block65/webcrypto-web-push` 2.0.0 (MIT, published 2026-09) or `@pushforge/builder` 2.0.5 (MIT, 2026-04); both need the fit check (bundle, security review, single-maintainer risk) at the push phase. Third option: a small in-house RFC 8291/8292 implementation on `node:crypto`.
- **Courier SDKs** (`steadfast-merchant-sdk`, `pathao-merchant-sdk`): unofficial, single maintainer, published this month. → **Rejected as dependencies**; thin typed clients written from each courier's official docs behind a `courier` port.

### Provider limits that shape the architecture (verified today)

| Provider | Free tier | Consequence |
|---|---|---|
| Vercel Hobby | Terms: "only use the Services under a Hobby plan for your personal or non-commercial use" ([Vercel terms](https://vercel.com/legal/terms)) | Hobby is fine for the template's dev/demo; any **selling** store, including a real HorekBazar, needs Pro or another host. |
| Vercel WebSockets | "public beta on all plans and runs on Fluid Compute" ([Vercel docs](https://vercel.com/docs/functions/websockets)) | Not a default dependency for chat while in beta. |
| MongoDB Atlas M0 | 512 MB storage and about 100 ops/sec ([MongoDB pricing](https://www.mongodb.com/pricing)); Flex is billed by ops/sec tiers ([Atlas Flex costs](https://www.mongodb.com/docs/atlas/billing/atlas-flex-costs/)) | Dev only. 50K concurrent users means dedicated clusters **and** a design where browsing traffic is served from cache/CDN, not the database. |
| Upstash Redis | 250 MB, 500K commands/month ([Upstash pricing](https://upstash.com/pricing/redis)) | Dev only; rate-limit and cache key design must be command-frugal. |
| Cloudinary | 25 credits/month ([Cloudinary pricing](https://cloudinary.com/pricing)) | Fine for demo catalogue; buyers upgrade independently. |
| Resend | 3,000 emails/month, 100/day ([Resend pricing](https://resend.com/pricing)) | Matches "selective transactional email"; promotions go to push, not email. |
| Gemini API | Free tier content is "used to improve our products"; paid tier is not ([Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)) | Admin UI must warn buyers that free-tier keys share product text with Google. |
| Ably | 200 concurrent connections, 6M messages/month ([Ably free plan](https://ably.com/docs/platform/pricing/free)) | Optional adapter only. |
| BD couriers | RedX publishes docs + sandbox + webhooks; Steadfast issues API keys; Pathao docs sit behind merchant login ([ArrowBin overview](https://arrowbin.com/blog/courier-api-integration-bangladesh), secondary source) | Need merchant docs/credentials from the store owner before the courier phase. |

### Conflicts resolved by `principles/authority.md`

1. **Skill "runs with `npm install && npm run dev`" with no database vs. brief "production-grade MongoDB".** Proposal: a `catalog` data source with two implementations. With no `MONGODB_URI` the storefront browses read-only demo data from `data/`, and account/checkout screens render with a visible "Demo mode: connect a database to enable orders" state (capability level stated honestly). With `MONGODB_URI` set, everything is live. No order is ever simulated as placed.
2. **Skill security rule sec-03 (RLS)**: MongoDB has no row-level security. Excused with the replacement control: every data access goes through a repository layer that takes the session's `userId`/role and scopes the query; direct collection access outside `lib/db/` is lint-banned.

### Alternatives considered

- **B. Next.js + PostgreSQL (Neon/Supabase) + Drizzle**: stronger relational integrity for orders/ledgers and RLS. Rejected because the brief fixes MongoDB; noted for buyers who ask.
- **C. Separate API service (NestJS/Hono) + Next.js frontend**: clearer scaling of write paths. Rejected for v1: two deployables for every buyer, against "no unnecessary microservices". The `lib/` domain layer is written framework-free so it can be extracted later.

---

## Open decisions (Checkpoint 1)

- **D1 Auth**: Better Auth (proposed) vs. Auth.js v5 beta.
- **D2 Demo mode**: read-only `data/` fallback (proposed) vs. requiring MongoDB even for `npm run dev`.
- **D3 Web Push library**: evaluate `@block65/webcrypto-web-push` / `@pushforge/builder`, or in-house.
- **D4 Live chat default**: polling/SSE fallback + optional Ably (proposed) vs. Vercel WebSockets (beta) vs. ship chat later.
- **D5 Hosting for the flagship demo**: Vercel Hobby (non-commercial demo only) vs. Vercel Pro. Also: which Vercel scope/team should own the project (current token cannot access `dev-choice`).
- **D6 Template licence model**: e.g. single-site / extended commercial licences (affects `LICENSE`, the README and what buyers may resell).

## Decision trace

| Date | Checkpoint | Decision | Status |
|---|---|---|---|
| 2026-10-21 | Setup | Private `dev-asfakul/horekbazar` created; skill repo inspected, not modified | done |
| 2026-10-21 | 1 Stack | Stack above | **proposed** |
