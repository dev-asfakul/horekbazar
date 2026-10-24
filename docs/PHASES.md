# Performance and UX phases B–F

Tracker for the phases after Performance Phase A (PR #46, merged as `1a6496d`). Updated in every phase PR. Phase A's record is in `docs/PROGRESS.md` (2026-10-24) and `docs/BUILD-PLAN.md` §13 (D24–D27).

**Scope source.** The repository did not define Phases B–E; the owner asked (2026-10-25) to build B through F one after another, each merged before the next. The B–E scopes below are **inferred** from repository evidence (Phase A's open items, D27, the B9 acceptance row) and the owner's Phase F brief, and are recorded here so each PR can be checked against them. Phase F is the owner's brief.

| Phase | Scope | Status |
|---|---|---|
| B. Cart interaction | One reusable quantity stepper ("− n +") on the product page and the cart. Cart changes show at once, are sent as an absolute quantity after a 350 ms pause (rapid clicks become one write), totals stay the server's and are marked "updating" while a change is on its way. Stock and `MAX_LINE_QTY` limits, minimum 1, keyboard and screen-reader support, no-JS fallback. (= Phase F item 1) | **Done** (PR #47, merged as `7f116b4`) |
| C. Navigation feedback | Subtle progress indicator for client navigations (customer and admin), the missing admin `loading.tsx` files, no full-screen loaders, no artificial delays, reduced motion. (= Phase F item 5) | **Done** (PR #48, merged as `94dac8f`) |
| D. Search | 30 s browser cache for search suggestions, cleared on navigation (D27; also named as Phase D in `docs/CACHE-INVENTORY.md`). | **Done** (PR #49, merged as `d2ddd36`) |
| E. Notification UX | Push opt-in offered after a meaningful action (order placed) with the existing `PushOptIn`, hidden when VAPID is not configured (B9 acceptance row). | **Done** (PR #50, merged as `e5599f7`) |
| F. Remaining UX items | Home banner carousel, account navigation without the duplicate horizontal nav, guest checkout with secure order access and claim flow (new decision D28), configurable default language, dynamic footer category links. Built in three PRs: F1 carousel + account navigation + footer; F2 default language; F3 guest checkout. | **In progress:** F1 this PR |

## Phase B record (2026-10-25)

- **New:** `components/commerce/QuantityStepper.tsx` (shared control; exports `digitsOnly`, `clampQty`), `ProductQuantity.tsx` (product page, min 1, max = in stock capped at 99), `CartLineQuantity.tsx` (cart line: debounce, absolute write through the existing `setCartQuantityAction`, revert and alert on refusal), `CartPending.tsx` (marks line totals and the summary as updating), `lib/modules/pricing/limits.ts` (`MAX_CART_LINES`, `MAX_LINE_QTY`, shared by the client and `pricing/schema.ts`).
- **Behaviour:** "−" stops at 1 (removing stays the separate Remove button); "+" stops at what is in stock or 99; typed values (Latin or Bengali digits) are clamped on Enter or blur; arrow keys step. Buttons are disabled until the page is interactive; without JavaScript the field and an Update button post the same action. The product page still adds through the existing Add to cart form, and the server still refuses more than is in stock counting the cart.
- **Not changed:** server actions, pricing, stock and cart rules, schema, validators, dependencies, CSP, cache headers. The card Quick add stepper is unchanged.
- **Tests:** `tests/unit/quantity-stepper.test.tsx` (7); `tests/e2e-db/commerce/cart.spec.ts` now drives the stepper (+, typed over-stock clamp to 6 with "+" disabled, three rapid "−" giving one consistent quantity that survives a reload).

## Phase C record (2026-10-25)

- **New:** `components/shell/NavigationProgress.tsx`, mounted once in the storefront and admin root layouts (inside `Suspense`, it reads the search params). A 3 px bar at the top edge (`.nav-progress`, `app/globals.css`, colour `--link`) for same-origin link clicks to another page; shown only if the page has not changed within 150 ms; completes when the new route commits (the same moment its `loading.tsx` skeleton appears, so bar and skeleton never show together, and an error or not-found page also completes it); gives up after 10 s if a navigation is abandoned. Ignores modifier keys, new tabs, downloads, other origins and same-page hashes. `role="progressbar"` with a label; reduced motion: no movement.
- **Loading audit:** every storefront and account data route already had a skeleton (account sub-pages share `account/loading.tsx`; static info pages have none and get the bar). Admin: `/admin/notifications` had neither a gate layout nor a skeleton; it now has `gatedLayout` (so the 403/redirect stays real, as in the other sections) and `AdminFormSkeleton`. The admin home keeps no route skeleton on purpose: its setup redirect runs in the page, and a boundary above it would turn that redirect into a streamed 200; its work counts already stream in their own `Suspense`.
- **Not added:** full-screen loaders, artificial delays, a new dependency.
- **Tests:** `tests/unit/navigation-progress.test.ts` (4), `tests/e2e-db/navigation-progress.spec.ts` (3: slow navigation shows one bar that clears, same-page link shows none, reduced motion does not animate).

## Phase D record (2026-10-25)

- **New:** `components/shell/suggest-cache.ts`: in-memory (never storage) map of suggestion answers keyed by locale and term, 30 s TTL, at most 40 terms (oldest dropped). `SearchCombobox` shows a cached answer at once without the 150 ms wait or a request (any older request in flight is made stale by the existing counter), stores successful answers only (429, errors and aborted requests are not kept), and clears the cache whenever the pathname changes.
- **Unchanged (D27):** `/api/search/suggest` behaviour, its `s-maxage=60` header and live product rows; the plain GET form to `/search`; history in local storage.
- **Known limit (D27, accepted):** within 30 s on one page, suggestions do not notice catalogue changes; the search results page itself is always live.
- **Tests:** `tests/unit/suggest-cache.test.ts` (4); `tests/e2e-db/storefront.spec.ts` new journey: "mini", "min", "mini" asks the server twice, and after an in-app navigation "mini" is asked again.

## Phase E record (2026-10-25)

- **New:** `components/notifications/OrderUpdatesPrompt.tsx` on the order success page (`/checkout/success/[orderNumber]`), rendered only when the store has push configured (`pushConfig()`; only the public key reaches the browser). It appears only if this browser supports push, has not blocked notifications, has no subscription yet and has not chosen "Not now" before (`localStorage` key `hb-order-updates-prompt`). One button asks for permission (never on load) and saves a subscription for order updates only; offers and news stay off (choosable in Account › Notifications). Blocked permission and failures are stated in words with a link to the settings.
- **Refactor (no behaviour change):** the browser push helpers (`keyBytes`, support check, current subscription, subscribe, payload) moved from `PushOptIn` to `components/notifications/push-client.ts`, shared by both.
- **Unchanged:** `savePushSubscriptionAction` (signed-in customer, rate limits, validation), subscription storage, outbox delivery, the account notifications page.
- **Tests:** `tests/unit/push-client.test.ts` (2); `tests/e2e-db/commerce/checkout.spec.ts` checks the prompt after a COD order: no permission request on load, one request on the button, refused permission shows the blocked text and saves nothing, "Not now" survives a reload. `notifications.spec.ts` still passes.

## Phase F part 1 record (2026-10-25): carousel, account navigation, footer

- **Carousel (D29):** `components/home/HomeCarousel.tsx` now advances every 6 s to the next reachable position and wraps to the start; previous/next wrap too. One indicator per position (24 px targets, current one longer, `aria-current`), a pause/play button first in the controls. Holds on mouse hover, keyboard focus inside, hidden tab, and restarts the 6 s after any swipe, wheel or press. Reduced motion: no automatic advance unless Play is pressed; jumps instead of smooth scroll. The counter is a polite live region only while not advancing on its own. Positions are measured from the real layout (ResizeObserver), so on wide screens where every slide fits nothing advances and the controls row keeps its space but is hidden (no layout shift). 0 slides: nothing; 1 slide: no controls. Banner data, admin and `PlacementBanner` unchanged.
- **Account navigation (D30):** `components/identity/AccountFrame.tsx`. Below 1024 px the section pills are hidden on every account page; nested pages show "Back to your account" (`account.nav.back`); staff admin link and sign-out stay. From 1024 px the vertical sidebar is unchanged and the back link is hidden. Storefront header, bottom navigation and footer untouched.
- **Footer:** `lib/modules/storefront/footer-links.ts` picks up to 8 published categories (top level first in admin order, then subcategories level by level), from the cached published-only tree every page already loads (no extra query, deterministic), plus "All categories". With the 4 fixed shopping links (new, deals, search, cart) that is 8 of 12 shopping links from the catalogue, about two-thirds. Account, help and policy links stay static.
- **Tests:** unit `home-carousel.test.tsx` (8), `footer-links.test.ts` (3); e2e-db `storefront.spec.ts` (carousel advances, focus holds, pause/play, indicator, reduced motion off; footer categories bounded and routed) and `commerce/notifications.spec.ts` (account navigation at 375 and 1440 px).
