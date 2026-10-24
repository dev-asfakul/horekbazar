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
  // B10: the audit log is a platform record (BUILD-PLAN row Platform: platform.read); customer records
  // are read with customers.read (support agents, operators, managers, Owner).
  "/admin/audit": "platform.read",
  "/admin/customers": "customers.read",
  // B4 catalogue administration. Sub-pages (/admin/products/new, /admin/products/<id>) use the
  // capability of their section; mutations check their own capability again in the server action.
  "/admin/products": "catalogue.write",
  "/admin/categories": "catalogue.write",
  "/admin/inventory": "inventory.adjust",
  "/admin/collections": "merch.write",
  "/admin/homepage": "merch.write",
  "/admin/banners": "merch.write",
  // B7 orders. Each status change checks its own capability in the server action.
  "/admin/orders": "orders.read",
  // B8 fulfilment. Shipment steps need fulfilment.write; inspection, restock and refunds returns.process.
  "/admin/shipments": "fulfilment.write",
  "/admin/returns": "returns.process",
  // B9 engagement: moderation, the support inbox, and loyalty points.
  "/admin/reviews": "reviews.moderate",
  "/admin/messages": "messages.reply",
  "/admin/rewards": "rewards.write",
  "/admin/notifications": "campaigns.send",
  // B6 pricing.
  "/admin/promotions": "promotions.write",
  "/admin/coupons": "promotions.write",
  "/admin/settings": "settings.write",
  "/admin/settings/delivery": "delivery.write",
} as const satisfies Record<string, Capability | null>;
export type AdminPage = keyof typeof ADMIN_PAGE_CAPABILITY;

/** The table entry for a path: an exact match, else the longest section prefix (/admin/products/x → /admin/products). */
export function adminPageFor(pathname: string | null): AdminPage | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0]!.replace(/\/+$/, "") || "/";
  if (path in ADMIN_PAGE_CAPABILITY) return path as AdminPage;
  const prefix = (Object.keys(ADMIN_PAGE_CAPABILITY) as AdminPage[]).filter((p) => p !== "/admin" && path.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0];
  return prefix ?? null;
}

export function adminPageCapability(pathname: string | null): Capability | null {
  const page = adminPageFor(pathname);
  return page ? ADMIN_PAGE_CAPABILITY[page] : null;
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
  // Phase F (D28): /checkout itself is open to guests; its success page stays for signed-in customers.
  const customer = /^\/(account(\/|$)|checkout\/success(\/|$))/.test(rest);
  if (!admin && !customer) return null;
  const login = en && !admin ? "/en/login" : "/login";
  return `${login}?next=${encodeURIComponent(`${pathname}${search}`)}`;
}
