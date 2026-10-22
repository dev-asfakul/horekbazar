// /admin/setup (B3, decision D23 option a). Creates the first Owner exactly once. Public by necessity
// (no owner exists yet), so it is protected by the deployer's SETUP_TOKEN, rate limiting, and a unique
// installation claim; once an owner exists it only says so. Shows variable names, never values.
import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { setupOwnerAction } from "@/lib/actions/admin";
import { emailConfig } from "@/lib/adapters/email/resend";
import { getAdminLocale, getIdentity, identityBlockers } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { ownerExists } from "@/lib/modules/identity/staff";

type Blocker = "database" | "auth_secret" | "site_url" | "email" | "setup_token";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.setup" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminSetupPage() {
  const locale = await getAdminLocale();
  const t = await getTranslations({ locale, namespace: "admin.setup" });
  const result = await getIdentity();
  const blockers: Blocker[] = result.ok ? [] : await identityBlockers();
  if (!emailConfig(process.env)) blockers.push("email");
  if ((process.env.SETUP_TOKEN?.trim().length ?? 0) < 16) blockers.push("setup_token");

  if (result.ok && (await ownerExists(result.identity.db))) {
    return (
      <div className="admin-page" data-testid="setup-done">
        <h1 className="font-display admin-title">{t("title")}</h1>
        <p>{t("done")}</p>
        <p>
          <Link className="prose-link" href="/login?next=/admin">
            {t("login")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      {blockers.length > 0 ? (
        <section className="admin-section" aria-labelledby="setup-blocked" data-testid="setup-blockers">
          <h2 id="setup-blocked" className="admin-section-title">
            {t("blocked")}
          </h2>
          <ul className="admin-list">
            {blockers.map((b) => (
              <li key={b} data-blocker={b}>
                {t(`blocker.${b}`)}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="admin-section">
          <p className="field-hint">{t("steps")}</p>
          <ActionForm
            action={setupOwnerAction}
            testId="setup-form"
            hideOnSuccess
            messages={await formMessages(locale)}
            submitLabel={t("submit")}
            pendingLabel={t("pending")}
            fields={[
              { name: "name", label: t("name"), autoComplete: "name", required: true },
              { name: "email", label: t("email"), type: "email", autoComplete: "email", required: true },
              { name: "password", label: t("password"), type: "password", autoComplete: "new-password", required: true, hint: t("passwordHint") },
              { name: "passwordConfirm", label: t("passwordConfirm"), type: "password", autoComplete: "new-password", required: true },
              { name: "setupToken", label: t("setupToken"), type: "password", autoComplete: "off", required: true, hint: t("setupTokenHint") },
            ]}
            footer={
              <p>
                <Link className="prose-link" href="/login?next=/admin">
                  {t("login")}
                </Link>
              </p>
            }
          />
        </section>
      )}
    </div>
  );
}
