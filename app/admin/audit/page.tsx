// /admin/audit (B10, platform.read). The append-only audit log, newest first, filtered from the URL.
// Read only: there is no action on this page. Before/after values were redacted when written and are
// redacted again here (audit-query.ts), so a viewer never sees phone numbers, e-mails or secrets.
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pager } from "@/components/admin/RecordBits";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { AUDIT_MAX_PAGE, AUDIT_PAGE_SIZE, auditQueryString, listAuditLog, parseAuditFilters, type AuditRow } from "@/lib/modules/platform/audit-query";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.audit" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Dhaka" });

function Changes({ row, labels }: { row: AuditRow; labels: { changes: string; before: string; after: string; none: string } }) {
  if (!row.before && !row.after) return <span className="record-sub">{labels.none}</span>;
  return (
    <details className="audit-diff">
      <summary>{labels.changes}</summary>
      {row.before ? (
        <>
          <p className="field-label">{labels.before}</p>
          <pre>{JSON.stringify(row.before, null, 2)}</pre>
        </>
      ) : null}
      {row.after ? (
        <>
          <p className="field-label">{labels.after}</p>
          <pre>{JSON.stringify(row.after, null, 2)}</pre>
        </>
      ) : null}
    </details>
  );
}

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const { locale, db } = await adminPage("/admin/audit");
  const t = await getTranslations({ locale, namespace: "admin.audit" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const sp = await searchParams;
  const filters = parseAuditFilters(sp);
  const filtered = Object.keys(filters).length > 0;
  const { rows, total, page, pages, capped } = await listAuditLog(db, filters, Number(searchParam(sp.page)) || 1);
  const hrefFor = (p: number) => `/admin/audit${auditQueryString(filters, p)}`;

  return (
    <div className="admin-page" data-testid="admin-audit">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>

      <form className="admin-filters" role="search" action="/admin/audit" method="get" aria-label={t("filters")}>
        <div className="field">
          <label className="field-label" htmlFor="a-action">
            {t("action")}
          </label>
          <input id="a-action" name="action" className="field-input" defaultValue={filters.action ?? ""} maxLength={100} aria-describedby="a-action-hint" />
          <p id="a-action-hint" className="field-hint">
            {t("actionHint")}
          </p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="a-actor">
            {t("actor")}
          </label>
          <input id="a-actor" name="actor" className="field-input" defaultValue={filters.actorId ?? ""} maxLength={200} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="a-type">
            {t("type")}
          </label>
          <input id="a-type" name="type" className="field-input" defaultValue={filters.targetType ?? ""} maxLength={50} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="a-target">
            {t("target")}
          </label>
          <input id="a-target" name="target" className="field-input" defaultValue={filters.targetId ?? ""} maxLength={200} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="a-from">
            {t("from")}
          </label>
          <input id="a-from" name="from" type="date" className="field-input" defaultValue={filters.from ?? ""} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="a-to">
            {t("to")}
          </label>
          <input id="a-to" name="to" type="date" className="field-input" defaultValue={filters.to ?? ""} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-secondary">
            {t("apply")}
          </button>
          {filtered ? (
            <Link className="prose-link" href="/admin/audit">
              {t("clear")}
            </Link>
          ) : null}
        </div>
      </form>

      <section className="admin-section" aria-labelledby="audit-list">
        <h2 id="audit-list" className="admin-section-title">
          {t("listTitle", { count: count(total) })}
        </h2>
        {capped ? <p className="field-hint">{t("listCapped", { count: count(AUDIT_PAGE_SIZE * AUDIT_MAX_PAGE) })}</p> : null}
        {rows.length === 0 ? (
          <div className="admin-empty" data-testid="audit-empty">
            <p className="admin-empty-title">{filtered ? t("empty") : t("emptyAll")}</p>
          </div>
        ) : (
          <>
            <ul className="staff-rows" data-testid="audit-rows">
              {rows.map((row) => (
                <li key={row.id} className="staff-row" data-testid="audit-row" data-action={row.action}>
                  <p className="staff-name">
                    <code>{row.action}</code>
                  </p>
                  <p className="record-chips">
                    <span className="record-sub">
                      {t("when")}: <time dateTime={row.at.toISOString()}>{date.format(row.at)}</time>
                    </span>
                    <span className="record-sub">
                      {t("who")}:{" "}
                      <Link className="prose-link" href={`/admin/audit${auditQueryString({ actorId: row.actor.id })}`}>
                        {row.actor.id}
                      </Link>{" "}
                      ({row.actor.role})
                    </span>
                    <span className="record-sub">
                      {t("on")}:{" "}
                      <Link className="prose-link" href={`/admin/audit${auditQueryString({ targetType: row.target.type, targetId: row.target.id })}`}>
                        {row.target.type} {row.target.id}
                      </Link>
                    </span>
                    {row.ip ? (
                      <span className="record-sub">
                        {t("ip")}: {row.ip}
                      </span>
                    ) : null}
                  </p>
                  <Changes row={row} labels={{ changes: t("changes"), before: t("before"), after: t("after"), none: t("noChanges") }} />
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
