// /admin/returns (B8, returns.process). Customer return requests, newest first, by status.
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { RETURN_STATUSES, RETURNS, type ReturnDoc } from "@/lib/modules/fulfilment/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.fulfilment" });
  return { title: t("returnsTitle"), robots: { index: false, follow: false } };
}

const DONE = new Set(["refunded", "credited", "rejected", "closed"]);

export default async function AdminReturnsPage({ searchParams }: PageProps<"/admin/returns">) {
  const { locale, db } = await adminPage("/admin/returns");
  const t = await getTranslations({ locale, namespace: "admin.fulfilment" });
  const wanted = searchParam((await searchParams).status);
  const status = RETURN_STATUSES.find((s) => s === wanted);
  const returns = await db
    .collection<ReturnDoc>(RETURNS)
    .find(status ? { status } : {}, { projection: { orderNumber: 1, status: 1, lines: 1, requestedAt: 1 } })
    .sort({ requestedAt: -1 })
    .limit(200)
    .toArray();
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-returns">
      <h1 className="font-display admin-title">{t("returnsTitle")}</h1>
      <p className="admin-intro">{t("returnsIntro")}</p>
      <form className="cart-zone admin-filter" method="get" action="/admin/returns">
        <label className="field-label" htmlFor="return-status-filter">
          {t("filterStatus")}
        </label>
        <select id="return-status-filter" name="status" className="field-input" defaultValue={status ?? ""}>
          <option value="">{t("filterAll")}</option>
          {RETURN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`returnStatuses.${s}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          {t("filterApply")}
        </button>
      </form>
      <section className="admin-section" aria-labelledby="returns-list">
        <h2 id="returns-list" className="admin-section-title">
          {t("returnsTitle")} ({count(returns.length)})
        </h2>
        {returns.length === 0 ? (
          <div className="admin-empty" data-testid="returns-empty">
            <p className="admin-empty-title">{status ? t("returnsEmptyFiltered") : t("returnsEmpty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {returns.map((r) => (
              <li key={String(r._id)} className="staff-row" data-testid="return-row" data-status={r.status}>
                <p className="staff-name">
                  <Link href={`/admin/returns/${String(r._id)}`}>{r.orderNumber}</Link>
                </p>
                <p className="record-chips">
                  <StatusChip tone={DONE.has(r.status) ? "archived" : r.status === "requested" ? "draft" : "published"} label={t(`returnStatuses.${r.status}`)} />
                  <span className="record-sub">
                    {t("colItems")}: {count(r.lines.reduce((a, l) => a + l.qty, 0))}
                  </span>
                  <span className="record-sub">{date.format(r.requestedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
