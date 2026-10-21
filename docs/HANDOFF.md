# Handoff for the next developer or agent

Last updated 2026-10-21 (Asia/Dhaka), after Phase B3 (identity). Read this first, then
`AGENTS.md`, `DESIGN.md`, `docs/BUILD-PLAN.md` §11 (phases) and §13 (open decisions),
`docs/STATUS.md` (verified state per requirement) and the newest entries of `docs/PROGRESS.md`.

## Where the project is

| Phase | State |
|---|---|
| B0 toolchain, B1 shell, B2 data platform | merged to `main` (PRs #1, #2, #3) |
| B3 identity | built on `preview/horekbazar-v1`; PR to `main` (see PROGRESS for its number and CI result) |
| B4 catalogue admin and later | not started; each phase needs explicit owner approval (BUILD-PLAN §0) |

Deployment: no deployed environment has been verified for B2 or B3. Two Vercel projects exist
(`horekbazar`, `horekbazar-preview` in team `dev-choice`); the owner has not said which is
canonical. Do not guess.

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
- Motomation gate failures carried from B1 (SEO rules on noindex setup pages, search-form states)
  belong to B5. See PROGRESS for the B3 gate result on `/login` and `/admin/setup`.
- WebKit 375 px "keyboard focus is never hidden by the dock" is intermittent (`retries: 0`);
  investigate rather than weaken it.
- `experimental.authInterrupts` is still a proposed decision.

## Waiting on the owner

1. Rotate every credential pasted into the chat; create a least-privilege MongoDB user
   (`readWrite` on `horekbazar_dev`); keep production on a separate cluster (D19).
2. Verify a Resend domain and set `EMAIL_FROM` on it.
3. Set `SETUP_TOKEN`, then create the first Owner at `/admin/setup`.
4. Confirm D23 and the proposals `SETUP_TOKEN` and `secondFactorAt` (DESIGN.md Decision trace).
5. Name the canonical Vercel project, give the agent's Vercel token access to `dev-choice`, and
   add the environment variables there per environment.
6. Approve B4 and decide D11 (catalogue source); D12/D21, D5, D20, D22 and coupon restoration
   on cancellation remain open.
