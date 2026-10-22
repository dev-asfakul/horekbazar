// Home (B5). Until the store is set up (database, Owner, saved settings) it shows the setup-required
// state. Then it renders the published home sections from the admin (B4 merchandising) in order; with
// none, it shows the published top-level categories and the newest products. With nothing published,
// it says so: no placeholder products. Organization and WebSite (with SearchAction) JSON-LD.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/store/JsonLd";
import { ProductGrid } from "@/components/store/ProductGrid";
import { SetupRequired } from "@/components/states/SetupRequired";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import type { LocalizedText } from "@/lib/modules/catalogue/schema";
import { categoryPath, collectionQuery, getPublishedBanner, listHomeSections, listPublishedCollections, listPublishedProducts, type StoreCategory } from "@/lib/modules/storefront/catalogue";
import { loadStore, moneyFormat, shown, shownLang, siteOrigin } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata, type ReadyStore } from "@/lib/storefront/page";
import { unitLabels } from "@/lib/storefront/units";

export async function generateMetadata({ params }: PageProps<"/[locale]">) {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const store = await loadStore();
  const t = await getTranslations({ locale, namespace: "store.home" });
  const name = store.ready ? shown(store.settings.store.name, locale) : "HorekBazar";
  return storeMetadata(locale, "/", `${name} | ${t("title")}`, store.ready ? t("heading") : undefined);
}

function CategoryTiles({ categories, locale, title }: { categories: StoreCategory[]; locale: Locale; title: string }) {
  if (categories.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="home-cats">
      <h2 id="home-cats" className="home-h2">
        {title}
      </h2>
      <ul className="cat-tiles" data-testid="category-tiles">
        {categories.map((c) => (
          <li key={c.id}>
            <Link className="cat-tile" href={localeHref(locale, categoryPath(c))} lang={shownLang(c.name)}>
              {shown(c.name, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = moneyFormat(store, locale);
  const names = categoryNames(store, locale);
  const labels = { now: common("nowPrice"), was: common("wasPrice"), outOfStock: t("card.outOfStock"), options: (count: string) => t("card.options", { count }), units: unitLabels(t) };
  const origin = await siteOrigin();
  const storeName = shown(store.settings.store.name, locale);
  const sections = await listHomeSections(store.db);
  const rendered = (await Promise.all(sections.map((s) => renderSection(store, locale, s.id, s.type, s.data, labels)))).filter(Boolean);

  let fallback: React.ReactNode = null;
  if (rendered.length === 0) {
    const newest = await listPublishedProducts(store.db, { sort: "new", pageSize: 10 });
    fallback =
      store.tree.roots.length === 0 && newest.total === 0 ? (
        <div className="listing-empty" data-testid="home-empty">
          <p className="listing-empty-title">{t("home.emptyTitle")}</p>
          <p className="field-hint">{t("home.emptyBody")}</p>
        </div>
      ) : (
        <>
          <CategoryTiles categories={store.tree.roots} locale={locale} title={t("home.heading")} />
          <section className="home-section" aria-labelledby="home-new">
            <div className="home-section-head">
              <h2 id="home-new" className="home-h2">
                {t("home.newHeading")}
              </h2>
              {newest.total > 0 ? (
                <Link className="prose-link" href={localeHref(locale, "/new")}>
                  {t("home.seeAll")}
                </Link>
              ) : null}
            </div>
            {newest.items.length > 0 ? (
              <ProductGrid items={newest.items} locale={locale} format={format} categoryNames={names} labels={labels} testId="home-new-grid" />
            ) : (
              <p className="field-hint" data-testid="home-no-products">
                {t("home.emptyBody")}
              </p>
            )}
          </section>
        </>
      );
  }

  return (
    <div className="home" data-testid="home">
      <h1 className="sr-only">{storeName}</h1>
      {rendered}
      {fallback}
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", name: storeName, url: `${origin}${localeHref(locale, "/")}`, ...(store.settings.store.contact.email ? { email: store.settings.store.contact.email } : {}), ...(store.settings.store.contact.phone ? { telephone: store.settings.store.contact.phone } : {}) }} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: storeName,
          url: `${origin}${localeHref(locale, "/")}`,
          potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}${localeHref(locale, "/search")}?q={search_term_string}` }, "query-input": "required name=search_term_string" },
        }}
      />
    </div>
  );
}

type Labels = Parameters<typeof ProductGrid>[0]["labels"];

/** One published home section. A section whose referenced data is not published renders nothing. */
async function renderSection(store: ReadyStore, locale: Locale, id: string, type: string, data: Record<string, unknown>, labels: Labels): Promise<React.ReactNode> {
  const text = (v: unknown) => shown(v as LocalizedText | undefined, locale);
  const lang = (v: unknown) => shownLang(v as LocalizedText | undefined);
  const cloud = cloudinaryConfig();
  const t = await getTranslations({ locale, namespace: "store" });
  switch (type) {
    case "hero": {
      const image = data.image as { publicId: string; alt: LocalizedText; width?: number; height?: number } | undefined;
      const href = typeof data.href === "string" ? data.href : undefined;
      return (
        <section key={id} className="home-hero" aria-labelledby={`h-${id}`}>
          {image && cloud ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the sized, format-optimised image.
            <img className="home-hero-img" src={deliveryUrl(cloud.cloudName, image.publicId, 1280)} alt={text(image.alt)} width={1280} height={1280} fetchPriority="high" />
          ) : null}
          <div className="home-hero-text">
            <h2 id={`h-${id}`} className="font-display home-hero-title" lang={lang(data.title)}>
              {text(data.title)}
            </h2>
            {data.subtitle ? <p lang={lang(data.subtitle)}>{text(data.subtitle)}</p> : null}
            {href && data.ctaLabel ? (
              <Link className="btn btn-primary" href={localeHref(locale, href)}>
                {text(data.ctaLabel)}
              </Link>
            ) : null}
          </div>
        </section>
      );
    }
    case "categoryTiles": {
      const cats = ((data.categoryIds as unknown[]) ?? []).map((cid) => store.tree.byId.get(String(cid))).filter((c): c is StoreCategory => Boolean(c));
      return cats.length ? <CategoryTiles key={id} categories={cats} locale={locale} title={data.title ? text(data.title) : t("home.heading")} /> : null;
    }
    case "productRail": {
      const all = await listPublishedCollections(store.db);
      const collection = all.find((c) => String(c._id) === String(data.collectionId));
      if (!collection) return null;
      const list = await listPublishedProducts(store.db, { ...collectionQuery(collection, store.tree), sort: "new", pageSize: 10 });
      if (list.items.length === 0) return null;
      return (
        <section key={id} className="home-section" aria-labelledby={`h-${id}`}>
          <div className="home-section-head">
            <h2 id={`h-${id}`} className="home-h2" lang={lang(data.title)}>
              {text(data.title)}
            </h2>
            <Link className="prose-link" href={localeHref(locale, `/collections/${collection.slug}`)}>
              {t("home.seeAll")}
            </Link>
          </div>
          <ProductGrid items={list.items} locale={locale} format={moneyFormat(store, locale)} categoryNames={categoryNames(store, locale)} labels={labels} eagerCount={0} />
        </section>
      );
    }
    case "banner": {
      const banner = await getPublishedBanner(store.db, String(data.bannerId));
      if (!banner || !cloud) return null;
      // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the sized, format-optimised image.
      const img = <img className="home-banner-img" src={deliveryUrl(cloud.cloudName, banner.image.publicId, 1280)} alt={text(banner.alt)} width={1280} height={1280} loading="lazy" />;
      return (
        <section key={id} className="home-banner">
          {banner.href ? <Link href={localeHref(locale, banner.href)}>{img}</Link> : img}
        </section>
      );
    }
    case "collectionGrid": {
      const ids = ((data.collectionIds as unknown[]) ?? []).map(String);
      const found = (await listPublishedCollections(store.db)).filter((c) => ids.includes(String(c._id)));
      if (found.length === 0) return null;
      return (
        <section key={id} className="home-section" aria-labelledby={`h-${id}`}>
          <h2 id={`h-${id}`} className="home-h2" lang={data.title ? lang(data.title) : undefined}>
            {data.title ? text(data.title) : t("collections.title")}
          </h2>
          <ul className="cat-tiles">
            {found.map((c) => (
              <li key={String(c._id)}>
                <Link className="cat-tile" href={localeHref(locale, `/collections/${c.slug}`)} lang={shownLang(c.name)}>
                  {shown(c.name, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    }
    case "richText":
      return (
        <section key={id} className="home-section home-text" aria-labelledby={data.title ? `h-${id}` : undefined}>
          {data.title ? (
            <h2 id={`h-${id}`} className="home-h2" lang={lang(data.title)}>
              {text(data.title)}
            </h2>
          ) : null}
          <p lang={lang(data.body)}>{text(data.body)}</p>
        </section>
      );
    default:
      return null;
  }
}
