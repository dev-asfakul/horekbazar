# HorekBazar admin redesign: Proposal A1 (approved) and Checkpoint 4 build plan

Motomation v3.0.2, full route. Status: **direction approved by the owner (2026-10-24, "approved! build it"). Build plan below is for owner approval. Nothing is built yet.**

- Checkpoint 1 Stack: answered by the brief (keep the project's stack).
- Checkpoint 2 Product contract: answered by the owner's Proposal A1 brief plus the verified 22-section inventory (section 3).
- Checkpoint 3 Direction: Proposal A1, approved 2026-10-24. Mockups: `docs/proposals/admin-a1/` (static, sample data).
- Checkpoint 4 Build plan: this document, **waiting for approval**.

```
MOTOMATION PLAN (Checkpoint 4)
Rules       : gates/rules.md read; designing within it
Stack       : Next.js 16.4.2 App Router, React 19.3.1, next-intl, MongoDB (from the project) → adapters/next.md
Scope       : /admin shell, /admin home, restyle of all 22 admin sections; storefront and account untouched
Delivery    : branch feat/admin-a1 from main · PR for review · never pushed to main before Checkpoint 6
Dials       : ENERGY 1 · RHYTHM 1 · MOTION 1 → Tier 1 (task surfaces; no decorative motion)
Type        : Alkatra 700 (wordmark, page and section headings) / Google Sans 400–700 (everything else)
Palette     : the storefront base "day" tokens only (#f6f9ef ground, #e9f0da surface, #fff raised, #121a0f ink, #c6f432 action)
Not doing   : charts, dark mode, time-of-day themes, new permissions, auth changes, schema/validator/index changes, new dependencies, new business features
```

## 1. Decisions recorded with the approval

The owner approved A1 "as shown". Where the proposal listed an open question, the version shown in the mockups is taken as the decision, and the owner can still override it:

| Question | Decision (as shown) |
|---|---|
| Return-request count | `returns.status = "requested"` only |
| Low-stock count | Variants (same rule as the Inventory page's `low=1` filter), labelled "Low-stock items" |
| Groups | Sales · Customers · Catalogue · Storefront · Marketing · Settings (Settings, Delivery, Staff, Security) · System (Health, Audit log) |
| "Settings" label inside the Settings group | Kept unchanged (no copy change) |
| Product bulk status on phones | Collapsed behind "Select products" (works without JavaScript via `<details>`) |
| Badges in the menu and sidebar | Orders and Messages show their waiting count, as in the mockups |
| Docs | Committed to `main` per AGENTS.md rule 1 |

## 2. Storefront → admin token map (implemented values, `app/store.css` base theme)

| Role | Value | Admin use |
|---|---|---|
| ground | #f6f9ef | page background |
| surface | #e9f0da | sidebar, icon wells, notices, label tiles |
| raised | #ffffff | cards, fields, secondary buttons |
| ink / muted | #121a0f / #56604f | text, ink badges / secondary text |
| line / line-strong | #dfe6d2 / #7d8a6f | card borders / field and secondary-button borders |
| accent | #c6f432 on ink | primary buttons, active nav pill |
| link | #3b6300 | links, focus ring (3 px) |
| success / warning / danger | #2a6b1f / #8a5a00 / #b3261e | status chips, stale warning, errors and destructive buttons |
| radii | 20 card · 18 plate · 14 field · pill buttons | same |

## 3. Verified section inventory (unchanged URLs and capabilities)

Source: `lib/admin/sections.ts`. Every page still calls `gateStaffPage`, and every action calls `decideAccess`.

| Group | Section | URL | Capability |
|---|---|---|---|
| Sales | Orders | /admin/orders | orders.read |
| Sales | Shipments | /admin/shipments | fulfilment.write |
| Sales | Returns | /admin/returns | returns.process |
| Customers | Customers | /admin/customers | customers.read |
| Customers | Messages | /admin/messages | messages.reply |
| Customers | Reviews | /admin/reviews | reviews.moderate |
| Catalogue | Products | /admin/products | catalogue.write |
| Catalogue | Categories | /admin/categories | catalogue.write |
| Catalogue | Inventory | /admin/inventory | inventory.adjust |
| Catalogue | Collections | /admin/collections | merch.write |
| Storefront | Homepage | /admin/homepage | merch.write |
| Storefront | Banners | /admin/banners | merch.write |
| Marketing | Promotions | /admin/promotions | promotions.write |
| Marketing | Coupons | /admin/coupons | promotions.write |
| Marketing | Rewards | /admin/rewards | rewards.write |
| Marketing | Notifications | /admin/notifications | campaigns.send |
| Settings | Settings | /admin/settings | settings.write |
| Settings | Delivery | /admin/settings/delivery | delivery.write |
| Settings | Staff | /admin/staff | staff.manage |
| Settings | Security | /admin/security | any staff |
| System | Health | /admin/health | platform.read |
| System | Audit log | /admin/audit | platform.read |

(This corrects capability names that were summarised loosely in the proposal notes.)

## 4. Route by route

### Shell (every /admin page)

| Part | Behaviour | Component |
|---|---|---|
| Top bar (< 1024 px) | 56 px, sticky: menu button (44 px circle), current section name, "HorekBazar" wordmark linking to /admin; safe-area padding | **Adapt** `AdminShell.tsx` |
| Full-screen menu (< 1024 px) | native `<dialog>` + `showModal()`: focus to Close, Escape closes, focus returns to the menu button, background inert; identity card (name, role, 2-step state) at top; 7 groups with permitted sections; sticky "View store" and "Sign out" (existing `signOutAction` form); closes on navigation | **Build** `AdminMenu.tsx` (client) |
| Sidebar (≥ 1024 px) | fixed 272 px on surface, own scroll; Home + 7 groups; active item has the lime pill behind its icon and `aria-current="page"` (longest-prefix match, so Delivery doesn't also mark Settings); identity, View store, Sign out at the bottom | **Build** `AdminNav.tsx` (client, `usePathname`), rendered by `AdminShell` |
| Restricted shell | When 2-step enrolment or a second factor is pending, the shell shows only Security (same rule as today, `decideStaffShell`). Signed out or setup shows the bare top bar. | `AdminShell` |
| Badges | Orders and Messages waiting counts, computed in the layout through `work-counts.ts`; hidden on error or zero; refresh on full page load | layout |
| Icons | 15 new paths added to `components/ui/Icon.tsx` in its existing 24 px / 1.9 stroke style | **Adapt** `Icon.tsx` |

Without JavaScript, the menu button does nothing. The wordmark still goes to /admin, whose tiles reach every permitted section, so navigation still works.

### /admin (home)

1. h1 "Admin home", plus "Signed in as {name} · {role}".
2. **Work waiting**: up to 4 count cards. Each shows only with its capability and links to the existing filtered URL. Each one streams in its own `<Suspense>` with a skeleton, and a failure shows "Couldn't load" (never 0). Values over 99 show "99+".
3. **Quick actions**: "New product" → /admin/products/new (catalogue.write), and a "Find a customer" GET form → /admin/customers?q= (customers.read). If neither is permitted, the block is hidden.
4. **Sections**: grouped tiles (icon, label, existing description), permitted sections only.

| Count | Query (read-only, existing data) | Index |
|---|---|---|
| Orders awaiting confirmation | `orders.countDocuments({ status: "pending_confirmation" }, { limit: 100 })` | `status_placedAt` |
| Open messages | `conversations.countDocuments({ status: "open" }, { limit: 100 })` | `status_lastMessageAt` |
| Return requests to review | `returns.countDocuments({ status: "requested" }, { limit: 100 })` | `status_updatedAt` |
| Low-stock items | `stock.countDocuments({ $expr: { $lte: ["$available", "$lowStockThreshold"] } }, { limit: 100 })` | none (same scan the Inventory page already runs; capped) |

### Lists (Orders, Shipments, Returns, Messages, Reviews, Customers, Products, Inventory, Coupons, Promotions, Audit log …)

- CSS-only re-skin of the existing `record-cards`, `record-table`, `staff-rows`, `admin-filters`, `admin-pager`, `admin-empty` and `status-chip` classes, scoped to `html[data-admin]`.
- Phones: rows become white cards (20 px radius). Filters become a compact grid of pill selects with Apply. Wide tables keep the existing card fallback below 768 px.
- No query, field, filter, limit or pagination changes. Orders keeps its latest-200 list.
- **Products**: `BulkStatusForm` sits inside a `<details>` titled "Select products". Same form, fields and action.

### Forms and details (product edit, order detail, settings, staff, security, setup …)

- Re-skin `field-input`, `btn-*`, `form`, `field-error`, the error summary and `admin-section` as storefront fields, pills and cards. Labels, hints, validation and actions are unchanged.
- **Order detail**: from 1024 px, a two-column layout (items, totals and timeline on the left; status actions, address and payment on the right). This needs wrapper `<div>`s only, with no logic change.

### Motion

Tier 1 only: colour and background transitions of 150 ms on `--ease-out` for hover and focus. The dialog fades in over 160 ms, and only under `prefers-reduced-motion: no-preference`. Nothing else moves.

## 5. Files

New:
- `app/admin.css`: admin skin, everything scoped to `html[data-admin]`. Fonts use the same self-hosted files as `store.css`. No inline styles (CSP nonce).
- `components/admin/AdminNav.tsx`, `components/admin/AdminMenu.tsx`
- `lib/admin/work-counts.ts` (server-only), `lib/admin/active-section.ts` (pure)
- `tests/unit/admin-sections.test.ts`, `tests/unit/admin-active-section.test.ts`, `tests/integration/admin-work-counts.test.ts`, `tests/e2e-db/admin-shell.spec.ts`

Changed:
- `lib/admin/sections.ts`: adds `group` and `icon` fields and a group order. Capabilities and order of checks are unchanged.
- `components/admin/AdminShell.tsx`, `app/admin/layout.tsx` (imports `admin.css`, adds `data-admin`, theme colour #f6f9ef, Google Sans preload), `app/admin/page.tsx`
- `components/admin/BulkStatusForm.tsx` (wrapper only), `app/admin/orders/[orderNumber]/page.tsx` (wrappers only)
- `components/ui/Icon.tsx` (new paths)
- `messages/en.json`, `messages/bn.json` (new keys: group names, home counts, quick actions, menu; key parity kept)
- `DESIGN.md` (admin section), `docs/PROGRESS.md`, `docs/STATUS.md`

Not changed: `lib/modules/**` business logic, server actions, API routes, auth and 2FA, capabilities and roles, `db/validators`, `lib/db/collections.ts` (indexes), migrations, `package.json` and the lockfile, `app/store.css` and storefront components.

## 6. Regression risks and tests

| Risk | Test |
|---|---|
| A section missing or duplicated in groups | unit: all 22 `ADMIN_SECTIONS` appear exactly once, group order fixed |
| Wrong active item (Settings vs Delivery, Products vs product detail) | unit: longest-prefix matcher cases |
| Count definitions drift, or counts leak to roles without the capability | integration (memory replica set): seeded orders, conversations, returns and stock give expected counts; a role without the capability gets `null`; 3 indexed counts use IXSCAN (explain) |
| Nav shows forbidden sections, or the server stops enforcing | e2e-db: catalogue-only staff sees only Catalogue plus Security in the sidebar and menu; direct `/admin/orders` is still refused |
| Menu keyboard and focus | e2e-db: open, focus on Close, Tab stays inside, Escape closes, focus returns to the menu button; link navigation closes it |
| Sign out, View store, 2FA-pending shell | e2e-db: sign-out returns to login; 2FA-pending role sees only Security |
| Storefront restyled by accident | existing storefront e2e, plus screenshot check that `store.css` output is unchanged |
| Existing admin flows | existing `tests/e2e-db/*` (catalogue-admin, admin-records, commerce/*) unchanged and passing |
| CSP | no inline `style` attributes; the e2e suite runs under the production CSP |

Validation: screenshots at 375, 768 and 1440 for home, menu, a list, a form and order detail (Checkpoint 5), plus `npm run lint`, `typecheck`, `test`, `test:integration`, `db:validators -- --check`, `build`, `check:bundle`, `test:e2e`, `test:e2e:db`. Only results that actually ran will be reported.

## 7. Increments (each its own commit on `feat/admin-a1`)

1. Tokens and `admin.css` base, plus layout `data-admin` (looks change; structure same)
2. Groups, active matcher, `AdminNav` and `AdminMenu`, new shell
3. Work counts, home page
4. List and filter re-skin, products bulk collapse
5. Forms and order-detail layout
6. Tests, docs, screenshots → Checkpoint 5
