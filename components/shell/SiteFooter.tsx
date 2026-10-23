// Tier: build (contract). Use-when: every storefront page, once, from the locale layout. Avoid-when: admin.
// Reduced-motion: no motion. Touch: links at least 44 px tall.
// Footer (DESIGN.md → Layout → Footer). Store contact, hotline, address and the complaint channel come
// from settings (B4); until then the footer says so instead of inventing them. The COD statement and
// the policy links are part of the contract. No payment logos (D15).
// Redesign: the theme choice (অটো · লাইট · ডার্ক) and the language switch live here now.
import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitch, LocaleSwitchFallback } from "@/components/shell/LocaleSwitch";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import { shellPaths } from "@/lib/routes";

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "shell.footer" });
  const shell = await getTranslations({ locale, namespace: "shell" });
  const other: Locale = locale === "bn" ? "en" : "bn";
  const switchProps = { target: other, label: shell("localeSwitch.label"), ariaLabel: shell("localeSwitch.ariaLabel") };
  const policies = [
    ["terms", shellPaths.terms],
    ["privacy", shellPaths.privacy],
    ["delivery", shellPaths.delivery],
    ["returns", shellPaths.returns],
  ] as const;
  const info = [
    ["about", shellPaths.about],
    ["contact", shellPaths.contact],
    ["faq", shellPaths.faq],
  ] as const;
  return (
    <footer id="site-footer" className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-payment">{t("payment")}</p>
        <p className="footer-contact">{t("contactPending")}</p>
        <nav aria-label={t("infoLabel")}>
          <ul className="footer-links">
            {info.map(([key, path]) => (
              <li key={key}>
                <Link href={localeHref(locale, path)} className="nav-link" prefetch={false}>
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t("policiesLabel")}>
          <ul className="footer-links">
            {policies.map(([key, path]) => (
              <li key={key}>
                <Link href={localeHref(locale, path)} className="nav-link" prefetch={false}>
                  {t(key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="footer-prefs">
          <ThemeSwitch label={shell("theme.label")} labels={{ auto: shell("theme.auto"), light: shell("theme.light"), dark: shell("theme.dark") }} hint={shell("theme.hint")} />
          <Suspense fallback={<LocaleSwitchFallback {...switchProps} currentPath="/" />}>
            <LocaleSwitch {...switchProps} />
          </Suspense>
        </div>
      </div>
    </footer>
  );
}
