// /deals (B5): products with a real compare-at price above their price.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ListingView } from "@/components/store/ListingView";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { cachedListing } from "@/lib/storefront/public-cache";
import { loadStore, moneyFormat } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata } from "@/lib/storefront/page";
import { parseListingParams } from "@/lib/storefront/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/deals">) {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "store.deals" });
  return storeMetadata(locale, "/deals", t("title"), t("description"));
}

export default async function Page({ params, searchParams }: PageProps<"/[locale]/deals">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store" });
  const parsed = parseListingParams(await searchParams);
  const listing = await cachedListing(store.db, { deals: true, ...parsed.query });
  return (
    <ListingView
      locale={locale}
      format={moneyFormat(store, locale)}
      title={t("deals.title")}
      intro={<p className="listing-intro">{t("deals.description")}</p>}
      listing={listing}
      parsed={parsed}
      base={localeHref(locale, "/deals")}
      sorts={["new", "price_asc", "price_desc"]}
      categoryNames={categoryNames(store, locale)}
      emptyText={t("deals.empty")}
    />
  );
}
