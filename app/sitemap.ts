// sitemap.xml (B5): published categories, collections and products in both locales with hreflang
// alternates. Empty until the store is set up. Origin: NEXT_PUBLIC_SITE_URL, else the request host.
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { localeHref } from "@/lib/i18n/href";
import { htmlLang, locales } from "@/lib/i18n/locales";
import { categoryPath, sitemapEntries } from "@/lib/modules/storefront/catalogue";
import { loadStore, siteOrigin } from "@/lib/storefront/context";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const store = await loadStore();
  if (!store.ready) return [];
  const origin = await siteOrigin();
  const { products, collections } = await sitemapEntries(store.db);
  const entry = (path: string, lastModified?: Date): MetadataRoute.Sitemap => {
    const languages = Object.fromEntries([...locales.map((l) => [htmlLang[l], `${origin}${localeHref(l, path)}`]), ["x-default", `${origin}${localeHref("bn", path)}`]]);
    return locales.map((l) => ({ url: `${origin}${localeHref(l, path)}`, ...(lastModified ? { lastModified } : {}), alternates: { languages } }));
  };
  return [
    ...entry("/"),
    ...entry("/categories"),
    ...[...store.tree.byId.values()].flatMap((c) => entry(categoryPath(c))),
    ...(collections.length ? entry("/collections") : []),
    ...collections.flatMap((c) => entry(`/collections/${c.slug}`, c.updatedAt)),
    ...products.flatMap((p) => entry(`/p/${p.slug}`, p.updatedAt)),
  ];
}
