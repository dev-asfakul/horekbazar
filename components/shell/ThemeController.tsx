"use client";
// Tier: build. Use-when: once, in the locale layout. Avoid-when: admin (keeps its own look).
// Reduced-motion: the colour fade is turned off by the global reduced-motion rule.
// Keeps the time-of-day theme current while a page stays open: one timer to the next boundary
// (05, 11, 17, 20, 00), re-armed after each switch and when the tab becomes visible again.
import { useEffect } from "react";
import { msToNextBoundary, resolveTheme, THEME_COLOR, THEME_STORAGE_KEY, type ThemePref } from "@/lib/storefront/theme";

export function readThemePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(pref: ThemePref, now = new Date()) {
  const root = document.documentElement;
  const theme = resolveTheme(pref, now.getHours());
  if (root.getAttribute("data-theme") !== theme) {
    root.setAttribute("data-theme-changing", "");
    root.setAttribute("data-theme", theme);
    window.setTimeout(() => root.removeAttribute("data-theme-changing"), 450);
  }
  root.setAttribute("data-theme-pref", pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function ThemeController() {
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      applyTheme(readThemePref());
      timer = window.setTimeout(arm, msToNextBoundary(new Date()));
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") arm();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) arm();
    };
    arm();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return null;
}
