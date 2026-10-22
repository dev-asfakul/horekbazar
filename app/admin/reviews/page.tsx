// /admin/reviews (B9, reviews.moderate). Customer reviews waiting for moderation, newest first.
// Publish, reject with a reason the author sees, or reply to a published review.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm } from "@/components/forms/ActionForm";
import { moderateReviewAction } from "@/lib/actions/admin-engagement";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { PRODUCTS } from "@/lib/modules/catalogue/schema";
import { listReviewsForStaff } from "@/lib/modules/reviews/reviews";
import { REVIEW_STATUSES } from "@/lib/modules/reviews/schema";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.engagement" });
  return { title: t("reviewsTitle"), robots: { index: false, follow: false } };
}

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const { locale, db, messages } = await adminPage("/admin/reviews");
  const t = await getTranslations({ locale, namespace: "admin.engagement" });
  const wanted = searchParam((await searchParams).status) ?? "pending";
  const status = REVIEW_STATUSES.find((s) => s === wanted);
  const [{ items }, settings] = await Promise.all([listReviewsForStaff(db, status ? { status } : {}, 50), getSettings(db)]);
  const products = new Map(
    (await db.collection(PRODUCTS).find({ _id: { $in: items.map((r) => r.productId) } }, { projection: { name: 1, slug: 1 } }).toArray()).map((p) => [String(p._id), p as unknown as { name: { bn: string; en?: string }; slug: string }]),
  );
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-reviews">
      <h1 className="font-display admin-title">{t("reviewsTitle")}</h1>
      <p className="admin-intro">{t("reviewsIntro")}</p>
      {!settings.features.reviews ? <p className="admin-notice" data-testid="reviews-off">{t("reviewsOff")}</p> : null}
      <form className="cart-zone admin-filter" method="get" action="/admin/reviews">
        <label className="field-label" htmlFor="review-status-filter">
          {t("filterStatus")}
        </label>
        <select id="review-status-filter" name="status" className="field-input" defaultValue={status ?? "all"}>
          <option value="all">{t("filterAll")}</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`reviewStatuses.${s}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          {t("filterApply")}
        </button>
      </form>
      <section className="admin-section" aria-labelledby="reviews-list">
        <h2 id="reviews-list" className="admin-section-title">
          {t("reviewsTitle")} ({count(items.length)})
        </h2>
        {items.length === 0 ? (
          <div className="admin-empty" data-testid="reviews-empty">
            <p className="admin-empty-title">{t("reviewsEmpty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {items.map((r) => {
              const p = products.get(String(r.productId));
              const hidden = { reviewId: String(r._id), version: String(r.version) };
              return (
                <li key={String(r._id)} className="staff-row" data-testid="review-row" data-status={r.status}>
                  <p className="staff-name">{p ? (locale === "en" && p.name.en ? p.name.en : p.name.bn) : t("productGone")}</p>
                  <p className="record-chips">
                    <StatusChip tone={r.status === "published" ? "published" : r.status === "pending" ? "draft" : "archived"} label={t(`reviewStatuses.${r.status}`)} />
                    <span className="record-sub">{t("ratingOf", { rating: r.rating })}</span>
                    <span className="record-sub">{r.authorName}</span>
                    <span className="record-sub">{date.format(r.createdAt)}</span>
                  </p>
                  {r.title ? <p className="review-title">{r.title}</p> : null}
                  <p className="review-body">{r.body}</p>
                  {r.rejectionReason ? <p className="record-sub">{t("rejectedBecause", { reason: r.rejectionReason })}</p> : null}
                  {r.reply ? <p className="record-sub">{t("storeReply")}: {r.reply.body}</p> : null}
                  <div className="admin-actions">
                    {r.status !== "published" ? (
                      <ActionForm action={moderateReviewAction} testId="review-publish" hidden={{ ...hidden, kind: "publish" }} fields={[]} messages={messages} submitLabel={t("publish")} pendingLabel={t("publish")} layout="inline" />
                    ) : null}
                    {r.status !== "rejected" ? (
                      <ActionForm action={moderateReviewAction} testId="review-reject" hidden={{ ...hidden, kind: "reject" }} fields={[{ name: "text", label: t("rejectReason"), hint: t("rejectReasonHint"), required: true, maxLength: 300 }]} messages={messages} submitLabel={t("reject")} pendingLabel={t("reject")} variant="danger" />
                    ) : null}
                    {r.status === "published" ? (
                      <ActionForm action={moderateReviewAction} testId="review-reply" hidden={{ ...hidden, kind: "reply" }} fields={[{ name: "text", label: t("replyLabel"), type: "textarea", rows: 3, required: true, maxLength: 1000, ...(r.reply ? { defaultValue: r.reply.body } : {}) }]} messages={messages} submitLabel={t("reply")} pendingLabel={t("reply")} variant="secondary" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
