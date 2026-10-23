// Time-of-day themes (docs/REDESIGN-BUILD-PLAN.md §3). The phone's own clock picks one of five
// themes; the shopper can pin light or dark instead (saved on the phone only, never on the server).
// The server always renders "day"; a tiny inline script (CSP nonce) sets the real theme before the
// first paint, so cached or streamed pages never show the wrong colours for long.
export const THEMES = ["morning", "day", "evening", "night", "midnight"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_PREFS = ["auto", "light", "dark"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export const THEME_STORAGE_KEY = "hb-theme";

/** Hour boundaries, local time: 05 morning, 11 day, 17 evening, 20 night, 00 midnight. */
export function themeForHour(hour: number): Theme {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "evening";
  if (hour >= 20) return "night";
  return "midnight";
}

export function resolveTheme(pref: ThemePref, hour: number): Theme {
  if (pref === "light") return "day";
  if (pref === "dark") return "night";
  return themeForHour(hour);
}

/** Milliseconds until the next boundary (05, 11, 17, 20, 00), at least one second. */
export function msToNextBoundary(now: Date): number {
  const next = new Date(now);
  const h = now.getHours();
  const target = [5, 11, 17, 20, 24].find((b) => b > h) ?? 24;
  next.setHours(target, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Browser bar colour per theme (the --ground token of each). */
export const THEME_COLOR: Record<Theme, string> = {
  morning: "#FFEBD6",
  day: "#F6F9EF",
  evening: "#F3ECF8",
  night: "#0E1311",
  midnight: "#05070B",
};

/** The pre-paint script. Kept tiny and dependency-free; mirrors themeForHour/resolveTheme. */
export const themeBootScript = `(function(){try{var d=document.documentElement,p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(p!=="light"&&p!=="dark")p="auto";var h=new Date().getHours(),t=p==="light"?"day":p==="dark"?"night":h>=5&&h<11?"morning":h>=11&&h<17?"day":h>=17&&h<20?"evening":h>=20?"night":"midnight";d.setAttribute("data-theme",t);d.setAttribute("data-theme-pref",p);var c=${JSON.stringify(THEME_COLOR)}[t],m=document.querySelector('meta[name="theme-color"]');if(m&&c)m.setAttribute("content",c)}catch(e){}})();`;
