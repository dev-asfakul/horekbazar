// Tier: build. Use-when: the B10 information and legal pages (/about, /contact, /faq, /terms,
// /privacy-policy, /delivery-policy, /return-policy). Avoid-when: catalogue listings (ListingView).
// Reduced-motion: no motion. Touch: links only.
// Legal and store text comes from the owner; until it is supplied the page says so with [NEEDS COPY]
// (BUILD-PLAN §11, B10) instead of inventing commitments.
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/i18n/locales";

export async function InfoPage({ page, title, children }: { page: string; title: string; children?: ReactNode }) {
  return (
    <article className="listing info-page" data-testid={`info-${page}`} aria-labelledby="info-title">
      <header className="listing-head">
        <h1 id="info-title" className="font-display listing-title">
          {title}
        </h1>
      </header>
      <div className="info-body">{children}</div>
    </article>
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
