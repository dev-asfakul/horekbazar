# Performance and UX phases B–F

Tracker for the phases after Performance Phase A (PR #46, merged as `1a6496d`). Updated in every phase PR. Phase A's record is in `docs/PROGRESS.md` (2026-10-24) and `docs/BUILD-PLAN.md` §13 (D24–D27).

**Scope source.** The repository did not define Phases B–E; the owner asked (2026-10-25) to build B through F one after another, each merged before the next. The B–E scopes below are **inferred** from repository evidence (Phase A's open items, D27, the B9 acceptance row) and the owner's Phase F brief, and are recorded here so each PR can be checked against them. Phase F is the owner's brief.

| Phase | Scope | Status |
|---|---|---|
| B. Cart interaction | One reusable quantity stepper ("− n +") on the product page and the cart. Cart changes show at once, are sent as an absolute quantity after a 350 ms pause (rapid clicks become one write), totals stay the server's and are marked "updating" while a change is on its way. Stock and `MAX_LINE_QTY` limits, minimum 1, keyboard and screen-reader support, no-JS fallback. (= Phase F item 1) | **Done** (this PR) |
| C. Navigation feedback | Subtle progress indicator for client navigations (customer and admin), the missing admin `loading.tsx` files, no full-screen loaders, no artificial delays, reduced motion. (= Phase F item 5) | Not started |
| D. Search | 30 s browser cache for search suggestions, cleared on navigation (D27). | Not started |
| E. Notification UX | Push opt-in offered after a meaningful action (order placed) with the existing `PushOptIn`, hidden when VAPID is not configured (B9 acceptance row). | Not started |
| F. Remaining UX items | Home banner carousel, account navigation without the duplicate horizontal nav, guest checkout with secure order access and claim flow (new decision D28), configurable default language, dynamic footer category links. | Not started |

## Phase B record (2026-10-25)

- **New:** `components/commerce/QuantityStepper.tsx` (shared control; exports `digitsOnly`, `clampQty`), `ProductQuantity.tsx` (product page, min 1, max = in stock capped at 99), `CartLineQuantity.tsx` (cart line: debounce, absolute write through the existing `setCartQuantityAction`, revert and alert on refusal), `CartPending.tsx` (marks line totals and the summary as updating), `lib/modules/pricing/limits.ts` (`MAX_CART_LINES`, `MAX_LINE_QTY`, shared by the client and `pricing/schema.ts`).
- **Behaviour:** "−" stops at 1 (removing stays the separate Remove button); "+" stops at what is in stock or 99; typed values (Latin or Bengali digits) are clamped on Enter or blur; arrow keys step. Buttons are disabled until the page is interactive; without JavaScript the field and an Update button post the same action. The product page still adds through the existing Add to cart form, and the server still refuses more than is in stock counting the cart.
- **Not changed:** server actions, pricing, stock and cart rules, schema, validators, dependencies, CSP, cache headers. The card Quick add stepper is unchanged.
- **Tests:** `tests/unit/quantity-stepper.test.tsx` (7); `tests/e2e-db/commerce/cart.spec.ts` now drives the stepper (+, typed over-stock clamp to 6 with "+" disabled, three rapid "−" giving one consistent quantity that survives a reload).
