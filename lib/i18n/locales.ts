// Locale routing rules (approved contract): Bengali is the default and lives at "/",
// English lives under "/en". Slugs are shared Latin slugs, so only the prefix differs.
// B1 moves message loading to next-intl; this module stays the single source of the rules.

export const locales = ["bn", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "bn";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

/** What the proxy should do with an incoming pathname. */
export type LocaleRoute =
  | { kind: "rewrite"; locale: Locale; pathname: string } // default locale: internal rewrite to /bn/...
  | { kind: "next"; locale: Locale } // already prefixed with a non-default locale
  | { kind: "redirect"; pathname: string } // explicit default prefix: redirect to the canonical unprefixed URL
  | { kind: "bypass" }; // not a page (API routes)

export function routeLocale(pathname: string): LocaleRoute {
  if (pathname === "/api" || pathname.startsWith("/api/")) return { kind: "bypass" };

  const [, first = ""] = pathname.split("/");
  if (first === defaultLocale) {
    const rest = pathname.slice(defaultLocale.length + 1);
    return { kind: "redirect", pathname: rest === "" ? "/" : rest };
  }
  if (isLocale(first)) return { kind: "next", locale: first };

  return { kind: "rewrite", locale: defaultLocale, pathname: `/${defaultLocale}${pathname === "/" ? "" : pathname}` };
}
