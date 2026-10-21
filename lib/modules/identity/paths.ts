// Locale-aware storefront paths for the identity module (mirrors lib/i18n/href.ts without the
// next-intl dependency, so this module also runs in Node scripts and integration tests).
import type { Capability } from "./capabilities.ts";

/** Request header the proxy sets to the requested path (overwriting any client value). */
export const ADMIN_PATH_HEADER = "x-hb-path";

/**
 * The capability each built admin page needs (null: any verified staff role). One table, read by the
 * page gate and by the 403 page so the denial names the capability (DESIGN.md → Permission state).
 */
export const ADMIN_PAGE_CAPABILITY = {
  "/admin": null,
  "/admin/security": null,
  "/admin/staff": "staff.manage",
  "/admin/health": "platform.read",
} as const satisfies Record<string, Capability | null>;
export type AdminPage = keyof typeof ADMIN_PAGE_CAPABILITY;

export function adminPageCapability(pathname: string | null): Capability | null {
  return pathname && pathname in ADMIN_PAGE_CAPABILITY ? ADMIN_PAGE_CAPABILITY[pathname as AdminPage] : null;
}
export function localePath(locale: "bn" | "en", path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === "bn") return clean;
  return clean === "/" ? "/en" : `/en${clean}`;
}

/** Only same-site, path-only redirects are allowed after sign-in (no open redirects). */
export function safeNext(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.length > 512) return fallback;
  try {
    const url = new URL(value, "http://x.invalid");
    return url.origin === "http://x.invalid" ? `${url.pathname}${url.search}` : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Proxy-level sign-in redirect (BUILD-PLAN C2): a request for a private page with no session cookie at
 * all goes straight to /login?next=… without rendering. Only cookie presence is checked here, which is
 * a convenience, not authorisation: every page and action re-validates the session on the server.
 * /admin/setup stays reachable because no account exists before the first owner is created.
 */
export function signInRedirect(pathname: string, search: string, hasSessionCookie: boolean): string | null {
  if (hasSessionCookie) return null;
  const en = pathname === "/en" || pathname.startsWith("/en/");
  const rest = en ? pathname.slice(3) || "/" : pathname;
  const admin = /^\/admin(\/|$)/.test(pathname) && !/^\/admin\/setup(\/|$)/.test(pathname);
  const customer = /^\/(account|checkout)(\/|$)/.test(rest);
  if (!admin && !customer) return null;
  const login = en && !admin ? "/en/login" : "/login";
  return `${login}?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
