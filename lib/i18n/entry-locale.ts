// Tier: build. Phase F part 2 (BUILD-PLAN D31): which language a new visit opens in.
//
// URLs stay as approved (D10): Bengali at "/…", English at "/en/…". The store's default language
// (settings `locale.default`) decides where a visit that *enters* the site at an unprefixed URL lands:
// - an explicit preference (the `hb-locale` cookie the language switch sets) always wins;
// - otherwise the store default applies; an unknown or missing value falls back to Bengali.
// Only an entry navigation is redirected: a top-level document request (Sec-Fetch-Mode navigate,
// Sec-Fetch-Dest document) arriving from outside the site (Sec-Fetch-Site none or cross-site).
// Links inside the site, prefixed URLs, prefetches, API calls and clients that send no Fetch
// Metadata (crawlers, curl) are never redirected, so "/" is never auto-redirected for crawlers and
// never by Accept-Language (domain-rules §10). The redirect happens before any HTML is rendered,
// so the server render and the client always agree and nothing flashes.
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/locales";

export const LOCALE_COOKIE = "hb-locale";

/** A stored value read back safely: anything that is not a supported locale is ignored. */
export function parseLocale(value: string | null | undefined): Locale | null {
  const v = value?.trim();
  return v && isLocale(v) ? v : null;
}

/** The store default, with a safe fallback to the built-in default (Bengali). */
export function storeDefaultLocale(value: unknown): Locale {
  return typeof value === "string" ? (parseLocale(value) ?? defaultLocale) : defaultLocale;
}

export interface FetchMetadata {
  mode: string | null;
  dest: string | null;
  site: string | null;
  /** Next.js router prefetch / RSC requests carry these; they are never redirected. */
  prefetch: boolean;
}

/** A top-level document navigation that enters the site from outside (typed URL, bookmark, other site). */
export function isEntryNavigation(meta: FetchMetadata): boolean {
  if (meta.prefetch) return false;
  if (meta.mode !== "navigate" || meta.dest !== "document") return false;
  return meta.site === "none" || meta.site === "cross-site";
}

/** The preference that applies: explicit cookie first, then the store default. */
export function preferredLocale(cookie: string | null | undefined, storeDefault: Locale): Locale {
  return parseLocale(cookie) ?? storeDefault;
}

/** True when the visitor needs a store-default lookup at all (entry navigation and no explicit cookie). */
export function needsStoreDefault(cookie: string | null | undefined, meta: FetchMetadata): boolean {
  return isEntryNavigation(meta) && parseLocale(cookie) === null;
}

/**
 * Where an unprefixed (Bengali) request should go instead, or null to serve it as is.
 * `pathname` is the public unprefixed path ("/" or "/c/kitchen").
 */
export function entryRedirect(pathname: string, search: string, cookie: string | null | undefined, storeDefault: Locale, meta: FetchMetadata): string | null {
  if (!isEntryNavigation(meta)) return null;
  const locale = preferredLocale(cookie, storeDefault);
  if (locale === defaultLocale) return null;
  return `/${locale}${pathname === "/" ? "" : pathname}${search}`;
}
