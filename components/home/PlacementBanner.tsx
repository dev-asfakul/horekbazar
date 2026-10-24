// Tier: build. Use-when: a banner placement slot (home_top inside the carousel, home_mid on the
// home page, category_top on category pages; Proposal 04b). Avoid-when: product imagery.
// Reduced-motion: no motion. Fixed crop per slot so the space is reserved (no layout shift); the
// link is kept only when it leads to a real page (lib/storefront/links.ts).
import Link from "next/link";
import { cloudinaryConfig, croppedUrl } from "@/lib/adapters/media/cloudinary";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import type { BannerDoc } from "@/lib/modules/merch/schema";
import { shown } from "@/lib/storefront/context";
import { resolvesInternal } from "@/lib/storefront/links";
import type { ReadyStore } from "@/lib/storefront/page";

/** A placement banner (Proposal 04b): fixed crop per slot; the link only when it resolves. */
export async function PlacementBanner({ store, banner, locale, width, height, eager = false, className, sizes = "(min-width: 1280px) 1200px, 100vw" }: { store: ReadyStore; banner: BannerDoc; locale: Locale; width: number; height: number; eager?: boolean; className: string; sizes?: string }) {
  const cloud = cloudinaryConfig();
  if (!cloud) return null;
  const href = (await resolvesInternal(store.db, store.tree, banner.href)) ? banner.href : undefined;
  const srcSet = [480, 720, 960, width]
    .filter((w, i, a) => w <= width && a.indexOf(w) === i)
    .map((w) => `${croppedUrl(cloud.cloudName, banner.image.publicId, w, Math.round((w * height) / width))} ${w}w`)
    .join(", ");
  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves the sized, format-optimised crop.
  const img = <img src={croppedUrl(cloud.cloudName, banner.image.publicId, width, height)} srcSet={srcSet} sizes={sizes} alt={shown(banner.alt, locale)} width={width} height={height} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} decoding="async" />;
  return (
    <div className={className} data-testid="placement-banner" data-placement={banner.placement}>
      {href ? <Link href={localeHref(locale, href)}>{img}</Link> : img}
    </div>
  );
}

