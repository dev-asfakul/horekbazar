// Tier: build (contract). Use-when: every storefront page, once, from the locale layout. Avoid-when: admin (own shell).
// Reduced-motion: no motion; sticky search row only. Touch: every control at least 44 px tall.
// SiteHeader (#site-header): wordmark, persistent search with the category entry beside it, language
// switch, and account and cart links from band M up. Band S: the wordmark row scrolls away and the
// search row stays sticky (DESIGN.md → Layout → Nav). The search is a plain GET form to /search,
// so it works without JavaScript; suggestions arrive with search (B5).
import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitch, LocaleSwitchFallback } from "@/components/shell/LocaleSwitch";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import { shellPaths } from "@/lib/routes";

export async function SiteHeader({ locale, storeName }: { locale: Locale; storeName: string | null }) {
  const t = await getTranslations({ locale, namespace: "shell" });
  const other: Locale = locale === "bn" ? "en" : "bn";
  const switchProps = { target: other, label: t("localeSwitch.label"), ariaLabel: t("localeSwitch.ariaLabel") };

  return (
    <header id="site-header" className="site-header">
      <div className="site-header-inner">
        <div className="header-wordmark-row">
          <Link href={localeHref(locale, shellPaths.home)} className="wordmark font-display" prefetch={false}>
            {storeName ?? t("wordmarkUnconfigured")}
          </Link>
        </div>
        <div className="header-search-row">
          <Link href={localeHref(locale, shellPaths.categories)} className="btn btn-secondary category-button" prefetch={false}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" />
            </svg>
            <span>{t("categories")}</span>
          </Link>
          <form role="search" action={localeHref(locale, shellPaths.search)} method="get" className="header-search">
            <label htmlFor="site-search" className="sr-only">
              {t("search.label")}
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={t("search.placeholder")}
              className="header-search-input"
            />
            <button type="submit" className="header-search-submit">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6L20 21l1-1-5.4-5.47A6.5 6.5 0 0 0 10.5 4z" fill="none" stroke="currentColor" strokeWidth="1.75" />
              </svg>
              <span className="sr-only">{t("search.submit")}</span>
            </button>
          </form>
        </div>
        <nav aria-label={t("headerNavLabel")} className="header-actions">
          <Suspense fallback={<LocaleSwitchFallback {...switchProps} currentPath="/" />}>
            <LocaleSwitch {...switchProps} />
          </Suspense>
          <Link href={localeHref(locale, shellPaths.account)} className="nav-link header-action header-action-wide" prefetch={false}>
            {t("account")}
          </Link>
          <Link href={localeHref(locale, shellPaths.cart)} className="nav-link header-action header-action-wide" prefetch={false}>
            {t("cart")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
