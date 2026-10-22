// /new (B5): products published in the last 30 days.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ListingView } from "@/components/store/ListingView";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { listPublishedProducts, newArrivalsSince } from "@/lib/modules/storefront/catalogue";
import { loadStore, moneyFormat } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata } from "@/lib/storefront/page";
import { parseListingParams } from "@/lib/storefront/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/new">) {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "store.newArrivals" });
  return storeMetadata(locale, "/new", t("title"), t("description"));
}

export default async function Page({ params, searchParams }: PageProps<"/[locale]/new">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store" });
  const parsed = parseListingParams(await searchParams);
  const listing = await listPublishedProducts(store.db, { publishedSince: newArrivalsSince(), ...parsed.query });
  return (
    <ListingView
      locale={locale}
      format={moneyFormat(store, locale)}
      title={t("newArrivals.title")}
      intro={<p className="listing-intro">{t("newArrivals.description")}</p>}
      listing={listing}
      parsed={parsed}
      base={localeHref(locale, "/new")}
      sorts={["new", "price_asc", "price_desc"]}
      categoryNames={categoryNames(store, locale)}
      emptyText={t("newArrivals.empty")}
    />
  );
}
