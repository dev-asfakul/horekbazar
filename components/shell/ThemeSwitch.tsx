"use client";
// Tier: build. Use-when: footer and the account page. Avoid-when: admin.
// Reduced-motion: no motion. Touch: three 44 px segments.
// ThemeSwitch: অটো (by the time of day) · লাইট · ডার্ক. Saved in this browser only; without
// JavaScript the time-of-day default simply stays.
import { applyTheme } from "@/components/shell/ThemeController";
import { notifyStored, useHydrated, useStoredString } from "@/components/shell/use-browser-state";
import { THEME_PREFS, THEME_STORAGE_KEY, type ThemePref } from "@/lib/storefront/theme";

export function ThemeSwitch({ label, labels, hint }: { label: string; labels: Record<ThemePref, string>; hint: string }) {
  const stored = useStoredString(THEME_STORAGE_KEY);
  const pref: ThemePref = stored === "light" || stored === "dark" ? stored : "auto";
  const ready = useHydrated();
  const choose = (next: ThemePref) => {
    try {
      if (next === "auto") window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies to this page.
    }
    applyTheme(next);
    notifyStored();
  };
  return (
    <fieldset className="theme-switch" data-ready={ready || undefined}>
      <legend className="theme-switch-label">{label}</legend>
      <div className="theme-switch-options">
        {THEME_PREFS.map((p) => (
          <label key={p} className="theme-switch-option">
            <input type="radio" name="hb-theme" value={p} checked={pref === p} onChange={() => choose(p)} disabled={!ready} />
            <span>{labels[p]}</span>
          </label>
        ))}
      </div>
      <p className="theme-switch-hint">{hint}</p>
    </fieldset>
  );
}
