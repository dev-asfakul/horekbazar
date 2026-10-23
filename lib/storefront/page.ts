// Small helpers shared by the B5 storefront pages.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { alternates, indexingAllowed, loadStore, shown, type StoreContext } from "@/lib/storefront/context";

export type ReadyStore = Extract<StoreContext, { ready: true }>;

export function localeOf(value: string): Locale | null {
  return isLocale(value) ? value : null;
}

export function categoryNames(store: ReadyStore, locale: Locale): Map<string, string> {
  return new Map([...store.tree.byId.values()].map((c) => [c.id, shown(c.name, locale)]));
}

/**
 * Metadata for a storefront page: title, description, canonical, hreflang, and an optional share
 * image (an absolute URL, e.g. the product's first photo); noindex until indexing is on.
 */
export async function storeMetadata(locale: Locale, path: string, title: string, description?: string, image?: string): Promise<Metadata> {
  const store = await loadStore();
  if (!store.ready) {
    const t = await getTranslations({ locale, namespace: "setup" });
    return { title: t("title"), robots: { index: false, follow: false } };
  }
  return {
    title,
    ...(description ? { description: description.slice(0, 160) } : {}),
    alternates: await alternates(locale, path),
    openGraph: { title, ...(description ? { description: description.slice(0, 160) } : {}), type: "website", ...(image ? { images: [{ url: image }] } : {}) },
    ...(indexingAllowed() ? {} : { robots: { index: false, follow: true } }),
  };
}
