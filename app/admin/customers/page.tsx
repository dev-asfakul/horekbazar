// /admin/customers (B10, customers.read). Registered shoppers, newest first, with a literal search over
// name, e-mail and phone. Read only. Staff accounts are excluded (they are managed on /admin/staff).
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pager, StatusChip } from "@/components/admin/RecordBits";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { listCustomers, pendingDeletions } from "@/lib/modules/identity/customers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.customers" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" });

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/customers">) {
  const { locale, db } = await adminPage("/admin/customers");
  const t = await getTranslations({ locale, namespace: "admin.customers" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const sp = await searchParams;
  const q = searchParam(sp.q).trim().slice(0, 80);
  const [{ customers, total, page, pages }, deletions] = await Promise.all([listCustomers(db, q, Number(searchParam(sp.page)) || 1), pendingDeletions(db)]);
  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return `/admin/customers${s ? `?${s}` : ""}`;
  };

  return (
    <div className="admin-page" data-testid="admin-customers">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <form className="admin-filters" role="search" action="/admin/customers" method="get" aria-label={t("searchForm")}>
        <div className="field">
          <label className="field-label" htmlFor="cq">
            {t("search")}
          </label>
          <input id="cq" name="q" type="search" className="field-input" defaultValue={q} maxLength={80} placeholder={t("searchPlaceholder")} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-secondary">
            {t("apply")}
          </button>
          {q ? (
            <Link className="prose-link" href="/admin/customers">
              {t("clear")}
            </Link>
          ) : null}
        </div>
      </form>

      <section className="admin-section" aria-labelledby="customers-deletions" data-testid="customers-deletions">
        <h2 id="customers-deletions" className="admin-section-title">
          {t("deletionTitle")}
        </h2>
        <p className="field-hint">{t("deletionIntro")}</p>
        {deletions.length === 0 ? (
          <p className="field-hint">{t("deletionEmpty")}</p>
        ) : (
          <ul className="staff-rows">
            {deletions.map((d) => (
              <li key={d.userId} className="staff-row" data-testid="customer-deletion">
                <p className="staff-name">
                  <Link href={`/admin/customers/${d.userId}`}>{d.name || d.email}</Link>
                </p>
                <p className="record-chips">
                  <span className="record-sub">{d.email}</span>
                  <span className="record-sub">{t("deletionSince", { date: date.format(d.requestedAt) })}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section" aria-labelledby="customers-list">
        <h2 id="customers-list" className="admin-section-title">
          {t("listTitle", { count: count(total) })}
        </h2>
        {customers.length === 0 ? (
          <div className="admin-empty" data-testid="customers-empty">
            <p className="admin-empty-title">{q ? t("empty") : t("emptyAll")}</p>
          </div>
        ) : (
          <>
            <ul className="staff-rows">
              {customers.map((cu) => (
                <li key={cu.id} className="staff-row" data-testid="customer-row">
                  <p className="staff-name">
                    <Link href={`/admin/customers/${cu.id}`}>{cu.name || cu.email}</Link>
                  </p>
                  <p className="record-chips">
                    <StatusChip tone={cu.emailVerified ? "published" : "draft"} label={cu.emailVerified ? t("verified") : t("unverified")} />
                    <span className="record-sub">{cu.email}</span>
                    {cu.phone ? <span className="record-sub">{cu.phone}</span> : null}
                    <span className="record-sub">{t("orders", { count: cu.orders })}</span>
                    {cu.createdAt ? <span className="record-sub">{t("joined", { date: date.format(cu.createdAt) })}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
            <Pager page={page} pages={pages} hrefFor={hrefFor} labels={{ prev: c("prev"), next: c("next"), nav: c("pages"), status: c("pageOf", { page: count(page), pages: count(pages) }) }} />
          </>
        )}
      </section>
    </div>
  );
}
