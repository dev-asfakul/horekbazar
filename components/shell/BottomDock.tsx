"use client";
// Tier: build (concept). Use-when: band S shell, once per page in the locale layout. Avoid-when: band M and wider (hidden by CSS), admin.
// Reduced-motion: hide/show is instant under reduced motion. Touch: children own their 44 px targets.
// BottomDock (DESIGN.md → Layout → Bottom dock, band S only): one fixed container holding at most
// one context strip (B6+) and the five-item BottomNav. It publishes its measured height as --dock-h,
// and while a text field has focus it leaves the view and the tab order (inert), without reducing
// --dock-h, so the layout does not jump. It never hides on scroll.
import { useEffect, useRef, useState, type ReactNode } from "react";

const TEXT_INPUT_TYPES = new Set(["text", "search", "email", "tel", "url", "password", "number", "date", "time", "datetime-local", "month", "week", ""]);

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type) && !el.readOnly && !el.disabled;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function BottomDock({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const dock = ref.current;
    if (!dock) return;
    const root = document.documentElement;
    const publish = () => {
      const visible = getComputedStyle(dock).display !== "none";
      // CSSOM writes are allowed by the CSP (only inline style attributes in markup are blocked).
      if (visible) root.style.setProperty("--dock-h", `${Math.round(dock.getBoundingClientRect().height)}px`);
      else root.style.removeProperty("--dock-h");
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(dock);
    const mq = window.matchMedia("(width < 768px)");
    mq.addEventListener("change", publish);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", publish);
      root.style.removeProperty("--dock-h");
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // On focusout, activeElement is <body> until the next element gains focus; wait a frame.
      frame = requestAnimationFrame(() => setHidden(isTextEntry(document.activeElement)));
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return (
    <div ref={ref} id="bottom-dock" className="bottom-dock" data-hidden={hidden} inert={hidden} aria-label={label} role="region">
      {children}
    </div>
  );
}
