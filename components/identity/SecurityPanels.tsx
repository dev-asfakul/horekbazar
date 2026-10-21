// Tier: build. Use-when: /account/security and /admin/security. Avoid-when: other pages.
// Reduced-motion: no motion. Touch: 44 px controls.
// Password, two-step verification and signed-in devices for the signed-in principal. Server component;
// the forms are ActionForm client islands.
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { TwoFactorEnrol } from "@/components/identity/TwoFactorEnrol";
import { changePasswordAction, disableTwoFactorAction, revokeOtherSessionsAction, revokeSessionAction } from "@/lib/actions/identity";
import type { Identity } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { formatDateTime } from "@/lib/format/datetime";
import { idFilter, type Principal } from "@/lib/modules/identity/principal";
import { AUTH_COLLECTIONS } from "@/lib/modules/identity/schema";

function device(userAgent: unknown): string | null {
  if (typeof userAgent !== "string" || !userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : null;
  const os = /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : null;
  return [browser, os].filter(Boolean).join(" · ") || null;
}

export async function SecurityPanels({ locale, principal, identity }: { locale: "bn" | "en"; principal: Principal; identity: Identity }) {
  const t = await getTranslations({ locale, namespace: "account.security" });
  const m = await formMessages(locale);
  const [credential, sessions] = await Promise.all([
    identity.db.collection(AUTH_COLLECTIONS.account).findOne({ userId: idFilter(principal.user.id), providerId: "credential" }, { projection: { _id: 1 } }),
    identity.db
      .collection(AUTH_COLLECTIONS.session)
      .find({ userId: idFilter(principal.user.id), expiresAt: { $gt: new Date() } }, { projection: { token: 1, userAgent: 1, createdAt: 1 }, sort: { createdAt: -1 }, limit: 20 })
      .toArray(),
  ]);
  const required = principal.role?.twoFactorRequired === true;
  const strings = {
    enablePassword: t("enablePassword"),
    enableSubmit: t("enableSubmit"),
    enablePending: t("enablePending"),
    secretLabel: t("secretLabel"),
    secretHint: t("secretHint"),
    openApp: t("openApp"),
    backupTitle: t("backupTitle"),
    backupBody: t("backupBody"),
    confirmCode: t("confirmCode"),
    confirmSubmit: t("confirmSubmit"),
    confirmPending: t("confirmPending"),
  };
  return (
    <>
      <section className="account-section" aria-labelledby="two-factor-title" data-testid="two-factor-section" data-enabled={principal.user.twoFactorEnabled}>
        <h2 id="two-factor-title" className="account-section-title">
          {t("twoFactorTitle")}
        </h2>
        {required && !principal.user.twoFactorEnabled ? <p className="admin-notice">{t("twoFactorRequired")}</p> : null}
        <p>{principal.user.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}</p>
        {principal.user.twoFactorEnabled ? (
          required ? null : (
            <ActionForm
              action={disableTwoFactorAction}
              fields={[{ name: "password", label: t("disablePassword"), type: "password", autoComplete: "current-password", required: true }]}
              submitLabel={t("disableSubmit")}
              pendingLabel={t("disablePending")}
              messages={m}
              variant="danger"
            />
          )
        ) : credential ? (
          <TwoFactorEnrol strings={strings} messages={m} />
        ) : (
          <p className="field-hint">{t("noPassword")}</p>
        )}
      </section>
      <section className="account-section" aria-labelledby="password-title">
        <h2 id="password-title" className="account-section-title">
          {t("passwordTitle")}
        </h2>
        {credential ? (
          <ActionForm
            action={changePasswordAction}
            fields={[
              { name: "currentPassword", label: t("currentPassword"), type: "password", autoComplete: "current-password", required: true },
              { name: "newPassword", label: t("newPassword"), type: "password", autoComplete: "new-password", required: true },
            ]}
            submitLabel={t("passwordSubmit")}
            pendingLabel={t("passwordPending")}
            messages={m}
            testId="password-form"
          />
        ) : (
          <p>{t("noPassword")}</p>
        )}
      </section>
      <section className="account-section" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="account-section-title">
          {t("sessionsTitle")}
        </h2>
        <ul className="session-rows" data-testid="session-rows">
          {sessions.map((s) => {
            const current = s.token === principal.session.token;
            return (
              <li key={String(s._id)} className="session-row">
                <div>
                  <p className="session-device">
                    {device(s.userAgent) ?? t("unknownDevice")}
                    {current ? <span className="session-current"> · {t("thisDevice")}</span> : null}
                  </p>
                  <p className="field-hint">{t("started", { date: formatDateTime(s.createdAt as Date, locale) })}</p>
                </div>
                {current ? null : (
                  <ActionForm action={revokeSessionAction} hidden={{ sessionId: String(s._id) }} fields={[]} submitLabel={t("revoke")} pendingLabel={t("revokePending")} messages={m} variant="secondary" />
                )}
              </li>
            );
          })}
        </ul>
        {sessions.length > 1 ? (
          <ActionForm action={revokeOtherSessionsAction} fields={[]} submitLabel={t("revokeOthers")} pendingLabel={t("revokeOthersPending")} messages={m} variant="secondary" />
        ) : null}
      </section>
    </>
  );
}
