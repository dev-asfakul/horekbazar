// Tier: build. The shared listing layout for categories, collections, deals, new products and search:
// heading, optional subcategory links, filters (sort, in-stock, price range; a GET form that works
// without JavaScript), result count, KhataGrid, pagination and honest empty states. Filters sit above
// the grid below 1280 px (collapsible) and in a sidebar from 1280 px.
import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ProductGrid } from "@/components/store/ProductGrid";
import { StorePager } from "@/components/store/StorePager";
import { formatCount, formatMoney, type MoneyFormat } from "@/lib/format/money";
import type { Locale } from "@/lib/i18n/locales";
import type { Listing, Sort } from "@/lib/modules/storefront/catalogue";
import { listingHref, type ParsedListing } from "@/lib/storefront/params";
import { unitLabels } from "@/lib/storefront/units";

interface Props {
  locale: Locale;
  format: MoneyFormat;
  title: string;
  titleLang?: string;
  intro?: ReactNode;
  before?: ReactNode;
  listing: Listing;
  parsed: ParsedListing;
  /** Locale-prefixed path of this listing, e.g. "/en/c/grocery". */
  base: string;
  q?: string;
  sorts: Sort[];
  categoryNames: Map<string, string>;
  emptyText: string;
}

export async function ListingView({ locale, format, title, titleLang, intro, before, listing, parsed, base, q, sorts, categoryNames, emptyText }: Props) {
  const t = await getTranslations({ locale, namespace: "store" });
  const c = await getTranslations({ locale, namespace: "common" });
  const current = { ...parsed.form, ...(q ? { q } : {}) };
  const anyFilter = parsed.filtered || Boolean(parsed.form.sort);
  const clearHref = listingHref(base, { sort: "", stock: false, min: "", max: "", ...(q ? { q } : {}) });
  return (
    <div className="listing" data-testid="listing">
      <header className="listing-head">
        <h1 className="font-display listing-title" lang={titleLang}>
          {title}
        </h1>
        {intro}
      </header>
      {before}
      <div className="listing-body">
        <form className="listing-filters" method="get" action={base} aria-label={t("listing.filters")} data-testid="listing-filters">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <div className="field">
            <label className="field-label" htmlFor="ls-sort">
              {t("listing.sort")}
            </label>
            <select id="ls-sort" name="sort" className="field-input" defaultValue={parsed.form.sort || sorts[0]}>
              {sorts.map((s) => (
                <option key={s} value={s}>
                  {t(`sorts.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <details className="listing-more" open={parsed.filtered || parsed.priceError || undefined}>
            <summary className="listing-more-summary">{t("listing.filters")}</summary>
            <div className="listing-more-body">
              <label className="field-check">
                <input type="checkbox" name="stock" value="1" defaultChecked={parsed.form.stock} />
                <span>{t("listing.inStock")}</span>
              </label>
              <div className="field">
                <label className="field-label" htmlFor="ls-min">
                  {t("listing.minPrice")}
                </label>
                <input id="ls-min" name="min" className="field-input" inputMode="numeric" maxLength={9} defaultValue={parsed.form.min} aria-invalid={parsed.priceError || undefined} aria-describedby={parsed.priceError ? "ls-price-error" : undefined} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="ls-max">
                  {t("listing.maxPrice")}
                </label>
                <input id="ls-max" name="max" className="field-input" inputMode="numeric" maxLength={9} defaultValue={parsed.form.max} aria-invalid={parsed.priceError || undefined} aria-describedby={parsed.priceError ? "ls-price-error" : undefined} />
              </div>
              {parsed.priceError ? (
                <p id="ls-price-error" className="field-error" role="alert">
                  {t("listing.priceInvalid")}
                </p>
              ) : listing.priceRange ? (
                <p className="field-hint">{t("listing.priceRange", { min: formatMoney(listing.priceRange.min, format), max: formatMoney(listing.priceRange.max, format) })}</p>
              ) : null}
            </div>
          </details>
          <div className="form-actions">
            <button type="submit" className="btn btn-secondary">
              {t("listing.apply")}
            </button>
            {anyFilter ? (
              <Link className="prose-link" href={clearHref}>
                {t("listing.clearFilters")}
              </Link>
            ) : null}
          </div>
        </form>
        <section className="listing-results" aria-labelledby="listing-count">
          <p id="listing-count" className="listing-count" role="status">
            {t("listing.results", { count: formatCount(listing.total, format) })}
          </p>
          {listing.items.length === 0 ? (
            <div className="listing-empty" data-testid="listing-empty">
              <p className="listing-empty-title">{parsed.filtered ? t("listing.emptyFiltered") : emptyText}</p>
              {parsed.filtered ? (
                <Link className="btn btn-secondary" href={clearHref}>
                  {t("listing.clearFilters")}
                </Link>
              ) : null}
            </div>
          ) : (
            <ProductGrid
              items={listing.items}
              locale={locale}
              format={format}
              categoryNames={categoryNames}
              labels={{ now: c("nowPrice"), was: c("wasPrice"), outOfStock: t("card.outOfStock"), options: (count) => t("card.options", { count }), units: unitLabels(t) }}
            />
          )}
          <StorePager
            page={listing.page}
            pages={listing.pages}
            hrefFor={(p) => listingHref(base, current, { page: p })}
            labels={{ prev: t("listing.prev"), next: t("listing.next"), nav: t("listing.pagination"), status: t("listing.pageOf", { page: formatCount(listing.page, format), pages: formatCount(listing.pages, format) }) }}
          />
        </section>
      </div>
    </div>
  );
}
