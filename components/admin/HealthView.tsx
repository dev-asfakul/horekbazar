// Tier: build (DESIGN.md → /admin/health; BUILD-PLAN §2 IntegrationStatus). Use-when: the read-only health page. Avoid-when: storefront states (SetupRequired).
// Reduced-motion: no motion. Touch: no controls (read-only in B2).
// Ruled khata rows, one per service: name, required/optional, state (text and a marker, never colour
// alone), reason and the variable names it reads. Outbox and job figures are a ruled ledger.
import { getTranslations } from "next-intl/server";
import { formatCount } from "@/lib/format/money";
import type { Locale } from "@/lib/i18n/locales";
import type { HealthReport, PortState } from "@/lib/platform/health";

const numerals = (locale: Locale) => ({ numerals: locale === "bn" ? "bengali" : "latin", grouping: "south_asian" }) as const;

function formatTime(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Dhaka" }).format(date);
}

function StateBadge({ state, label }: { state: PortState; label: string }) {
  return (
    <span className="health-state" data-state={state}>
      <span className="health-state-mark" aria-hidden="true" />
      {label}
    </span>
  );
}

export async function HealthView({ locale, report }: { locale: Locale; report: HealthReport }) {
  const t = await getTranslations({ locale, namespace: "admin.health" });
  const n = (value: number) => formatCount(value, numerals(locale));
  const minutes = (ms: number) => t("minutes", { count: n(Math.max(0, Math.round(ms / 60_000))) });
  const { jobs } = report;
  const outbox = jobs.outbox;
  const triggerKey = jobs.trigger === "vercel-cron" ? "vercelCron" : (jobs.trigger ?? "none");

  return (
    <div className="admin-page">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <p className="admin-meta">{t("checkedAt", { time: formatTime(report.checkedAt, locale) })}</p>

      <section id="ports" aria-labelledby="ports-title" className="admin-section">
        <h2 id="ports-title" className="admin-section-title">
          {t("portsHeading")}
        </h2>
        <ul className="health-rows">
          {report.ports.map((port) => (
            <li key={port.id} className="health-row" data-port={port.id} data-state={port.state}>
              <div className="health-row-head">
                <span className="health-name">{t(`ports.${port.id}` as "ports.database")}</span>
                <span className="health-need">{port.required ? t("required") : t("optional")}</span>
              </div>
              <StateBadge state={port.state} label={t(`states.${port.state}`)} />
              <p className="health-reason">
                {t(`reasons.${port.reason}` as "reasons.database_connected")}
                {port.checkedFrom && port.state === "configured" ? <span className="health-subtle"> {t("notCheckedLive")}</span> : null}
              </p>
              <p className="health-vars">
                <span className="sr-only">{t("variables")}: </span>
                {port.variables.map((v) => (
                  <code key={v} lang="en">
                    {v}
                  </code>
                ))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section id="outbox" aria-labelledby="outbox-title" className="admin-section">
        <h2 id="outbox-title" className="admin-section-title">
          {t("outboxHeading")}
        </h2>
        {outbox ? (
          <dl className="ledger">
            <div className="ledger-row">
              <dt>{t("pending")}</dt>
              <dd>{n(outbox.pending)}</dd>
            </div>
            <div className="ledger-row">
              <dt>{t("processing")}</dt>
              <dd>{n(outbox.processing)}</dd>
            </div>
            <div className="ledger-row" data-alert={outbox.dead > 0 || undefined}>
              <dt>{t("dead")}</dt>
              <dd>{n(outbox.dead)}</dd>
            </div>
            <div className="ledger-row">
              <dt>{t("oldest")}</dt>
              <dd>{outbox.oldestPendingAgeMs === null ? t("none") : minutes(outbox.oldestPendingAgeMs)}</dd>
            </div>
            <div className="ledger-row">
              <dt>{t("lastDrain")}</dt>
              <dd>{outbox.lastSuccessAt ? formatTime(outbox.lastSuccessAt, locale) : t("never")}</dd>
            </div>
            <div className="ledger-row">
              <dt>{t("lastRun")}</dt>
              <dd>{outbox.lastRunAt ? formatTime(outbox.lastRunAt, locale) : t("never")}</dd>
            </div>
          </dl>
        ) : (
          <p className="health-reason">{t("outboxUnavailable")}</p>
        )}
      </section>
      <section id="jobs" aria-labelledby="jobs-title" className="admin-section">
        <h2 id="jobs-title" className="admin-section-title">
          {t("jobsHeading")}
        </h2>
        <div className="health-row" data-state={jobs.state}>
          <div className="health-row-head">
            <span className="health-name">
              {t("trigger")}: {t(`triggerValues.${triggerKey}`)}
            </span>
          </div>
          <StateBadge state={jobs.state} label={t(`states.${jobs.state}`)} />
          <p className="health-reason">{t(`reasons.${jobs.reason}` as "reasons.jobs_ok", { minutes: n(Math.round(jobs.staleAfterMs / 60_000)) })}</p>
          <p className="health-vars">
            <code lang="en">JOBS_TRIGGER</code>
            <code lang="en">CRON_SECRET</code>
          </p>
        </div>
      </section>

    </div>
  );
}
