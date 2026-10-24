"use client";
// Tier: build. Use-when: the top of the home page only (Proposal 03; banners from Proposal 04b).
// Avoid-when: anything a shopper must see — slides past the first are optional extras.
// Reduced-motion: buttons jump instead of gliding. Touch: native swipe with scroll-snap; 44 px buttons.
// HomeCarousel: never rotates on its own (WCAG 2.2.2 needs no pause control then). Slides are
// server-rendered children; this only adds the buttons and the "১/৪" counter. Without JavaScript
// it is a plain horizontally scrolling list.
import { Children, useCallback, useEffect, useRef, useState } from "react";
import { useHydrated } from "@/components/shell/use-browser-state";

export function HomeCarousel({ children, label, prev, next, counter }: { children: React.ReactNode; label: string; prev: string; next: string; counter: string[] }) {
  const track = useRef<HTMLUListElement>(null);
  const slides = Children.toArray(children);
  const [index, setIndex] = useState(0);
  const ready = useHydrated();

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const items = [...el.children] as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setIndex(items.indexOf(e.target as HTMLElement));
      },
      { root: el, threshold: [0.6] },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [slides.length]);

  const go = useCallback((to: number) => {
    const el = track.current;
    const target = el?.children[to] as HTMLElement | undefined;
    if (!el || !target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollTo({ left: rtl ? -(target.offsetLeft - el.offsetLeft) : target.offsetLeft - el.offsetLeft - parseFloat(getComputedStyle(el).paddingInlineStart || "0"), behavior: reduce ? "auto" : "smooth" });
  }, []);

  if (slides.length === 0) return null;
  const many = slides.length > 1;
  return (
    <section className="home-carousel" aria-roledescription="carousel" aria-label={label} data-testid="home-carousel">
      <ul className="home-carousel-track" ref={track} data-count={slides.length}>
        {slides.map((s, i) => (
          <li key={i} className="home-carousel-slide" aria-roledescription="slide" aria-label={counter[i]}>
            {s}
          </li>
        ))}
      </ul>
      {many ? (
        // Rendered on the server too (no layout shift); the buttons work once the page is interactive.
        <div className="home-carousel-controls" data-ready={ready || undefined}>
          <button type="button" className="home-carousel-btn" onClick={() => go(Math.max(0, index - 1))} disabled={!ready || index === 0} aria-label={prev}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className="flip-rtl">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="home-carousel-count" aria-live="polite">
            {counter[index]}
          </span>
          <button type="button" className="home-carousel-btn" onClick={() => go(Math.min(slides.length - 1, index + 1))} disabled={!ready || index === slides.length - 1} aria-label={next}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className="flip-rtl">
              <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : null}
    </section>
  );
}
