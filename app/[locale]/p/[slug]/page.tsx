// /p/[slug] (B5): a published product. Option chips are links (?v=SKU) so choosing works without
// JavaScript; the server picks the chosen variant and shows its real price, compare-at price (only when
// higher) and stock. Delivery charges come from the enabled delivery zones in settings (no area mapping
// until D12). Add to cart (B6) is a plain form post with a quantity; checkout opens only when the
// store turns ordering on (features.checkout), and the page says so while it is off.
// JSON-LD Product/Offer for real published data only, plus BreadcrumbList.
import { productBySlug } from "@/lib/storefront/lookups";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LabelTile } from "@/components/commerce/LabelTile";
import { PriceTag } from "@/components/commerce/PriceTag";
import { ActionForm } from "@/components/forms/ActionForm";
import { addToCartAction } from "@/lib/actions/cart";
import { formMessages } from "@/lib/i18n/form-messages";
import { Breadcrumbs } from "@/components/store/Breadcrumbs";
import { JsonLd } from "@/components/store/JsonLd";
import { ProductGrid, netText } from "@/components/store/ProductGrid";
import { SetupRequired } from "@/components/states/SetupRequired";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { formatMoney } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import { categoryPath, listPublishedProducts } from "@/lib/modules/storefront/catalogue";
import { loadStore, moneyFormat, shown, shownLang, siteOrigin } from "@/lib/storefront/context";
import { categoryNames, localeOf, storeMetadata } from "@/lib/storefront/page";
import { unitLabels } from "@/lib/storefront/units";

export async function generateMetadata({ params }: PageProps<"/[locale]/p/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = localeOf(raw);
  if (!locale) return {};
  const store = await loadStore();
  if (!store.ready) return storeMetadata(locale, "/", "");
  const page = await productBySlug(slug);
  if (!page) return {};
  const p = page.product;
  return storeMetadata(locale, `/p/${p.slug}`, shown(p.seo?.title ?? p.name, locale), shown(p.seo?.description ?? p.shortDescription, locale) || undefined);
}

export default async function ProductPage({ params, searchParams }: PageProps<"/[locale]/p/[slug]">) {
  const { locale: raw, slug } = await params;
  const locale = localeOf(raw);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const page = await productBySlug(slug);
  if (!page) notFound();
  const sp = await searchParams;
  const t = await getTranslations({ locale, namespace: "store" });
  const shell = await getTranslations({ locale, namespace: "shell" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = moneyFormat(store, locale);
  const units = unitLabels(t);
  const { product, variants, primaryCategory } = page;
  const wanted = typeof sp.v === "string" ? sp.v : "";
  const variant = variants.find((v) => v.sku === wanted) ?? variants.find((v) => v.available > 0) ?? variants[0]!;
  const name = shown(product.name, locale);
  const path = `/p/${product.slug}`;
  const origin = await siteOrigin();
  const cloud = cloudinaryConfig();
  const net = variant.netQuantity?.verified ? netText(variant.netQuantity, units, format) : undefined;
  const zones = store.settings.delivery.zones.filter((z) => z.enabled);
  const chain = primaryCategory ? [...primaryCategory.ancestors, primaryCategory] : [];
  const crumbs = [
    { name: shell("nav.home"), href: localeHref(locale, "/") },
    ...chain.map((c) => ({ name: shown(c.name, locale), href: localeHref(locale, categoryPath(c)), lang: shownLang(c.name, locale) })),
    { name, href: localeHref(locale, path), lang: shownLang(product.name, locale) },
  ];
  const related = primaryCategory ? (await listPublishedProducts(store.db, { categoryIds: [primaryCategory.id], sort: "new", pageSize: 9 })).items.filter((i) => i.id !== String(product._id)).slice(0, 8) : [];
  const images = cloud ? product.media : [];

  return (
    <article className="pdp" data-testid="product" data-sku={variant.sku}>
      <Breadcrumbs items={crumbs} label={t("product.breadcrumb")} origin={origin} />
      <div className="pdp-grid">
        <div className="pdp-media">
          {images.length > 0 && cloud ? (
            <ul className="pdp-images">
              {images.map((m, i) => (
                <li key={m.publicId}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the sized, format-optimised image. */}
                  <img src={deliveryUrl(cloud.cloudName, m.publicId, 960)} alt={shown(m.alt, locale)} width={960} height={960} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined} decoding="async" />
                </li>
              ))}
            </ul>
          ) : (
            <LabelTile categoryName={primaryCategory ? shown(primaryCategory.name, locale) : ""} netQuantity={net} />
          )}
          {images.some((m) => m.rights.startsWith("Illustrative")) ? (
            <p className="field-hint pdp-media-note" data-testid="illustrative-note">
              {t("product.illustrative")}
            </p>
          ) : null}
        </div>
        <div className="pdp-info">
          <h1 className="font-display pdp-title" lang={shownLang(product.name, locale)}>
            {name}
          </h1>
          {product.shortDescription ? (
            <p className="pdp-short" lang={shownLang(product.shortDescription, locale)}>
              {shown(product.shortDescription, locale)}
            </p>
          ) : null}
          <PriceTag amountMinor={variant.price.amountMinor} compareAtMinor={variant.compareAt?.amountMinor} format={format} labels={{ now: common("nowPrice"), was: common("wasPrice") }} size="lg" />
          {variants.length > 1 ? (
            <nav className="variant-chips" aria-label={t("product.variants")}>
              <p className="field-label">{t("product.variants")}</p>
              <ul>
                {variants.map((v) => (
                  <li key={v.sku}>
                    <Link className="variant-chip" href={`${localeHref(locale, path)}?v=${encodeURIComponent(v.sku)}`} aria-current={v.sku === variant.sku ? "true" : undefined} data-out={v.available > 0 ? undefined : ""} replace scroll={false} lang={shownLang(v.title, locale)}>
                      {shown(v.title, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <p className="pdp-stock" data-testid="stock" data-available={variant.available > 0 ? "yes" : "no"}>
            {variant.available > 0 ? t("product.inStock") : t("product.outOfStock")}
          </p>
          {variant.available > 0 ? (
            <div className="pdp-buy" data-testid="add-to-cart">
              <ActionForm
                action={addToCartAction}
                hidden={{ variantId: String(variant._id) }}
                fields={[{ name: "quantity", label: t("product.quantity"), inputMode: "numeric", defaultValue: "1", required: true, maxLength: 2, autoComplete: "off" }]}
                messages={await formMessages(locale)}
                submitLabel={t("product.addToCart")}
                pendingLabel={t("product.adding")}
                layout="inline"
              />
              <Link className="prose-link pdp-cart-link" href={localeHref(locale, "/cart")} prefetch={false}>
                {t("product.viewCart")}
              </Link>
            </div>
          ) : null}
          {store.settings.features.checkout ? null : (
            <p className="pdp-notice" role="note">
              {t("product.orderingOff")}
            </p>
          )}
          <dl className="pdp-facts">
            <div>
              <dt>{t("product.sku")}</dt>
              <dd lang="en">{variant.sku}</dd>
            </div>
            {net ? (
              <div>
                <dt>{t("product.netQuantity")}</dt>
                <dd>{net}</dd>
              </div>
            ) : null}
            {primaryCategory ? (
              <div>
                <dt>{t("product.category")}</dt>
                <dd>
                  <Link className="prose-link" href={localeHref(locale, categoryPath(primaryCategory))} lang={shownLang(primaryCategory.name, locale)}>
                    {shown(primaryCategory.name, locale)}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
          <section className="pdp-section" aria-labelledby="pdp-delivery">
            <h2 id="pdp-delivery" className="pdp-h2">
              {t("product.delivery")}
            </h2>
            {zones.length === 0 ? (
              <p className="field-hint">{t("product.deliveryNone")}</p>
            ) : (
              <>
                <ul className="pdp-zones" data-testid="delivery-zones">
                  {zones.map((z) => (
                    <li key={z.id}>
                      <span lang={shownLang(z.name, locale)}>{shown(z.name, locale)}</span>
                      <span>{formatMoney(z.fee.amountMinor, format)}</span>
                      <span className="field-hint" lang={shownLang(z.estimate, locale)}>
                        {shown(z.estimate, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="field-hint">{t("product.deliveryNote")}</p>
              </>
            )}
          </section>
        </div>
      </div>
      {product.description || product.attributes.length > 0 ? (
        <section className="pdp-section pdp-details" aria-labelledby="pdp-details">
          <h2 id="pdp-details" className="pdp-h2">
            {t("product.details")}
          </h2>
          {product.description ? (
            <p className="pdp-description" lang={shownLang(product.description, locale)}>
              {shown(product.description, locale)}
            </p>
          ) : null}
          {product.attributes.length > 0 ? (
            <table className="pdp-specs">
              <caption className="sr-only">{t("product.specs")}</caption>
              <tbody>
                {product.attributes.map((a) => (
                  <tr key={a.key}>
                    <th scope="row" lang={shownLang(a.label, locale)}>
                      {shown(a.label, locale)}
                    </th>
                    <td lang={shownLang(a.value, locale)}>{shown(a.value, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
      {related.length > 0 ? (
        <section className="pdp-section" aria-labelledby="pdp-related">
          <h2 id="pdp-related" className="pdp-h2">
            {t("product.related")}
          </h2>
          <ProductGrid items={related} locale={locale} format={format} categoryNames={categoryNames(store, locale)} eagerCount={0} testId="related-grid" labels={{ now: common("nowPrice"), was: common("wasPrice"), outOfStock: t("card.outOfStock"), options: (count) => t("card.options", { count }), units }} />
        </section>
      ) : null}
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name,
          sku: variant.sku,
          url: `${origin}${localeHref(locale, path)}`,
          ...(product.shortDescription ? { description: shown(product.shortDescription, locale) } : {}),
          ...(images.length && cloud ? { image: images.map((m) => deliveryUrl(cloud.cloudName, m.publicId, 960)) } : {}),
          ...(primaryCategory ? { category: shown(primaryCategory.name, locale) } : {}),
          offers: variants.map((v) => ({
            "@type": "Offer",
            sku: v.sku,
            price: (v.price.amountMinor / 100).toFixed(2),
            priceCurrency: "BDT",
            availability: v.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: `${origin}${localeHref(locale, path)}?v=${encodeURIComponent(v.sku)}`,
          })),
        }}
      />
    </article>
  );
}
