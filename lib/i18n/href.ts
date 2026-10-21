// Locale-aware paths (approved routing: Bengali at "/", English under "/en", shared Latin slugs).
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n/locales";

/** Removes a leading locale segment: "/en/cart" → "/cart"; "/bn/cart" (internal rewrite) → "/cart". */
export function stripLocalePrefix(pathname: string): string {
  const [, first = "", ...rest] = pathname.split("/");
  if (!isLocale(first)) return pathname === "" ? "/" : pathname;
  const path = `/${rest.join("/")}`;
  return path === "/" || path === "" ? "/" : path.replace(/\/$/, "");
}

/** Builds the public URL of a locale-neutral path: ("en", "/cart") → "/en/cart"; ("bn", "/cart") → "/cart". */
export function localeHref(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
