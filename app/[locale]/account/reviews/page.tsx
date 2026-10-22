// /account/reviews (B9; noindex; signed-in customer). Products the customer received, a form to
// review each order line once, and the status of their reviews (waiting, published, or not published + reason).
// Shown only while the store has reviews on.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { submitReviewAction } from "@/lib/actions/engagement";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { customerReviews, reviewableLines } from "@/lib/modules/reviews/reviews";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/reviews">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.reviews" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountReviewsPage({ params }: PageProps<"/[locale]/account/reviews">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/reviews");
  const db = identity.identity.db;
  const settings = await getSettings(db);
  if (!settings.features.reviews) notFound();
  const t = await getTranslations({ locale, namespace: "account.reviews" });
  const [lines, mine, messages] = await Promise.all([reviewableLines(db, principal.user.id), customerReviews(db, principal.user.id), formMessages(locale)]);
  const byLine = new Map(mine.map((r) => [`${String(r.orderId)}:${r.lineId}`, r]));
  const name = (n: { bn: string; en?: string | undefined }) => (locale === "en" && n.en ? n.en : n.bn);
  const ratingOptions = [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: t("stars", { count: n }) }));

  return (
    <AccountFrame locale={locale} current="reviews" title={t("title")} staff={principal.role !== null}>
      <p className="field-hint">{t("intro")}</p>
      {lines.length === 0 ? (
        <p className="listing-empty-title" data-testid="reviews-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="review-list" data-testid="reviewable">
          {lines.map((l) => {
            const r = byLine.get(`${l.orderId}:${l.lineId}`);
            return (
              <li key={`${l.orderId}:${l.lineId}`} className="review-item" data-testid="reviewable-line" data-reviewed={r ? r.status : undefined}>
                <p className="cart-line-name">
                  <Link href={localeHref(locale, `/p/${l.slug}`)}>{name(l.name)}</Link>
                </p>
                <p className="cart-line-variant" lang="en">
                  {l.orderNumber}
                </p>
                {r ? (
                  <>
                    <p className="rating-line">
                      <span className="cart-chip">{t(`statuses.${r.status}`)}</span>
                      <span>{t("stars", { count: r.rating })}</span>
                    </p>
                    {r.title ? <p className="review-title">{r.title}</p> : null}
                    <p className="review-body">{r.body}</p>
                    {r.status === "rejected" && r.rejectionReason ? <p className="field-hint">{t("rejectedBecause", { reason: r.rejectionReason })}</p> : null}
                    {r.reply ? <p className="review-reply">{t("storeReply")}: {r.reply.body}</p> : null}
                  </>
                ) : (
                  <ActionForm
                    action={submitReviewAction}
                    testId="review-form"
                    hidden={{ orderId: l.orderId, lineId: l.lineId }}
                    fields={[
                      { name: "rating", label: t("rating"), type: "select", required: true, options: ratingOptions, defaultValue: "5" },
                      { name: "title", label: t("reviewTitle"), maxLength: 120 },
                      { name: "body", label: t("body"), hint: t("bodyHint"), type: "textarea", rows: 4, required: true, maxLength: 2000 },
                    ]}
                    messages={messages}
                    submitLabel={t("submit")}
                    pendingLabel={t("submitting")}
                    hideOnSuccess
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </AccountFrame>
  );
}
