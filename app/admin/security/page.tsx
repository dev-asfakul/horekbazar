// /admin/security (B3): the signed-in staff member's own two-step verification, password and devices.
// Reachable while 2FA enrolment is pending (the only admin page that is), so a required role can enrol.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SecurityPanels } from "@/components/identity/SecurityPanels";
import { ActionForm } from "@/components/forms/ActionForm";
import { stepUpAction } from "@/lib/actions/identity";
import { gateStaffPage, getAdminLocale, getIdentity } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { decideStaffShell } from "@/lib/modules/identity/principal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.security" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminSecurityPage() {
  const locale = await getAdminLocale();
  const principal = await gateStaffPage("/admin/security");
  const identity = await getIdentity();
  if (!identity.ok) return null; // unreachable: a principal implies a working identity
  const t = await getTranslations({ locale, namespace: "admin.security" });
  if (decideStaffShell(principal).result === "second_factor") {
    // Signed in without the second factor (e.g. with Google): the code is required before anything else.
    const s = await getTranslations({ locale, namespace: "admin.staff" });
    return (
      <div className="admin-page" data-testid="admin-second-factor">
        <h1 className="font-display admin-title">{t("secondFactorTitle")}</h1>
        <p className="admin-intro">{t("secondFactorBody")}</p>
        <ActionForm
          action={stepUpAction}
          testId="second-factor-form"
          messages={await formMessages(locale)}
          submitLabel={s("stepUpSubmit")}
          pendingLabel={s("stepUpPending")}
          fields={[{ name: "code", label: s("stepUpCode"), type: "otp", autoComplete: "one-time-code", inputMode: "numeric", required: true }]}
        />
      </div>
    );
  }
  return (
    <div className="admin-page" data-testid="admin-security">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <SecurityPanels locale={locale} principal={principal} identity={identity.identity} />
    </div>
  );
}
