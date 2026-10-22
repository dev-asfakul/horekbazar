// /admin/notifications (B9 part 2, campaigns.send). Browser-notification campaigns to customers who
// ticked "offers and news" (never anyone else), each draft sent once, with delivery counts; and the
// order e-mail log (masked addresses) for staff who can read customers. Configuration is shown by
// variable name only, never by value.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { createCampaignAction, deleteCampaignAction, sendCampaignAction } from "@/lib/actions/admin-notifications";
import { pushConfig } from "@/lib/adapters/push/webpush";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { integrationVariables, parseServerEnv } from "@/lib/env";
import { campaignDelivery, listCampaigns, marketingAudience, recentEmails } from "@/lib/modules/notifications/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.notifications" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminNotificationsPage({ searchParams }: PageProps<"/admin/notifications">) {
  const { locale, db, messages, principal } = await adminPage("/admin/notifications");
  const t = await getTranslations({ locale, namespace: "admin.notifications" });
  const pushReady = pushConfig() !== null;
  const emailReady = parseServerEnv(process.env).integrations.email === "configured";
  const canReadCustomers = principal.role?.capabilities.has("customers.read") ?? false;
  const email = canReadCustomers ? (searchParam((await searchParams).email) ?? "").trim().toLowerCase().slice(0, 200) : "";
  const [audience, campaigns, emails] = await Promise.all([marketingAudience(db), listCampaigns(db), canReadCustomers ? recentEmails(db, email ? { email } : {}) : Promise.resolve([])]);
  const drafts = campaigns.filter((c) => c.status === "draft");
  const sent = campaigns.filter((c) => c.status !== "draft");
  const delivery = new Map(await Promise.all(sent.map(async (c) => [String(c._id), await campaignDelivery(db, String(c._id))] as const)));
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const pick = (v: { bn: string; en?: string | undefined }) => (locale === "bn" ? v.bn : v.en) || v.bn || v.en;

  return (
    <div className="admin-page" data-testid="admin-notifications">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <ul className="staff-rows" data-testid="notify-config">
        <li className="staff-row">
          <p className="record-chips">
            <strong>{t("push")}</strong>
            <span className="record-sub">{pushReady ? t("configured") : t("notConfigured", { names: integrationVariables.push.join(", ") })}</span>
          </p>
        </li>
        <li className="staff-row">
          <p className="record-chips">
            <strong>{t("email")}</strong>
            <span className="record-sub">{emailReady ? t("configured") : t("notConfigured", { names: integrationVariables.email.join(", ") })}</span>
          </p>
        </li>
      </ul>

      <section className="admin-section" aria-labelledby="notify-new">
        <h2 id="notify-new" className="admin-section-title">
          {t("newCampaign")}
        </h2>
        <p className="admin-notice" data-testid="notify-audience">
          {t("audience", { count: audience, n: count(audience) })}
        </p>
        <ActionForm
          action={createCampaignAction}
          testId="campaign-create"
          layout="grid"
          fields={[
            { name: "titleBn", label: t("titleBn"), required: true, maxLength: 60 },
            { name: "titleEn", label: t("titleEn"), maxLength: 60 },
            { name: "bodyBn", label: t("bodyBn"), type: "textarea", rows: 3, required: true, maxLength: 160 },
            { name: "bodyEn", label: t("bodyEn"), type: "textarea", rows: 3, maxLength: 160 },
            { name: "url", label: t("url"), hint: t("urlHint"), defaultValue: "/", wide: true, maxLength: 300 },
          ]}
          messages={messages}
          submitLabel={t("saveDraft")}
          pendingLabel={t("saveDraft")}
        />
      </section>

      <section className="admin-section" aria-labelledby="notify-drafts">
        <h2 id="notify-drafts" className="admin-section-title">
          {t("drafts")}
        </h2>
        {drafts.length === 0 ? (
          <p className="record-sub">{t("noDrafts")}</p>
        ) : (
          <ul className="staff-rows">
            {drafts.map((c) => {
              const hidden = { id: String(c._id), version: String(c.version) };
              return (
                <li key={String(c._id)} className="staff-row" data-testid="campaign-draft">
                  <p className="record-chips">
                    <strong>{pick(c.title)}</strong>
                    <span className="record-sub">{c.url}</span>
                    <span className="record-sub">{date.format(c.createdAt)}</span>
                  </p>
                  <p className="record-sub">{pick(c.body)}</p>
                  {pushReady ? (
                    <ActionForm action={sendCampaignAction} testId="campaign-send" hidden={hidden} fields={[]} messages={messages} submitLabel={t("send", { count: audience, n: count(audience) })} pendingLabel={t("sending")} />
                  ) : (
                    <p className="record-sub">{t("sendNeedsPush")}</p>
                  )}
                  <ActionForm action={deleteCampaignAction} testId="campaign-delete" hidden={hidden} fields={[]} messages={messages} submitLabel={t("delete")} pendingLabel={t("delete")} variant="secondary" />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="admin-section" aria-labelledby="notify-sent">
        <h2 id="notify-sent" className="admin-section-title">
          {t("sent")}
        </h2>
        {sent.length === 0 ? (
          <p className="record-sub">{t("noSent")}</p>
        ) : (
          <ul className="staff-rows">
            {sent.map((c) => {
              const d = delivery.get(String(c._id));
              return (
                <li key={String(c._id)} className="staff-row" data-testid="campaign-sent">
                  <p className="record-chips">
                    <strong>{pick(c.title)}</strong>
                    {c.sentAt ? <span className="record-sub">{date.format(c.sentAt)}</span> : null}
                    <span className="record-sub">{t("recipients", { n: count(c.recipients ?? 0) })}</span>
                  </p>
                  {d ? (
                    <p className="record-sub" data-testid="campaign-delivery">
                      {t("delivery", { accepted: count(d.accepted), removed: count(d.removed), waiting: count(d.waiting), failed: count(d.failed) })}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canReadCustomers ? (
        <section className="admin-section" aria-labelledby="notify-emails">
          <h2 id="notify-emails" className="admin-section-title">
            {t("emails")}
          </h2>
          <p className="admin-intro">{t("emailsIntro")}</p>
          <form className="cart-zone admin-filter" method="get" action="/admin/notifications">
            <label className="field-label" htmlFor="notify-email-filter">
              {t("customerEmail")}
            </label>
            <input id="notify-email-filter" name="email" type="email" className="field-input" defaultValue={email} autoComplete="off" />
            <button type="submit" className="btn btn-secondary">
              {t("find")}
            </button>
          </form>
          {emails.length === 0 ? (
            <p className="record-sub" data-testid="emails-empty">
              {t("noEmails")}
            </p>
          ) : (
            <ul className="staff-rows">
              {emails.map((e) => (
                <li key={String(e._id)} className="staff-row" data-testid="email-log-row">
                  <p className="record-chips">
                    <strong>{e.toMasked}</strong>
                    <span className="record-sub">{e.template}</span>
                    <span className="record-sub">{t(`emailStatus.${e.status}`)}</span>
                    <span className="record-sub">{t("attempts", { n: count(e.attempts) })}</span>
                    <span className="record-sub">{date.format(e.updatedAt)}</span>
                  </p>
                  {e.error ? <p className="record-sub">{e.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
