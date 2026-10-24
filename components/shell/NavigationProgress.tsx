"use client";
// Navigation feedback (Phase C). A thin bar at the top of the window while an in-app link is on its
// way. It starts only for a same-origin link to a different page (no modifier keys, no new tab, no
// download, not a hash on the same page) and only if the page has not changed within 150 ms, so
// instant, prefetched navigations show nothing. It completes as soon as the new route commits, which
// is also when that route's loading.tsx skeleton appears, so the two never show together. If the
// navigation fails the error page commits and the bar completes; if it is abandoned (Escape, the
// browser's Stop, a later click that goes nowhere) it gives up after 10 s. No artificial delay is
// added to any page. Reduced motion: the bar does not move, it only appears and disappears.
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SHOW_AFTER_MS = 150;
const GIVE_UP_MS = 10_000;
const FADE_MS = 240;

type Phase = "idle" | "waiting" | "active" | "done";
type Timers = { current: number[] };

function clear(timers: Timers) {
  for (const id of timers.current) window.clearTimeout(id);
  timers.current = [];
}
function later(timers: Timers, fn: () => void, ms: number) {
  timers.current.push(window.setTimeout(fn, ms));
}

/** The link a click would follow inside this app, or null. Exported for tests. */
export function internalTarget(e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, anchor: { href: string; target: string; hasAttribute(n: string): boolean }, here: { origin: string; pathname: string; search: string }): URL | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, here.origin);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null; // same page or a hash on it
  return url;
}

export function NavigationProgress({ label }: { label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<number[]>([]);


  // The route committed (a new page, the error page or not-found): finish whatever is showing.
  const routeKey = `${pathname}?${search}`;
  const [seenRoute, setSeenRoute] = useState(routeKey);
  if (seenRoute !== routeKey) {
    setSeenRoute(routeKey);
    if (phase === "waiting") setPhase("idle");
    else if (phase === "active") setPhase("done");
  }

  useEffect(() => {
    if (phase !== "done") return;
    clear(timers);
    later(timers, () => setPhase("idle"), FADE_MS);
  }, [phase]);

  useEffect(() => {
    const t = timers;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!internalTarget(e, anchor, window.location)) return;
      clear(timers);
      setPhase("waiting");
      later(timers, () => setPhase((p) => (p === "waiting" ? "active" : p)), SHOW_AFTER_MS);
      later(timers, () => setPhase((p) => (p === "waiting" || p === "active" ? "done" : p)), GIVE_UP_MS);
    };
    // Capture phase: Next's Link cancels the browser's own navigation in its click handler.
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      clear(t);
    };
  }, []);

  if (phase !== "active" && phase !== "done") return null;
  return <div className="nav-progress" data-state={phase} role="progressbar" aria-label={label} aria-busy={phase === "active"} />;
}
