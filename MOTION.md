# MOTION.md: HorekBazar template

> How it moves. Written at **Checkpoint 4 (build plan); approved by the owner 2026-10-21 with conditions.** None of the behaviours below has been built or tested in a browser yet; each is verified in the phase that builds it.
>
> Sources: `DESIGN.md` → Concept (dials: storefront ENERGY 2 · RHYTHM 1 · MOTION 1; cart, checkout, account and admin 1 · 1 · 1); skill `motion/selection.md`, `motion/tokens.md` and `motion/tier-1-basic.md`.

## Motion principles for this project
- **Tier:** 1 (CSS transitions and keyframes) everywhere. No GSAP, no Lenis, no WebGL. No motion library is added: none of the behaviours below needs one (`motion/selection.md` §3, cheapest technique).
- **Personality (one line):** a shopkeeper's pen: quick, exact and quiet. Motion confirms what changed and never performs.
- **Ease tokens used:**
  - `--ease-out` for feedback and entrances.
  - `--ease-drawer` for sheets and the dock.
  - `--ease-in-out` for the only travel motion: a sheet sliding between two positions.
  - `ease-in` is never used for entrances.
- **What never moves:**
  - Prices, totals, stock counts and the cart count. They change instantly; a moving number is not a readable price, and count-up was rejected at Checkpoint 3.
  - Body text, product names and headings: no reveal animations on task pages.
  - The bottom dock while scrolling: no hide-on-scroll.
  - Any element during checkout placement, beyond the button's loading state.
  - Page backgrounds: no parallax, no smooth-scroll override.

## The four questions, applied

| Behaviour | Should it move? | What it tells the user | Cheapest tool | Edges |
|---|---|---|---|---|
| Button press | yes, seen constantly, so smallest motion | what changed (pressed) | CSS `transform: scale(0.97)` 120 ms | rapid repeat: no queueing; reduced motion: colour change only |
| Focus ring | yes (it is the state) | what to look at | CSS outline, appears instantly | never animated in or out; always visible with keyboard focus |
| AddToCart → QuantityStepper | yes, once per product | what changed (the item is now in the cart) | CSS cross-fade, 160 ms | double tap: the button disables until the server confirms; error reverts with a message; reduced motion: instant swap |
| Stepper value change | **no** movement | — | — | the number changes instantly and is announced politely |
| Context strip appears (RunningTotalBar, StickyBuyStrip) | yes, rarely | where it came from (from the bottom bar) | CSS `transform: translateY` 8 px + `opacity`, 200 ms `--ease-out`; its space is reserved before it appears, so there is no layout shift | reduced motion: appears instantly; never animates while the user is typing |
| Department sheet, filter sheet, cart sheet | yes | where it came from and went | Radix Dialog with CSS `transform` slide, enter 280 ms / exit 200 ms `--ease-drawer` | interruptible (close mid-open); Esc closes; reduced motion: 120 ms fade, no travel |
| Mega-menu (≥ 1280 px) | yes | what to look at | CSS `opacity` 160 ms; panel content does not slide | hover intent delay 120 ms; keyboard opens instantly; reduced motion: instant |
| Toast ("removed", with undo) | yes | what changed | CSS `opacity` + 8 px `translateY`, 200 ms; exit 140 ms | stays at least 6 s and pauses on hover or focus; above the dock; reduced motion: fade only |
| Validation error | **no** motion (no shake) | — | — | the message appears instantly; focus moves to the summary on submit |
| Skeletons | **no** shimmer (Checkpoint 3 restraint) | — | static blocks | — |
| Image load | yes, once | what changed (photo arrived) | CSS `opacity` 0 → 1, 160 ms, on a reserved 1:1 box | reduced motion: instant; error shows the LabelTile |
| Accordion (product specs, FAQ) | yes | where it went | content toggles instantly; only the chevron rotates (`transform`, 160 ms). Height is not animated | reduced motion: chevron does not rotate |
| Order timeline | **no** motion | — | — | current step marked by text, icon and colour |
| Page navigation | **no** page transitions in v1 | — | — | instant navigation; a top progress bar only if a navigation takes more than 400 ms (`opacity` only) |

## Global

| Element | Behaviour | Tier | Duration / ease | Reduced motion |
|---|---|---|---|---|
| Smooth scroll | none: native scroll | — | — | native |
| Headings | none | — | — | — |
| Links | colour and underline change on hover and focus | 1 | 120–160 ms `--ease-out` | instant |
| Buttons | hover colour 160 ms; press scale 0.97, 120 ms; loading state shows a spinner beside the label (rotation 1 s linear, the only loop) | 1 | per row | spinner replaced by a static "…" indicator and `aria-busy` |
| Form fields | border and focus colour change, 120 ms | 1 | 120 ms | instant |
| Bottom dock context strip | 8 px rise + fade on appear, 200 ms | 1 | `--ease-out` | instant |
| Sheets and dialogs | slide from the edge they open from | 1 | 280 ms in / 200 ms out `--ease-drawer` | 120 ms fade |
| Toasts | 8 px rise + fade | 1 | 200 ms in / 140 ms out | fade only |
| View Transitions API | not used in v1 (not needed; avoids a browser-support matrix) | — | — | — |

| Theme change (redesign, Proposal 04) | at a clock boundary (05, 11, 17, 20, 00) or when the shopper picks অটো/লাইট/ডার্ক, colours fade (background, text, border only) | 1 | 400 ms `--ease-in-out`, only while `html[data-theme-changing]` is set | instant (rule sits inside `prefers-reduced-motion: no-preference`) |
| Home carousel (redesign) | native swipe with scroll-snap; the buttons scroll one slide; never rotates on its own | 1 | browser smooth scroll | buttons jump (`behavior: "auto"`) |
| Quick add (redesign) | "+" becomes − n + after the server confirms; press scale 0.94 | 1 | instant swap | no scale (global rule) |
| Search suggestions (redesign) | panel appears under the field; no animation | — | — | — |

The theme fade is ambient, not feedback to a tap, so it is allowed past the 250 ms feedback limit.
All UI feedback stays at or under 250 ms (`gates/rules.md`). Only `transform` and `opacity` are animated; no `width`, `height`, `top`, `left` or grid tracks. Loops (the spinner only) stop when the action ends.

## Timing sheet
Not required: Tier 1, and there are no scroll-told chapters.

## Chapters (Motomation)
None. This is a task-led commerce product (`motion/selection.md` §1: narrative motion lives on storytelling surfaces, not task flows).

## Signature move
- **Name:** running total (RunningTotalBar).
- **Trigger:** the cart goes from empty to one or more items, on an eligible route below 768 px (not `/p/[slug]`, `/cart` or `/checkout`). Later changes update the numbers instantly, without motion, and announce them politely.
- **Off-switch:** under reduced motion it appears without the rise. On touch there is no hover behaviour. While a text field is focused the whole dock is hidden (`docs/BUILD-PLAN.md` §5).

## Verification (not yet run)
Every row above is checked in the build, and the results go to `GATE.md`:
- reduced motion emulated;
- 4× CPU throttle at 375 px;
- keyboard-only through each core journey;
- touch at 375 px;
- the skill gate's motion checks (`scripts/gate.mjs`: `rm`, `q`).

Nothing here has been measured yet.
