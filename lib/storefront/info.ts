// The B10 information and legal pages: one table of page keys and paths, and their metadata.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/locales";
import { storeMetadata } from "@/lib/storefront/page";

export const INFO_PAGES = {
  about: "/about",
  faq: "/faq",
  terms: "/terms",
  privacy: "/privacy-policy",
  delivery: "/delivery-policy",
  returns: "/return-policy",
  contact: "/contact",
} as const;
export type InfoPageKey = keyof typeof INFO_PAGES;

/**
 * Title, canonical and hreflang as on other storefront pages. Pages whose text is still [NEEDS COPY]
 * ask not to be indexed, whatever SITE_INDEXING says, so placeholder text never reaches search results.
 */
export async function infoMetadata(locale: Locale, key: InfoPageKey, pendingCopy: boolean): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "store.info" });
  const meta = await storeMetadata(locale, INFO_PAGES[key], t(`${key}.title`));
  return pendingCopy ? { ...meta, robots: { index: false, follow: true } } : meta;
}
