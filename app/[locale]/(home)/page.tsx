// Home (B5). Until the store is set up (database, Owner, saved settings) it shows the setup-required
// state. Then it renders the published home sections from the admin (B4 merchandising) in order; with
// none, it shows the published top-level categories and the newest products. With nothing published,
// it says so: no placeholder products.
// Redesign (Proposal 03/04b): a carousel first (home_top banners, the hero text, real deals, real
// new arrivals, real delivery zones; nothing invented, never auto-rotating), then the categories as
// photo tiles, then the other sections in the admin's order as rails, with one home_mid banner. Organization and WebSite (with SearchAction) JSON-LD.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/store/JsonLd";
import { ProductGrid } from "@/components/store/ProductGrid";
import { SetupRequired } from "@/components/states/SetupRequired";
import type { QuickAddLabels } from "@/components/commerce/QuickAdd";
import { HomeCarousel } from "@/components/home/HomeCarousel";
import { PlacementBanner } from "@/components/home/PlacementBanner";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { formatCount, formatMoney } from "@/lib/format/money";
import { cartSnapshot } from "@/lib/storefront/cart-snapshot";
import { resolvesInternal } from "@/lib/storefront/links";
import { localeHref } from "@/lib/i18n/href";
import { shellPaths } from "@/lib/routes";
import type { Locale } from "@/lib/i18n/locales";
import type { LocalizedText } from "@/lib/modules/catalogue/schema";
import { categoryPath, collectionQuery, newArrivalsSince, type StoreCategory } from "@/lib/modules/storefront/catalogue";
import { cachedBanner, cachedBanners, cachedCategoryShowcase, cachedCollections, cachedHomeSections, cachedListing } from "@/lib/storefront/public-cache";
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

interface Tile {
  category: StoreCategory;
  count?: number;
  image?: string;
  alt?: string;
}

/** The home page shows at most this many category tiles (4 × 2); the rest are one tap away on /categories. */
const HOME_TILE_LIMIT = 8;

function CategoryTiles({ tiles, locale, title, countText, allLabel }: { tiles: Tile[]; locale: Locale; title: string; countText: (n: number) => string; allLabel: string }) {
  if (tiles.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="home-cats">
      <div className="home-section-head">
        <h2 id="home-cats" className="home-h2">
          {title}
        </h2>
      </div>
      <ul className="cat-tiles" data-home="" data-testid="category-tiles" data-photos={tiles.some((x) => x.image) ? "yes" : undefined}>
        {tiles.map(({ category: c, count, image, alt }) => (
          <li key={c.id}>
            <Link className="cat-tile" href={localeHref(locale, categoryPath(c))}>
              {image ? (
                <span className="cat-tile-photo" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the sized, format-optimised image. */}
                  <img src={image} alt={alt ?? ""} width={160} height={160} loading="lazy" decoding="async" />
                </span>
              ) : null}
              <span className="cat-tile-text">
                <span className="cat-tile-name" lang={shownLang(c.name, locale)}>
                  {shown(c.name, locale)}
                </span>
                {count !== undefined ? <span className="cat-tile-count">{countText(count)}</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="home-all-cats" href={localeHref(locale, shellPaths.categories)} data-testid="home-all-categories">
        {allLabel}
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
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
  const labels: Labels = { now: common("nowPrice"), was: common("wasPrice"), outOfStock: t("card.outOfStock"), options: (count: string) => t("card.options", { count }), units: unitLabels(t) };
  const origin = await siteOrigin();
  const storeName = shown(store.settings.store.name, locale);
  const cloud = cloudinaryConfig();
  const now = new Date();
  const [cart, sections, topBanners, midBanners, deals, fresh, showcase] = await Promise.all([
    cartSnapshot(store.db),
    cachedHomeSections(store.db),
    cachedBanners(store.db, "home_top", now, 4),
    cachedBanners(store.db, "home_mid", now, 1),
    cachedListing(store.db, { deals: true, pageSize: 3 }),
    cachedListing(store.db, { publishedSince: newArrivalsSince(now), sort: "new", pageSize: 3 }),
    cachedCategoryShowcase(store.db, store.tree),
  ]);
  const ctx: SectionCtx = { labels, cart: cart.quantities, quick: { add: t("card.add"), increase: t("card.increase"), decrease: t("card.decrease"), inCart: t("card.inCart"), added: t("card.added"), error: t("card.error") } };
  const rest = sections.filter((s) => s.type !== "hero" && s.type !== "categoryTiles");
  // Start the sections now; they load while the carousel is assembled.
  const nodesPromise = Promise.all(rest.map((s) => renderSection(store, locale, s.id, s.type, s.data, ctx)));
  const count = (n: number) => formatCount(n, format);
  const thumb = (p: { image?: { publicId: string } | undefined }) => (p.image && cloud ? deliveryUrl(cloud.cloudName, p.image.publicId, 160) : null);

  // ── Carousel: banners, the hero text, real deals, real new arrivals, real delivery facts ──
  const slides: React.ReactNode[] = [];
  for (const [i, b] of topBanners.entries()) slides.push(<PlacementBanner key={`b${i}`} store={store} banner={b} locale={locale} width={1280} height={704} eager={i === 0} className="slide slide-banner" sizes="(min-width: 1280px) 1200px, 95vw" />);
  const hero = sections.find((s) => s.type === "hero");
  if (hero) {
    const d = hero.data as { title?: LocalizedText; subtitle?: LocalizedText; ctaLabel?: LocalizedText; href?: string };
    const href = (await resolvesInternal(store.db, store.tree, d.href)) ? d.href : undefined;
    slides.push(
      <div key="hero" className="slide slide-text" data-tone="lime">
        <h2 className="slide-title font-display" lang={shownLang(d.title, locale)}>
          {shown(d.title, locale)}
        </h2>
        {d.subtitle ? <p className="slide-body" lang={shownLang(d.subtitle, locale)}>{shown(d.subtitle, locale)}</p> : null}
        {href && d.ctaLabel ? (
          <Link className="slide-cta" href={localeHref(locale, href)}>
            {shown(d.ctaLabel, locale)}
          </Link>
        ) : null}
      </div>,
    );
  }
  const thumbs = (items: typeof deals.items) => (
    <span className="slide-thumbs" aria-hidden="true">
      {items.map((p) => {
        const src = thumb(p);
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a sized thumbnail.
        return src ? <img key={p.id} src={src} alt="" width={80} height={80} loading="lazy" decoding="async" /> : null;
      })}
    </span>
  );
  if (deals.total > 0)
    slides.push(
      <Link key="deals" className="slide slide-text" data-tone="ink" href={localeHref(locale, "/deals")}>
        <span className="slide-tag">{t("home.dealTag")}</span>
        <span className="slide-title font-display">{t("home.dealTitle", { count: count(deals.total) })}</span>
        {thumbs(deals.items)}
        <span className="slide-cta">{t("home.dealCta")}</span>
      </Link>,
    );
  if (fresh.total > 0)
    slides.push(
      <Link key="new" className="slide slide-text" data-tone="tint" href={localeHref(locale, "/new")}>
        <span className="slide-tag">{t("home.newTag")}</span>
        <span className="slide-title font-display">{t("home.newTitle", { count: count(fresh.total) })}</span>
        {thumbs(fresh.items)}
        <span className="slide-cta">{t("home.newCta")}</span>
      </Link>,
    );
  const zones = store.settings.delivery.zones.filter((z) => z.enabled).slice(0, 3);
  if (zones.length > 0)
    slides.push(
      <Link key="delivery" className="slide slide-text" data-tone="plain" href={localeHref(locale, "/delivery-policy")}>
        <span className="slide-tag">{t("home.deliveryTag")}</span>
        <span className="slide-title font-display">{t("home.deliveryTitle")}</span>
        <span className="slide-zones">
          {zones.map((z) => (
            <span key={z.id} className="slide-zone">
              <span lang={shownLang(z.name, locale)}>{shown(z.name, locale)}</span> · {formatMoney(z.fee.amountMinor, format)} · <span lang={shownLang(z.estimate, locale)}>{shown(z.estimate, locale)}</span>
            </span>
          ))}
        </span>
      </Link>,
    );
  const counter = slides.map((_, i) => t("home.slideOf", { n: count(i + 1), total: count(slides.length) }));

  // ── Categories next (photo: a real product of that category; count: published products) ──
  const tileSection = sections.find((s) => s.type === "categoryTiles");
  const chosen = tileSection ? ((tileSection.data.categoryIds as unknown[]) ?? []).map((cid) => store.tree.byId.get(String(cid))).filter((c): c is StoreCategory => Boolean(c)) : [];
  const tiles: Tile[] = (chosen.length ? chosen : store.tree.roots).slice(0, HOME_TILE_LIMIT).map((c) => {
    const sc = showcase.get(c.id);
    const src = sc?.image && cloud ? deliveryUrl(cloud.cloudName, sc.image.publicId, 160) : undefined;
    return { category: c, ...(sc ? { count: sc.count } : {}), ...(src ? { image: src, alt: "" } : {}) };
  });
  const tileTitle = tileSection?.data.title ? shown(tileSection.data.title as LocalizedText, locale) : t("home.heading");

  // ── Then the remaining sections in the admin's order; one home_mid banner after the second rail ──
  const nodes = await nodesPromise;
  const midBanner = midBanners[0] ? <PlacementBanner key="mid" store={store} banner={midBanners[0]} locale={locale} width={1280} height={560} className="home-banner home-banner-mid" /> : null;
  const rendered: React.ReactNode[] = [];
  let rails = 0;
  let midPlaced = false;
  rest.forEach((s, i) => {
    if (!nodes[i]) return;
    rendered.push(nodes[i]);
    if (s.type === "productRail" && ++rails === 2 && midBanner) {
      rendered.push(midBanner);
      midPlaced = true;
    }
  });
  if (!midPlaced && midBanner) rendered.push(midBanner);

  let fallback: React.ReactNode = null;
  if (rendered.length === 0) {
    const newest = await cachedListing(store.db, { sort: "new", pageSize: 10 });
    fallback =
      store.tree.roots.length === 0 && newest.total === 0 ? (
        <div className="listing-empty" data-testid="home-empty">
          <p className="listing-empty-title">{t("home.emptyTitle")}</p>
          <p className="field-hint">{t("home.emptyBody")}</p>
        </div>
      ) : (
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
            <ProductGrid items={newest.items} locale={locale} format={format} categoryNames={names} labels={labels} testId="home-new-grid" cart={ctx.cart} quick={ctx.quick} />
          ) : (
            <p className="field-hint" data-testid="home-no-products">
              {t("home.emptyBody")}
            </p>
          )}
        </section>
      );
  }

  return (
    <div className="home" data-testid="home">
      <h1 className="sr-only">{storeName}</h1>
      <HomeCarousel
        labels={{ label: t("home.carouselLabel"), prev: t("home.prevSlide"), next: t("home.nextSlide"), goTo: slides.map((_, i) => t("home.goToSlide", { n: count(i + 1) })), counter }}
      >
        {slides}
      </HomeCarousel>
      <CategoryTiles tiles={tiles} locale={locale} title={tileTitle} countText={(n) => t("home.productCount", { count: count(n) })} allLabel={t("home.allCategoriesCta")} />
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
interface SectionCtx {
  labels: Labels;
  cart: Map<string, number>;
  quick: QuickAddLabels;
}


/** One published home section. A section whose referenced data is not published renders nothing. */
async function renderSection(store: ReadyStore, locale: Locale, id: string, type: string, data: Record<string, unknown>, ctx: SectionCtx): Promise<React.ReactNode> {
  const labels = ctx.labels;
  const text = (v: unknown) => shown(v as LocalizedText | undefined, locale);
  const lang = (v: unknown) => shownLang(v as LocalizedText | undefined, locale);
  const t = await getTranslations({ locale, namespace: "store" });
  switch (type) {
    case "productRail": {
      const all = await cachedCollections(store.db);
      const collection = all.find((c) => String(c._id) === String(data.collectionId));
      if (!collection) return null;
      const list = await cachedListing(store.db, { ...collectionQuery(collection, store.tree), sort: "new", pageSize: 10 });
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
          <ProductGrid items={list.items} locale={locale} format={moneyFormat(store, locale)} categoryNames={categoryNames(store, locale)} labels={labels} eagerCount={0} layout="rail" cart={ctx.cart} quick={ctx.quick} />
        </section>
      );
    }
    case "banner": {
      const banner = await cachedBanner(store.db, String(data.bannerId));
      if (!banner) return null;
      const [w, h] = banner.placement === "home_top" ? [1280, 704] : banner.placement === "home_mid" ? [1280, 560] : [1280, 400];
      return <PlacementBanner key={id} store={store} banner={banner} locale={locale} width={w} height={h} className="home-banner" />;
    }
    case "collectionGrid": {
      const ids = ((data.collectionIds as unknown[]) ?? []).map(String);
      const found = (await cachedCollections(store.db)).filter((c) => ids.includes(String(c._id)));
      if (found.length === 0) return null;
      return (
        <section key={id} className="home-section" aria-labelledby={`h-${id}`}>
          <h2 id={`h-${id}`} className="home-h2" lang={data.title ? lang(data.title) : undefined}>
            {data.title ? text(data.title) : t("collections.title")}
          </h2>
          <ul className="cat-tiles">
            {found.map((c) => (
              <li key={String(c._id)}>
                <Link className="cat-tile" href={localeHref(locale, `/collections/${c.slug}`)} lang={shownLang(c.name, locale)}>
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
