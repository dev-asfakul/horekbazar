// Tier: build (contract). Use-when: every storefront page, once, from the locale layout. Avoid-when: admin (own shell).
// Reduced-motion: no motion. Touch: every control at least 44 px tall.
// SiteHeader (#site-header), redesign Proposal 03 as amended by the owner (2026-10-24): the store
// name in Alkatra sits top left at every width, in DOM order and visual order alike. Below 768 px the
// row is name, then the search icon, then the bell; the bottom bar carries home, categories, cart
// and account. From 768 px the search pill follows the name and categories, account and cart (with
// the server's item count) appear after it. The language switch moved to the footer. The search is a
// plain GET form to /search, so it works without JavaScript; SearchCombobox adds suggestions.
// Below 768 px the search is an icon just before the bell that expands over the row (HeaderSearch).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HeaderSearch } from "@/components/shell/HeaderSearch";
import { formatCount, type MoneyFormat } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import { shellPaths } from "@/lib/routes";

export async function SiteHeader({ locale, storeName, cartCount = 0, format }: { locale: Locale; storeName: string | null; cartCount?: number; format: MoneyFormat }) {
  const t = await getTranslations({ locale, namespace: "shell" });
  const count = formatCount(cartCount, format);
  const action = localeHref(locale, shellPaths.search);

  return (
    <header id="site-header" className="site-header">
      <div className="site-header-inner">
        <Link href={localeHref(locale, shellPaths.home)} className="wordmark font-display" prefetch={false}>
          {storeName ?? t("wordmarkUnconfigured")}
        </Link>
        <HeaderSearch
          action={action}
          locale={locale}
          openLabel={t("search.open")}
          closeLabel={t("search.close")}
          labels={{
            label: t("search.label"),
            placeholder: t("search.placeholder"),
            submit: t("search.submit"),
            clear: t("search.clear"),
            suggestions: t("search.suggestions"),
            products: t("search.products"),
            history: t("search.history"),
            clearHistory: t("search.clearHistory"),
            removeHistory: t.raw("search.removeHistory") as string,
            category: t("search.category"),
            from: t("search.from"),
            options: t.raw("search.options") as string,
            outOfStock: t("search.outOfStock"),
            count: t.raw("search.count") as string,
            none: t("search.none"),
          }}
        />
        <nav aria-label={t("headerNavLabel")} className="header-actions">
          <Link href={localeHref(locale, shellPaths.categories)} className="nav-link header-action header-action-wide" prefetch={false}>
            {t("categories")}
          </Link>
          <Link href={localeHref(locale, shellPaths.account)} className="nav-link header-action header-action-wide" prefetch={false}>
            {t("account")}
          </Link>
          <Link href={localeHref(locale, shellPaths.cart)} className="nav-link header-action header-action-wide header-cart" prefetch={false} aria-label={cartCount > 0 ? t("cartCount", { count }) : undefined}>
            {t("cart")}
            {cartCount > 0 ? (
              <span className="count-badge" aria-hidden="true">
                {count}
              </span>
            ) : null}
          </Link>
          {/* The bell opens the existing browser-notification settings (B9). The notification feed
              itself (Proposal 04c) waits for owner approval of Q6–Q8. */}
          <Link href={localeHref(locale, "/account/notifications")} className="header-icon header-bell" prefetch={false} aria-label={t("bell")}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16zM10 20.5a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  );
}
