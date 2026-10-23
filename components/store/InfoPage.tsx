// Tier: build. Use-when: the B10 information and legal pages (/about, /contact, /faq, /terms,
// /privacy-policy, /delivery-policy, /return-policy). Avoid-when: catalogue listings (ListingView).
// Reduced-motion: no motion. Touch: links only.
// Legal and store text comes from the owner; until it is supplied the page says so with [NEEDS COPY]
// (BUILD-PLAN §11, B10) instead of inventing commitments.
import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Icon, type IconName } from "@/components/ui/Icon";
import { localeHref } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import { shellPaths } from "@/lib/routes";

const HELP_PAGES = [
  ["about", shellPaths.about, "store"],
  ["contact", shellPaths.contact, "phone"],
  ["faq", shellPaths.faq, "help"],
  ["delivery", shellPaths.delivery, "truck"],
  ["returns", shellPaths.returns, "returns"],
  ["terms", shellPaths.terms, "doc"],
  ["privacy", shellPaths.privacy, "lock"],
] as const satisfies readonly (readonly [string, string, IconName])[];

export async function InfoPage({ page, title, children }: { page: string; title: string; children?: ReactNode }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations({ locale, namespace: "shell.footer" });
  // Redesign: the text sits in a card; the seven help pages are listed beside it (below it on phones).
  return (
    <div className="info-layout">
      <article className="listing info-page" data-testid={`info-${page}`} aria-labelledby="info-title">
        <header className="listing-head">
          <h1 id="info-title" className="font-display listing-title">
            {title}
          </h1>
        </header>
        <div className="info-body">{children}</div>
      </article>
      <nav className="info-nav" aria-labelledby="info-nav-title">
        <h2 id="info-nav-title" className="info-nav-title">
          {t("helpLabel")}
        </h2>
        <ul>
          {HELP_PAGES.map(([key, path, icon]) => (
            <li key={key}>
              <Link href={localeHref(locale, path)} className="info-nav-link" aria-current={key === page ? "page" : undefined} prefetch={false}>
                <Icon name={icon} size={20} />
                <span>{t(key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** The marker for text the owner has not supplied yet. */
export async function NeedsCopy({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "store.info" });
  return (
    <p className="needs-copy" data-needs-copy="">
      {t("needsCopy")}
    </p>
  );
}
