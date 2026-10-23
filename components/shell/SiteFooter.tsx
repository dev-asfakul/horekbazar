// Tier: build (contract). Use-when: every storefront page, once, from the locale layout. Avoid-when: admin.
// Reduced-motion: no motion. Touch: links at least 44 px tall.
// Footer (DESIGN.md → Layout → Footer). Redesign: a detailed footer in five groups — the store
// (name, COD statement, contact), ক্যাটাগরি, শপিং, অ্যাকাউন্ট and সাহায্য — then the delivery
// charges, the theme and language switches and a copyright line.
// Everything shown comes from the store: contact details only when saved in settings (B4; otherwise
// the footer says they are coming), categories from the published tree, charges from the enabled
// delivery zones. Every link goes to a page that exists. No social links (settings have none), no
// payment logos (D15), no invented hotline or address.
import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitch, LocaleSwitchFallback } from "@/components/shell/LocaleSwitch";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { formatMoney, toBengaliDigits } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import { categoryPath } from "@/lib/modules/storefront/catalogue";
import { shellPaths } from "@/lib/routes";
import { loadStore, moneyFormat, shown, shownLang } from "@/lib/storefront/context";

/** Top-level categories listed in the footer; the rest are behind "সব ক্যাটাগরি". */
const FOOTER_CATEGORY_LIMIT = 6;

type FooterLink = { key: string; href: string; label: string; lang?: string };

function LinkGroup({ id, title, links }: { id: string; title: string; links: FooterLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav className="footer-group" aria-labelledby={id}>
      <h2 id={id} className="footer-h">
        {title}
      </h2>
      <ul className="footer-list">
        {links.map((l) => (
          <li key={l.key}>
            <Link href={l.href} className="footer-link" prefetch={false} lang={l.lang}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "shell.footer" });
  const shell = await getTranslations({ locale, namespace: "shell" });
  const store = await loadStore();
  const other: Locale = locale === "bn" ? "en" : "bn";
  const switchProps = { target: other, label: shell("localeSwitch.label"), ariaLabel: shell("localeSwitch.ariaLabel") };
  const href = (path: string) => localeHref(locale, path);

  const storeName = (store.ready ? shown(store.settings.store.name, locale) : "") || shell("wordmarkUnconfigured");
  const contact = store.ready ? store.settings.store.contact : {};
  const format = store.ready ? moneyFormat(store, locale) : { numerals: locale === "bn" ? ("bengali" as const) : ("latin" as const), grouping: "south_asian" as const };
  const zones = store.ready ? store.settings.delivery.zones.filter((z) => z.enabled) : [];
  const roots = store.ready ? store.tree.roots : [];

  const categories: FooterLink[] = roots.slice(0, FOOTER_CATEGORY_LIMIT).map((c) => ({ key: c.id, href: href(categoryPath(c)), label: shown(c.name, locale), lang: shownLang(c.name, locale) }));
  if (roots.length > 0) categories.push({ key: "all", href: href(shellPaths.categories), label: t("allCategories") });
  const shopping: FooterLink[] = [
    { key: "new", href: href("/new"), label: t("new") },
    { key: "deals", href: href("/deals"), label: t("deals") },
    { key: "search", href: href(shellPaths.search), label: t("search") },
    { key: "cart", href: href(shellPaths.cart), label: t("cart") },
  ];
  const account: FooterLink[] = [
    { key: "account", href: href(shellPaths.account), label: t("account") },
    { key: "orders", href: href("/account/orders"), label: t("orders") },
    { key: "notifications", href: href("/account/notifications"), label: t("notifications") },
  ];
  const help: FooterLink[] = (
    [
      ["about", shellPaths.about],
      ["contact", shellPaths.contact],
      ["faq", shellPaths.faq],
      ["delivery", shellPaths.delivery],
      ["returns", shellPaths.returns],
      ["terms", shellPaths.terms],
      ["privacy", shellPaths.privacy],
    ] as const
  ).map(([key, path]) => ({ key, href: href(path), label: t(key) }));

  const hasContact = Boolean(contact.phone || contact.email || contact.address || contact.hours);
  // A year is never digit-grouped (২০২৬, not ২,০২৬).
  const yearDigits = String(new Date().getFullYear());
  const year = format.numerals === "bengali" ? toBengaliDigits(yearDigits) : yearDigits;

  return (
    <footer id="site-footer" className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-top">
          <section className="footer-brand" aria-labelledby="footer-store">
            <h2 id="footer-store" className="footer-wordmark">
              {storeName}
            </h2>
            <p className="footer-payment">{t("payment")}</p>
            {hasContact ? (
              <ul className="footer-contact-list" data-testid="footer-contact">
                {contact.phone ? (
                  <li>
                    <span className="footer-contact-label">{t("phone")}</span>
                    <a href={`tel:+88${contact.phone}`} className="footer-link">
                      {contact.phone}
                    </a>
                  </li>
                ) : null}
                {contact.email ? (
                  <li>
                    <span className="footer-contact-label">{t("email")}</span>
                    <a href={`mailto:${contact.email}`} className="footer-link">
                      {contact.email}
                    </a>
                  </li>
                ) : null}
                {contact.address ? (
                  <li>
                    <span className="footer-contact-label">{t("address")}</span>
                    <span lang={shownLang(contact.address, locale)}>{shown(contact.address, locale)}</span>
                  </li>
                ) : null}
                {contact.hours ? (
                  <li>
                    <span className="footer-contact-label">{t("hours")}</span>
                    <span lang={shownLang(contact.hours, locale)}>{shown(contact.hours, locale)}</span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="footer-contact">{t("contactPending")}</p>
            )}
          </section>
          <LinkGroup id="footer-cats" title={t("categoriesLabel")} links={categories} />
          <LinkGroup id="footer-shop" title={t("shopLabel")} links={shopping} />
          <LinkGroup id="footer-account" title={t("accountLabel")} links={account} />
          <LinkGroup id="footer-help" title={t("helpLabel")} links={help} />
        </div>

        {zones.length > 0 ? (
          <section className="footer-delivery" aria-labelledby="footer-delivery" data-testid="footer-delivery">
            <h2 id="footer-delivery" className="footer-h">
              {t("deliveryCharges")}
            </h2>
            <ul className="footer-zones">
              {zones.map((z) => (
                <li key={z.id}>
                  <span className="footer-zone-name" lang={shownLang(z.name, locale)}>
                    {shown(z.name, locale)}
                  </span>
                  <span className="footer-zone-fee">{formatMoney(z.fee.amountMinor, format)}</span>
                  <span className="footer-zone-note" lang={shownLang(z.estimate, locale)}>
                    {shown(z.estimate, locale)}
                    {z.freeThreshold ? ` · ${t("freeOver", { amount: formatMoney(z.freeThreshold.amountMinor, format) })}` : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="footer-prefs">
          <ThemeSwitch label={shell("theme.label")} labels={{ auto: shell("theme.auto"), light: shell("theme.light"), dark: shell("theme.dark") }} hint={shell("theme.hint")} />
          <Suspense fallback={<LocaleSwitchFallback {...switchProps} currentPath="/" />}>
            <LocaleSwitch {...switchProps} />
          </Suspense>
        </div>
        <p className="footer-copy">{t("copyright", { year, name: storeName })}</p>
      </div>
    </footer>
  );
}
