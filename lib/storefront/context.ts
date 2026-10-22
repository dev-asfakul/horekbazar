// Per-request storefront context (B5). One readiness check, one settings read and one category tree
// per request (React cache). Pages render the setup-required state when `ready` is false.
import { cache } from "react";
import { headers } from "next/headers";
import type { Db } from "mongodb";
import { getDatabase } from "@/lib/adapters/db/client";
import { moneyFormatFor, type MoneyFormat } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import { htmlLang, locales, type Locale } from "@/lib/i18n/locales";
import type { LocalizedText } from "@/lib/modules/catalogue/schema";
import { getSettings } from "@/lib/modules/settings/settings";
import { categoryTree, type CategoryTree } from "@/lib/modules/storefront/catalogue";
import { getSetupStatus, type SetupStatus } from "@/lib/setup/status";

export type StoreContext =
  | { ready: false; status: SetupStatus }
  | { ready: true; status: SetupStatus; db: Db; settings: Awaited<ReturnType<typeof getSettings>>; tree: CategoryTree };

export const loadStore = cache(async (): Promise<StoreContext> => {
  const status = await getSetupStatus(process.env);
  if (!status.ready) return { ready: false, status };
  const db = await getDatabase();
  const [settings, tree] = await Promise.all([getSettings(db), categoryTree(db)]);
  return { ready: true, status, db, settings, tree };
});

/**
 * Catalogue text on the storefront: the stored text for the page's language, falling back to the other.
 * Product and category data are kept as entered ({ bn: Bengali script, en }); nothing is transliterated.
 */
export function shown(text: LocalizedText | undefined, locale: Locale): string {
  return (locale === "bn" ? (text?.bn ?? text?.en) : (text?.en ?? text?.bn)) ?? "";
}

/** The `lang` of catalogue text as shown on a page of `locale`. */
export function shownLang(text: LocalizedText | undefined, locale: Locale = "bn"): string {
  if (locale === "bn") return text?.bn ? "bn" : "en";
  return text?.en ? "en" : "bn";
}

export function moneyFormat(ctx: Extract<StoreContext, { ready: true }>, locale: Locale): MoneyFormat {
  return moneyFormatFor(locale, ctx.settings.locale);
}

/** Absolute origin for canonical URLs, sitemap and JSON-LD: NEXT_PUBLIC_SITE_URL, else the request host. */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** canonical + hreflang (bn-Latn, en, x-default → "/") for a locale-neutral path. */
export async function alternates(locale: Locale, path: string) {
  const origin = await siteOrigin();
  const languages: Record<string, string> = {};
  for (const l of locales) languages[htmlLang[l]] = `${origin}${localeHref(l, path)}`;
  languages["x-default"] = `${origin}${localeHref("bn", path)}`;
  return { canonical: `${origin}${localeHref(locale, path)}`, languages };
}

/** Search engines may index the store only when the owner turns it on (not a launch yet: off by default). */
export const indexingAllowed = () => process.env.SITE_INDEXING?.trim().toLowerCase() === "on";
