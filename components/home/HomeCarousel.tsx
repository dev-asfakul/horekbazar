"use client";
// Tier: build. Use-when: the top of the home page only (Proposal 03; banners from Proposal 04b).
// Avoid-when: anything a shopper must see — slides past the first are optional extras.
// HomeCarousel (owner 2026-10-25, D29 revised): a stack of cards on every screen size. One slide is
// in front; the next two sit behind it, smaller and dimmed, peeking out at the inline end. Moving
// on sends the front card to the back of the stack and brings the next one forward.
// Controls: previous/next buttons, one indicator per slide, a swipe on touch or mouse. There is no
// pause button (owner decision). Automatic advance every 6 s holds while the pointer is over the
// carousel, while anything in it has keyboard focus and while the tab is hidden, and stops for the
// rest of the visit once the shopper moves it themselves (APG carousel). Never under reduced
// motion: the cards then change without gliding. The live counter is silent while it advances.
// Cards behind the front one are inert (not focusable, hidden from assistive technology).
// Without JavaScript the first slide is in front and the controls stay disabled.
// 0 slides: nothing; 1 slide: no stack and no controls.
import { Children, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useHydrated } from "@/components/shell/use-browser-state";

const REDUCE = "(prefers-reduced-motion: reduce)";
function onMotionChange(cb: () => void) {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function onVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}

export const AUTOPLAY_MS = 6000;
/** Horizontal travel (px) that counts as a swipe rather than a tap. */
export const SWIPE_PX = 40;

export interface CarouselLabels {
  label: string;
  prev: string;
  next: string;
  /** "Slide {n}" with {n} already in the store's digits, one per slide. */
  goTo: string[];
  /** "1/4" in the store's digits, one per slide. */
  counter: string[];
}

/** Place of slide `i` in the stack when `index` is in front: 0 front, 1 and 2 behind, 3 hidden (exported for tests). */
export function stackPos(i: number, index: number, count: number): 0 | 1 | 2 | 3 {
  const d = (((i - index) % count) + count) % count;
  return d > 2 ? 3 : (d as 0 | 1 | 2);
}

export function HomeCarousel({ children, labels }: { children: React.ReactNode; labels: CarouselLabels }) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const ready = useHydrated();
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false); // the shopper moved it: no more automatic advance
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const hidden = useSyncExternalStore(onVisibility, () => document.visibilityState === "hidden", () => false);
  const reduce = useSyncExternalStore(onMotionChange, () => window.matchMedia(REDUCE).matches, () => false);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const swiped = useRef(false);

  const go = useCallback((to: number) => setIndex(((to % count) + count) % count), [count]);
  const move = (to: number) => {
    setStopped(true);
    go(to);
  };

  const moving = ready && count > 1 && !stopped && !reduce && !hover && !focus && !hidden;
  useEffect(() => {
    if (!moving) return;
    const id = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [moving, index, go]);

  if (count === 0) return null;
  const many = count > 1;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!many || !ready || (e.pointerType === "mouse" && e.button !== 0)) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    swiped.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(e.clientY - d.y)) return;
    swiped.current = true;
    // Swiping towards the start brings the next card forward (as on a scrolling row).
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    move(index + ((dx < 0) !== rtl ? 1 : -1));
  };

  return (
    <section
      className="home-carousel"
      aria-roledescription="carousel"
      aria-label={labels.label}
      data-testid="home-carousel"
      data-autoplay={moving ? "on" : "off"}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setFocus(false)}
    >
      <ul
        className="home-carousel-track"
        data-count={count}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        // A swipe that ends over a link is not a click on it; a dragged image or link is not dragged away.
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
        onDragStart={(e) => many && e.preventDefault()}
      >
        {slides.map((s, i) => {
          const pos = many ? stackPos(i, index, count) : 0;
          return (
            <li key={i} className="home-carousel-slide" data-pos={pos} aria-roledescription="slide" aria-label={labels.counter[i]} inert={pos !== 0} aria-hidden={pos !== 0 || undefined}>
              {s}
            </li>
          );
        })}
      </ul>
      {many ? (
        // Rendered on the server too (no layout shift); the buttons work once the page is interactive.
        <div className="home-carousel-controls" data-ready={ready || undefined}>
          <span className="home-carousel-dots" role="group" aria-label={labels.label}>
            {slides.map((_, i) => (
              <button key={i} type="button" className="home-carousel-dot" aria-label={labels.goTo[i]} aria-current={i === index ? "true" : undefined} disabled={!ready} onClick={() => move(i)} />
            ))}
          </span>
          <button type="button" className="home-carousel-btn" onClick={() => move(index - 1)} disabled={!ready} aria-label={labels.prev}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="home-carousel-count" aria-live={moving ? "off" : "polite"} data-testid="carousel-count">
            {labels.counter[index] ?? ""}
          </span>
          <button type="button" className="home-carousel-btn" onClick={() => move(index + 1)} disabled={!ready} aria-label={labels.next}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}
