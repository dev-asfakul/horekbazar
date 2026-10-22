// /search?q= (B5): full-word text search (index language "none") with word-prefix fallback, same filters
// and pagination as category listings. Search result pages are never indexed.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ListingView } from "@/components/store/ListingView";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { listPublishedProducts, normaliseQuery } from "@/lib/modules/storefront/catalogue";
import { loadStore, moneyFormat } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata } from "@/lib/storefront/page";
import { parseListingParams } from "@/lib/storefront/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/search">) {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "store.search" });
  return { ...(await storeMetadata(locale, "/search", t("title"))), robots: { index: false, follow: true } };
}

export default async function SearchPage({ params, searchParams }: PageProps<"/[locale]/search">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store" });
  const sp = await searchParams;
  const q = normaliseQuery(typeof sp.q === "string" ? sp.q : "");
  const base = localeHref(locale, "/search");
  if (!q) {
    return (
      <div className="listing" data-testid="search-prompt">
        <header className="listing-head">
          <h1 className="font-display listing-title">{t("search.title")}</h1>
        </header>
        <form role="search" method="get" action={base} className="search-page-form">
          <label className="field-label" htmlFor="search-page-q">
            {t("search.prompt")}
          </label>
          <div className="search-page-row">
            <input id="search-page-q" name="q" type="search" className="field-input" maxLength={80} enterKeyHint="search" autoComplete="off" />
            <button type="submit" className="btn btn-primary">
              {t("search.title")}
            </button>
          </div>
        </form>
      </div>
    );
  }
  const parsed = parseListingParams(sp, true);
  const listing = await listPublishedProducts(store.db, { text: q, ...parsed.query });
  return (
    <ListingView
      locale={locale}
      format={moneyFormat(store, locale)}
      title={t("search.heading", { q })}
      listing={listing}
      parsed={parsed}
      base={base}
      q={q}
      sorts={["relevance", "new", "price_asc", "price_desc"]}
      categoryNames={categoryNames(store, locale)}
      emptyText={t("search.empty", { q })}
      intro={listing.total === 0 && !parsed.filtered ? <p className="listing-intro">{t("search.emptyHint")}</p> : null}
    />
  );
}
