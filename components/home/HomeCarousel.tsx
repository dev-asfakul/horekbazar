"use client";
// Tier: build. Use-when: the top of the home page only (Proposal 03; banners from Proposal 04b).
// Avoid-when: anything a shopper must see — slides past the first are optional extras.
// Reduced-motion: no automatic advance (a Play button still offers it) and buttons jump instead of
// gliding. Touch: native swipe with scroll-snap; 44 px buttons.
// HomeCarousel: slides are server-rendered children; this adds previous/next, one indicator per
// position, a pause/play control and (Phase F, owner 2026-10-25) automatic advance every 6 s.
// WCAG 2.2.2: the movement can be paused with a visible button, and it also holds while the pointer
// is over the carousel, while anything in it has keyboard focus, while the tab is hidden, and after
// a swipe or a press until the shopper leaves it alone again. At the end it returns to the start.
// When every slide already fits (wide screens with few slides) there is nothing to move and
// nothing advances. The live counter is silent while it advances on its own (APG carousel).
// Without JavaScript it is a plain horizontally scrolling list. 0 slides: nothing; 1 slide: no controls.
import { Children, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useHydrated } from "@/components/shell/use-browser-state";
import { toBengaliDigits } from "@/lib/format/money";

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

export interface CarouselLabels {
  label: string;
  prev: string;
  next: string;
  pause: string;
  play: string;
  /** "Slide {n}" with {n} already in the store's digits, one per slide. */
  goTo: string[];
  /** "1/4" in the store's digits, one per slide. */
  counter: string[];
  /** The store shows Bengali digits (for the "n/stops" counter on wide screens). */
  bengali: boolean;
}

/** Scroll offsets the track can actually reach, one per stop (exported for tests). */
export function stops(offsets: number[], maxScroll: number): number[] {
  const out: number[] = [];
  for (const o of offsets) {
    const v = Math.max(0, Math.min(o, maxScroll));
    if (out.length === 0 || v - out[out.length - 1]! > 2) out.push(v);
  }
  if (out.length > 0 && maxScroll - out[out.length - 1]! > 2) out.push(maxScroll);
  return out.length ? out : [0];
}

/** The stop nearest to a scroll position (exported for tests). */
export function nearest(list: number[], at: number): number {
  let best = 0;
  for (let i = 1; i < list.length; i++) if (Math.abs(list[i]! - at) < Math.abs(list[best]! - at)) best = i;
  return best;
}

export function HomeCarousel({ children, labels }: { children: React.ReactNode; labels: CarouselLabels }) {
  const track = useRef<HTMLUListElement>(null);
  const slides = Children.toArray(children);
  const count = slides.length;
  const ready = useHydrated();
  const [index, setIndex] = useState(0);
  const [positions, setPositions] = useState<number[]>(() => slides.map((_, i) => i));
  // Pause reasons: the shopper's button, the pointer over it, focus in it, a recent touch or press.
  const [userPaused, setUserPaused] = useState<boolean | null>(null); // null: not chosen (reduced motion decides)
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const hidden = useSyncExternalStore(onVisibility, () => document.visibilityState === "hidden", () => false);
  const reduce = useSyncExternalStore(onMotionChange, () => window.matchMedia(REDUCE).matches, () => false);
  const [touchedAt, setTouchedAt] = useState(0);
  const offsets = useRef<number[]>([0]);

  // Measure where the track can stop (depends on the screen width); re-measure on resize.
  useEffect(() => {
    const el = track.current;
    if (!el || count < 2) return;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(el).paddingInlineStart || "0");
      const items = [...el.children] as HTMLElement[];
      const list = stops(
        items.map((i) => i.offsetLeft - el.offsetLeft - pad),
        el.scrollWidth - el.clientWidth,
      );
      offsets.current = list;
      setPositions(list.map((_, i) => i));
      setIndex(nearest(list, Math.abs(el.scrollLeft)));
    };
    // ResizeObserver also reports once right after observe(), which takes the first measurement.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setIndex(nearest(offsets.current, Math.abs(el.scrollLeft))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);

  const go = useCallback((to: number) => {
    const el = track.current;
    if (!el) return;
    const list = offsets.current;
    const i = ((to % list.length) + list.length) % list.length;
    const rtl = getComputedStyle(el).direction === "rtl";
    const motion = !window.matchMedia(REDUCE).matches;
    el.scrollTo({ left: rtl ? -list[i]! : list[i]!, behavior: motion ? "smooth" : "auto" });
    setIndex(i);
  }, []);

  const stopsCount = positions.length;
  const paused = userPaused ?? reduce;
  const holding = hover || focus || hidden;
  const moving = ready && stopsCount > 1 && !paused && !holding;

  // One timer per resting moment: any interaction (touchedAt) or index change restarts the 6 s.
  useEffect(() => {
    if (!moving) return;
    const id = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [moving, index, touchedAt, go]);

  if (count === 0) return null;
  const many = count > 1;
  const touched = () => setTouchedAt(Date.now());
  const shownCounter = labels.counter[index] ?? "";
  const wide = `${index + 1}/${stopsCount}`;
  const counterText = stopsCount === count ? shownCounter : labels.bengali ? toBengaliDigits(wide) : wide;

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
      <ul className="home-carousel-track" ref={track} data-count={count} onPointerDown={touched} onWheel={touched}>
        {slides.map((s, i) => (
          <li key={i} className="home-carousel-slide" aria-roledescription="slide" aria-label={labels.counter[i]}>
            {s}
          </li>
        ))}
      </ul>
      {many ? (
        // Rendered on the server too (no layout shift); the buttons work once the page is interactive.
        // When every slide fits there is nothing to move: the row keeps its space but is hidden.
        <div className="home-carousel-controls" data-ready={ready || undefined} data-fits={ready && stopsCount < 2 ? "" : undefined}>
          <button type="button" className="home-carousel-btn home-carousel-toggle" onClick={() => setUserPaused(!paused)} disabled={!ready || stopsCount < 2} aria-label={paused ? labels.play : labels.pause} data-testid="carousel-toggle">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              {paused ? <path d="M8 5v14l11-7z" fill="currentColor" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />}
            </svg>
          </button>
          <span className="home-carousel-dots" role="group" aria-label={labels.label}>
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                className="home-carousel-dot"
                hidden={i >= stopsCount}
                aria-label={labels.goTo[i]}
                aria-current={i === index ? "true" : undefined}
                disabled={!ready}
                onClick={() => {
                  touched();
                  go(i);
                }}
              />
            ))}
          </span>
          <button
            type="button"
            className="home-carousel-btn"
            onClick={() => {
              touched();
              go(index - 1);
            }}
            disabled={!ready || stopsCount < 2}
            aria-label={labels.prev}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="home-carousel-count" aria-live={moving ? "off" : "polite"} data-testid="carousel-count">
            {counterText}
          </span>
          <button
            type="button"
            className="home-carousel-btn"
            onClick={() => {
              touched();
              go(index + 1);
            }}
            disabled={!ready || stopsCount < 2}
            aria-label={labels.next}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}
