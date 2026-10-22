// /collections/[slug] (B5): a published collection's products. Manual collections list their chosen
// products (published ones only); rule collections match their categories and price cap.
import { collectionBySlug } from "@/lib/storefront/lookups";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/store/Breadcrumbs";
import { ListingView } from "@/components/store/ListingView";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { collectionQuery, listPublishedProducts } from "@/lib/modules/storefront/catalogue";
import { loadStore, moneyFormat, shown, shownLang, siteOrigin } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata } from "@/lib/storefront/page";
import { parseListingParams } from "@/lib/storefront/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/collections/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = localeOf(raw);
  if (!locale) return {};
  const store = await loadStore();
  if (!store.ready) return storeMetadata(locale, "/", "");
  const c = await collectionBySlug(slug);
  if (!c) return {};
  return storeMetadata(locale, `/collections/${c.slug}`, shown(c.seo?.title ?? c.name, locale), shown(c.seo?.description ?? c.description, locale) || undefined);
}

export default async function CollectionPage({ params, searchParams }: PageProps<"/[locale]/collections/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = localeOf(raw);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const collection = await collectionBySlug(slug);
  if (!collection) notFound();
  const t = await getTranslations({ locale, namespace: "store" });
  const shell = await getTranslations({ locale, namespace: "shell" });
  const parsed = parseListingParams(await searchParams);
  const listing = await listPublishedProducts(store.db, { ...collectionQuery(collection, store.tree), ...parsed.query });
  const name = shown(collection.name, locale);
  const crumbs = [
    { name: shell("nav.home"), href: localeHref(locale, "/") },
    { name: t("collections.title"), href: localeHref(locale, "/collections") },
    { name, href: localeHref(locale, `/collections/${collection.slug}`), lang: shownLang(collection.name, locale) },
  ];
  return (
    <ListingView
      locale={locale}
      format={moneyFormat(store, locale)}
      title={name}
      titleLang={shownLang(collection.name, locale)}
      before={<Breadcrumbs items={crumbs} label={t("product.breadcrumb")} origin={await siteOrigin()} />}
      intro={collection.description ? <p className="listing-intro">{shown(collection.description, locale)}</p> : null}
      listing={listing}
      parsed={parsed}
      base={localeHref(locale, `/collections/${collection.slug}`)}
      sorts={["new", "price_asc", "price_desc"]}
      categoryNames={categoryNames(store, locale)}
      emptyText={t("listing.empty")}
    />
  );
}
