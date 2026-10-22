// Tier: build (concept). KhataGrid (DESIGN.md → Components): ruled ledger lines, no cards; 2 columns
// below 768 px, 3 to 1279 px, 4 from 1280 px and 5 from 1536 px. Each item links to its product page.
// A product without a photo shows the LabelTile (category and verified net quantity only), never a
// stand-in image. Prices and stock come from the catalogue as stored; nothing is computed for show.
import Link from "next/link";
import { LabelTile } from "@/components/commerce/LabelTile";
import { PriceTag } from "@/components/commerce/PriceTag";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { formatCount, type MoneyFormat } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import type { ListingItem } from "@/lib/modules/storefront/catalogue";
import { shown, shownLang } from "@/lib/storefront/context";

export interface GridLabels {
  now: string;
  was: string;
  outOfStock: string;
  options: (count: string) => string;
  units: Record<string, string>;
}

export function netText(n: { value: number; unit: string }, units: Record<string, string>, format: MoneyFormat): string {
  const value = Number.isInteger(n.value) ? formatCount(n.value, format) : String(n.value);
  return `${value} ${units[n.unit] ?? n.unit}`;
}

export function ProductGrid({ items, locale, format, categoryNames, labels, eagerCount = 4, testId = "product-grid" }: { items: ListingItem[]; locale: Locale; format: MoneyFormat; categoryNames: Map<string, string>; labels: GridLabels; eagerCount?: number; testId?: string }) {
  const cloud = cloudinaryConfig();
  return (
    <ul className="khata-grid" data-testid={testId}>
      {items.map((p, i) => {
        const name = shown(p.name, locale);
        const net = p.netQuantity ? netText(p.netQuantity, labels.units, format) : undefined;
        return (
          <li key={p.id} className="khata-item" data-slug={p.slug} data-available={p.available > 0 ? "yes" : "no"}>
            <Link className="khata-link" href={localeHref(locale, `/p/${p.slug}`)}>
              <span className="khata-media">
                {p.image && cloud ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the sized, format-optimised image.
                  <img src={deliveryUrl(cloud.cloudName, p.image.publicId, 480)} alt={shown(p.image.alt, locale)} width={480} height={480} loading={i < eagerCount ? "eager" : "lazy"} decoding="async" />
                ) : (
                  <LabelTile categoryName={categoryNames.get(p.primaryCategoryId) ?? ""} netQuantity={net} />
                )}
              </span>
              <span className="khata-name" lang={shownLang(p.name)}>
                {name}
              </span>
            </Link>
            <PriceTag amountMinor={p.price} compareAtMinor={p.compareAt} format={format} labels={{ now: labels.now, was: labels.was }} />
            <p className="khata-meta">
              {p.available > 0 ? null : <span className="khata-out">{labels.outOfStock}</span>}
              {p.variantCount > 1 ? <span>{labels.options(formatCount(p.variantCount, format))}</span> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
