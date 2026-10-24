// /c/[...slug] (B5): a published category, 1 to 3 levels. Shows the whole subtree's published
// products with sort, in-stock and price filters, 24 per page. Unknown or mismatched paths are 404.
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@/components/store/Breadcrumbs";
import { PlacementBanner } from "@/components/home/PlacementBanner";
import { ListingView } from "@/components/store/ListingView";
import { SetupRequired } from "@/components/states/SetupRequired";
import { localeHref } from "@/lib/i18n/href";
import { categoryPath, listPublishedBanners, listPublishedProducts, resolveCategoryPath, subtreeIds } from "@/lib/modules/storefront/catalogue";
import { loadStore, moneyFormat, shown, shownLang, siteOrigin } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata } from "@/lib/storefront/page";
import { parseListingParams } from "@/lib/storefront/params";

export async function generateMetadata({ params }: PageProps<"/[locale]/c/[...slug]">) {
  const { locale: raw, slug } = await params;
  const locale = localeOf(raw);
  if (!locale) return {};
  const store = await loadStore();
  const category = store.ready ? resolveCategoryPath(store.tree, slug) : null;
  if (store.ready && !category) return {};
  return storeMetadata(locale, category ? categoryPath(category) : "/", category ? shown(category.name, locale) : "", category?.description ? shown(category.description, locale) : undefined);
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/[locale]/c/[...slug]">) {
  const { locale: raw, slug } = await params;
  const locale = localeOf(raw);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const category = resolveCategoryPath(store.tree, slug);
  if (!category) notFound();
  const t = await getTranslations({ locale, namespace: "store" });
  const shell = await getTranslations({ locale, namespace: "shell" });
  const parsed = parseListingParams(await searchParams);
  const [listing, banners] = await Promise.all([listPublishedProducts(store.db, { categoryIds: subtreeIds(category), ...parsed.query }), listPublishedBanners(store.db, "category_top", new Date(), 1)]);
  const origin = await siteOrigin();
  const crumbs = [
    { name: shell("nav.home"), href: localeHref(locale, "/") },
    { name: shell("categories"), href: localeHref(locale, "/categories") },
    ...[...category.ancestors, category].map((c) => ({ name: shown(c.name, locale), href: localeHref(locale, categoryPath(c)), lang: shownLang(c.name, locale) })),
  ];
  return (
    <ListingView
      locale={locale}
      format={moneyFormat(store, locale)}
      title={shown(category.name, locale)}
      titleLang={shownLang(category.name, locale)}
      before={
        <>
          <Breadcrumbs items={crumbs} label={t("product.breadcrumb")} origin={origin} />
          {category.children.length > 0 ? (
            <nav className="subcats" aria-label={t("listing.subcategories")}>
              <ul>
                {category.children.map((c) => (
                  <li key={c.id}>
                    <Link className="chip-link" href={localeHref(locale, categoryPath(c))} lang={shownLang(c.name, locale)}>
                      {shown(c.name, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {banners[0] ? <PlacementBanner store={store} banner={banners[0]} locale={locale} width={1280} height={400} className="category-banner" /> : null}
        </>
      }
      intro={category.description ? <p className="listing-intro">{shown(category.description, locale)}</p> : null}
      listing={listing}
      parsed={parsed}
      base={localeHref(locale, categoryPath(category))}
      sorts={["new", "price_asc", "price_desc"]}
      categoryNames={categoryNames(store, locale)}
      emptyText={t("listing.empty")}
    />
  );
}
