// /admin/staff (B3, domain-rules §1). Needs staff.manage; every change additionally needs a step-up
// code within 10 minutes, checked again by each server action. Last-owner protection and session
// revocation live in setStaffRole (lib/modules/identity/staff.ts).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { assignStaffRoleAction, changeStaffRoleAction, resetStaffTwoFactorAction } from "@/lib/actions/admin";
import { stepUpAction } from "@/lib/actions/identity";
import { gateStaffPage, getAdminLocale, getIdentity } from "@/lib/auth/server";
import { formatTime } from "@/lib/format/datetime";
import { formatCount } from "@/lib/format/money";
import { formMessages } from "@/lib/i18n/form-messages";
import { STEP_UP_WINDOW_MS } from "@/lib/modules/identity/capabilities";
import { decideAccess } from "@/lib/modules/identity/principal";
import { listRoles } from "@/lib/modules/identity/roles";
import { listStaff } from "@/lib/modules/identity/staff";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.staff" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminStaffPage() {
  const locale = await getAdminLocale();
  const principal = await gateStaffPage("/admin/staff");
  const identity = await getIdentity();
  if (!identity.ok) return null;
  const t = await getTranslations({ locale, namespace: "admin.staff" });
  const m = await formMessages(locale);
  const [staff, roles] = await Promise.all([listStaff(identity.identity.db), listRoles(identity.identity.db)]);
  const roleName = new Map(roles.map((r) => [r.key, (r.name[locale] ?? r.name.bn)]));
  const roleOptions = roles.map((r) => ({ value: r.key, label: (r.name[locale] ?? r.name.bn) }));
  const steppedUp = decideAccess(principal, "staff.manage", { mutation: true }).result === "allowed";
  const stepUpUntil = principal.session.stepUpAt ? new Date(principal.session.stepUpAt.getTime() + STEP_UP_WINDOW_MS) : null;

  return (
    <div className="admin-page" data-testid="admin-staff" data-stepped-up={steppedUp}>
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>

      <section className="admin-section" aria-labelledby="step-up-title">
        <h2 id="step-up-title" className="admin-section-title">
          {t("stepUpTitle")}
        </h2>
        {steppedUp && stepUpUntil ? (
          <p role="status">{t("stepUpActive", { time: formatTime(stepUpUntil, locale) })}</p>
        ) : (
          <>
            <p>{t("stepUpBody")}</p>
            <ActionForm
              action={stepUpAction}
              testId="step-up-form"
              messages={m}
              submitLabel={t("stepUpSubmit")}
              pendingLabel={t("stepUpPending")}
              fields={[{ name: "code", label: t("stepUpCode"), type: "otp", autoComplete: "one-time-code", inputMode: "numeric", required: true }]}
            />
          </>
        )}
      </section>

      <section className="admin-section" aria-labelledby="staff-list-title">
        <h2 id="staff-list-title" className="admin-section-title">
          {t("listTitle")}
        </h2>
        {staff.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <ul className="staff-rows" data-testid="staff-rows">
            {staff.map((s) => {
              const self = s.id === principal.user.id;
              return (
                <li key={s.id} className="staff-row" data-email={s.email}>
                  <div className="staff-row-head">
                    <p className="staff-name">
                      {s.name || s.email}
                      {self ? <span className="health-subtle"> · {t("you")}</span> : null}
                    </p>
                    <p className="field-hint">
                      <span lang="en">{s.email}</span> · {t("current", { role: roleName.get(s.roleKey) ?? s.roleKey })} · {s.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}
                      {s.emailVerified ? null : <> · {t("unverified")}</>}
                    </p>
                  </div>
                  {self || !steppedUp ? null : (
                    <details className="staff-manage">
                      <summary>{t("change")}</summary>
                      <ActionForm
                        action={changeStaffRoleAction}
                        hidden={{ userId: s.id }}
                        messages={m}
                        submitLabel={t("changeSubmit")}
                        pendingLabel={t("changePending")}
                        fields={[{ name: "roleKey", label: t("role"), type: "select", defaultValue: s.roleKey, options: [...roleOptions, { value: "", label: t("roleSelectNone") }] }]}
                      />
                      {s.twoFactorEnabled ? (
                        <ActionForm action={resetStaffTwoFactorAction} hidden={{ userId: s.id }} messages={m} fields={[]} submitLabel={t("resetTwoFactor")} pendingLabel={t("resetPending")} variant="secondary" />
                      ) : null}
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {steppedUp ? (
        <section className="admin-section" aria-labelledby="staff-add-title">
          <h2 id="staff-add-title" className="admin-section-title">
            {t("addTitle")}
          </h2>
          <p className="field-hint">{t("addIntro")}</p>
          <ActionForm
            action={assignStaffRoleAction}
            testId="staff-add-form"
            messages={m}
            submitLabel={t("addSubmit")}
            pendingLabel={t("addPending")}
            fields={[
              { name: "email", label: t("email"), type: "email", autoComplete: "off", required: true },
              { name: "roleKey", label: t("role"), type: "select", required: true, options: roleOptions },
            ]}
          />
        </section>
      ) : null}

      <section className="admin-section" aria-labelledby="roles-title">
        <h2 id="roles-title" className="admin-section-title">
          {t("rolesTitle")}
        </h2>
        <ul className="health-rows">
          {roles.map((r) => (
            <li key={r.key} className="health-row" data-role={r.key}>
              <p className="health-name">{(r.name[locale] ?? r.name.bn)}</p>
              <p className="field-hint">
                {r.key === "owner" ? null : <>{t("capabilities", { count: formatCount(r.capabilities.length, { numerals: locale === "bn" ? "bengali" : "latin", grouping: "south_asian" }) })} · </>}
                {r.twoFactorRequired || r.key === "owner" ? t("twoFactorRequired") : null}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
