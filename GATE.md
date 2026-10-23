# GATE.md (DRAFT, B11, 2026-10-23)

This draft records the B11 verification run: the Motomation skill gate and the BUILD-PLAN §12 checks. The **owner signs off on Checkpoint 6, not this file**. Results come from the agent sandbox (2 CPUs, Linux, Node 24.22.1, Playwright 1.64.1) unless a row says otherwise. Anything not measured is marked **NOT TESTED** or **BLOCKED** with the reason. Nothing here claims capacity.

## Motomation gate (`asfakulsiam-motomation-design`, `scripts/gate.mjs`, gate/4)

Skill source: https://github.com/asfakulsiam/asfakulsiam-motomation-design (the commit is pinned in `skills-lock.json`).

| Target | Build | Result | Stamp / note |
|---|---|---|---|
| `http://localhost:3400/` | local standalone production build, **no environment variables** (shows "setup required") | **FAIL** (rules only) | `gate: c0 o0 w0 rm0 a0 n0 q0 k0 · rules: C0 S4 P0 K0 · gate/4 · faa9bb496e · skipped 1/21@768`. All 26 journey pages load. Contrast, overflow, wording, motion, names, numbers, quality, access (focus 15/15, targets, zoom, reflow, forced colours, no keyboard trap) and the security rules pass. SEO fails: seo-03 noindex, seo-04 no canonical, seo-06 no description, seo-18 no og:image. The setup page is noindex and has no canonical **by design** (it must not be indexed). Target warning: the footer link "রিটার্ন" is 32×44 px |
| `http://localhost:3300/` and other pages | same build, with the `horekbazar_dev` showcase data (read-only browsing) | **NOT VERIFIED** | Two runs stopped making progress: CPU load near 0, connections to the server held open, timed out after 600 s in both footprints. The pages answer in under 1 s in a separate Playwright probe (load 547 ms, network idle 720 ms). Cause not found; to be investigated in Phase C/D with the skill author's tooling |
| `http://localhost:3300/p/ballpoint-pens-pack-of-10` | same build and data, light then standard footprint | **NOT VERIFIED** | stalled both times; see "Late result" |

Smoothness (Q) is not judged on a 2-CPU sandbox (the gate says "sandbox: 2 CPUs").

## §12 matrix: B11 rows

| Check | Result | Evidence |
|---|---|---|
| Security headers and CSP (D17 option a) | **PASS** (local and live) | `lib/security/headers.ts`, applied by `proxy.ts` to every page and API route. Live `https://horekbazar-preview.vercel.app` (2026-10-23): `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'` (no `unsafe-inline`, no `unsafe-eval` in production), `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, `upgrade-insecure-requests`; HSTS `max-age=63072000; includeSubDomains; preload`; `nosniff`; `strict-origin-when-cross-origin`; Permissions-Policy denies camera, microphone, geolocation, payment, usb and interest-cohort. Unit and e2e tests: `tests/unit/headers.test.ts`, `tests/e2e/shell.spec.ts` ("the real response keeps upgrade-insecure-requests") |
| Rate limits | **PASS** (review) with low findings | 20 limits in `lib/modules/identity/limits.ts`, every one used. Every unauthenticated write has a limit (sign-in, sign-up, reset, verification, OAuth, two-step, setup, cart, coupon, checkout). Not limited: cheap authenticated owner-scoped writes (profile, address delete/default, cancel own order, sign out, session revoke, push unsubscribe), and staff actions, which are capability-checked and audited. Recommendation (Phase C): add `accountChange` to the profile, address and cancel actions |
| Dependency audit | **PASS** for production | `npm audit --omit=dev`: 0 vulnerabilities. Full tree: 5 high, all in the dev-only ESLint chain (`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`); not shipped |
| Secrets in the client bundle | **PASS** | `npm run check:bundle`: "no secret-shaped strings or server-only values in the client bundle" |
| Performance budget (JS) | **PASS** for anonymous storefront pages | gzip -9 of the `<script>` chunks each page loads, with Next's `rootMainFiles` counted as framework and the `noModule` polyfill excluded. Framework 128.2 KB. Beyond framework: `/` 20.8 KB, `/c/grocery` 20.8 KB, `/p/…` 22.5 KB, `/cart` 22.5 KB, `/login` 22.5 KB (budget ≤ 30 KB). Admin pages behind sign-in: **NOT TESTED** |
| LCP, INP, CLS | **NOT TESTED** | No Lighthouse or field data in the sandbox. The gate's perf rules (P0) pass on the setup page only |
| Accessibility | **PARTIAL** | Gate access axis passes on the setup page (focus, targets, zoom 200%, reflow at 320 px, forced colours, no trap). Existing keyboard, focus and dock tests pass on three engines (`tests/e2e/shell.spec.ts`). No axe-core run: adding it would be a new dependency, which needs approval. Screen-reader testing: **NOT TESTED** |
| SEO | **PASS** with one fix in this branch | All 382 sitemap URLs on the local build with showcase data: HTTP 200, exactly one canonical equal to the sitemap URL, a complete `bn`/`en`/`x-default` hreflang set, JSON-LD that parses, one `<h1>`. Every page is `noindex, follow` and robots.txt disallows everything **on purpose** until launch (`lib/env.ts` indexing switch, off by default). Fixed: product pages had no `og:image`; they now share the first product photo (verified on 91 photo products, the Cloudinary URL answers 200 `image/jpeg`; products without a photo get no tag). No site-wide share image or favicon exists (MEDIA.md) |
| Tests, three engines | **PASS** | Zero-env Playwright (Chromium, Firefox, WebKit): 230 passed, 58 skipped, 0 failed. Skips: 57 opt-in screenshot captures (`E2E_SCREENSHOTS=1`); 1 WebKit maintenance case (HTTP-only server; WebKit would upgrade the font request). `test:e2e:db` (Chromium, in-memory replica set): 30 passed, 1 skipped ("registration is not available in this environment") |
| Unit, integration, lint, types, validators | **PASS** | unit 196, integration 192 (part b branch); lint and typecheck clean; `db:validators --check` OK |
| Load test (k6, 50,000 users) | **NOT RUN** | `load/k6/storefront-mix.js` covers the read-only share of the plan. It needs a staging deployment equal to production, its own database, synthetic accounts and an approved budget; none exist. This is **not** a capacity claim |
| Real push and e-mail delivery | **NOT TESTED** | Never sent without explicit owner authorisation |
| Vercel environment | **BLOCKED** | No Vercel access in the sandbox |

## Late result

The data-backed product-page run (`/p/ballpoint-pens-pack-of-10`) was tried twice more, in the light footprint and then in the standard footprint with `--timeout 1400`. Both stalled the same way: no output, CPU idle, about 15 minutes each. Both were stopped. **The data-backed gate is NOT VERIFIED** (Phase C finding C-06).
