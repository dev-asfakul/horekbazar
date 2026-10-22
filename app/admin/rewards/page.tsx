// /admin/rewards (B9, rewards.write). The loyalty points switch and rules (settings.write, checked by
// the action), and a customer's balance, history and staff adjustments (reason + Idempotency-Key).
// Rewards stay off for a BD production store until legal review (domain-rules §5.7).
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { adjustRewardsAction, rewardSettingsAction } from "@/lib/actions/admin-engagement";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { AUTH_COLLECTIONS } from "@/lib/modules/identity/schema";
import { rewardSummary } from "@/lib/modules/rewards/rewards";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.engagement" });
  return { title: t("rewardsTitle"), robots: { index: false, follow: false } };
}

export default async function AdminRewardsPage({ searchParams }: PageProps<"/admin/rewards">) {
  const { locale, db, messages, principal } = await adminPage("/admin/rewards");
  const t = await getTranslations({ locale, namespace: "admin.engagement" });
  const email = (searchParam((await searchParams).email) ?? "").trim().toLowerCase().slice(0, 200);
  const settings = await getSettings(db);
  const canSettings = principal.role?.capabilities.has("settings.write") ?? false;
  const customer = email ? await db.collection<{ _id: unknown; name?: string; email: string }>(AUTH_COLLECTIONS.user).findOne({ email }, { projection: { name: 1, email: 1 } }) : null;
  const userId = customer ? String(customer._id) : null;
  const summary = userId ? await rewardSummary(db, userId) : null;
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-rewards">
      <h1 className="font-display admin-title">{t("rewardsTitle")}</h1>
      <p className="admin-intro">{t("rewardsIntro")}</p>
      <p className="admin-notice">{t("rewardsLegal")}</p>
      {canSettings ? (
        <section className="admin-section" aria-labelledby="rewards-rules">
          <h2 id="rewards-rules" className="admin-section-title">
            {t("rewardsRules")}
          </h2>
          <ActionForm
            action={rewardSettingsAction}
            testId="reward-settings"
            hidden={{ version: String(settings.version) }}
            layout="grid"
            fields={[
              { name: "enabled", label: t("rewardsEnabled"), type: "checkbox", defaultValue: settings.features.rewards ? "on" : "" },
              { name: "pointsPer100Taka", label: t("pointsPer100Taka"), hint: t("pointsPer100TakaHint"), inputMode: "numeric", required: true, defaultValue: String(settings.rewards?.pointsPer100Taka ?? 1) },
              { name: "expiryDays", label: t("expiryDays"), hint: t("expiryDaysHint"), inputMode: "numeric", required: true, defaultValue: String(settings.rewards?.expiryDays ?? 365) },
            ]}
            messages={messages}
            submitLabel={t("save")}
            pendingLabel={t("save")}
          />
        </section>
      ) : null}
      <section className="admin-section" aria-labelledby="rewards-customer">
        <h2 id="rewards-customer" className="admin-section-title">
          {t("rewardsCustomer")}
        </h2>
        <form className="cart-zone admin-filter" method="get" action="/admin/rewards">
          <label className="field-label" htmlFor="rewards-email">
            {t("customerEmail")}
          </label>
          <input id="rewards-email" name="email" type="email" className="field-input" defaultValue={email} autoComplete="off" />
          <button type="submit" className="btn btn-secondary">
            {t("find")}
          </button>
        </form>
        {email && !summary ? <p className="admin-empty-title" data-testid="rewards-no-customer">{t("noCustomer")}</p> : null}
        {summary && userId ? (
          <>
            <p data-testid="rewards-balance">
              {customer?.name ?? email}: <strong className="num">{t("points", { count: count(summary.balance) })}</strong>
            </p>
            <ActionForm
              action={adjustRewardsAction}
              testId="rewards-adjust"
              hidden={{ userId, idempotencyKey: randomUUID() }}
              fields={[
                { name: "points", label: t("adjustPoints"), hint: t("adjustPointsHint"), inputMode: "numeric", required: true },
                { name: "reason", label: t("adjustReason"), required: true, maxLength: 300 },
              ]}
              messages={messages}
              submitLabel={t("adjust")}
              pendingLabel={t("adjust")}
            />
            {summary.entries.length === 0 ? (
              <p className="record-sub">{t("noEntries")}</p>
            ) : (
              <ul className="staff-rows">
                {summary.entries.map((e) => (
                  <li key={String(e._id)} className="staff-row" data-testid="reward-entry">
                    <p className="record-chips">
                      <strong className="num">{e.points > 0 ? `+${count(e.points)}` : `−${count(-e.points)}`}</strong>
                      <span className="record-sub">{t(`rewardKinds.${e.kind}`)}</span>
                      <span className="record-sub">{date.format(e.createdAt)}</span>
                      {e.note ? <span className="record-sub">{e.note}</span> : null}
                      {e.expiresAt ? <span className="record-sub">{t("expires", { date: date.format(e.expiresAt) })}</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
