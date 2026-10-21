// /account/profile (B3; noindex). Name, Bangladeshi mobile number (validated server-side), e-mail language.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { updateProfileAction } from "@/lib/actions/identity";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/profile">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.profile" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/account/profile">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/profile");
  const t = await getTranslations({ locale, namespace: "account.profile" });
  const m = await formMessages(locale);
  return (
    <AccountFrame locale={locale} current="profile" title={t("title")} staff={principal.role !== null}>
      <dl className="ledger account-ledger">
        <div className="ledger-row">
          <dt>{t("email")}</dt>
          <dd lang="en">{principal.user.email}</dd>
        </div>
      </dl>
      <p className="field-hint">{t("emailNote")}</p>
      <ActionForm
        action={updateProfileAction}
        fields={[
          { name: "name", label: t("name"), autoComplete: "name", required: true, defaultValue: principal.user.name },
          { name: "phone", label: t("phone"), type: "tel", inputMode: "tel", autoComplete: "tel-national", hint: t("phoneHint"), defaultValue: principal.user.phone ?? "" },
          {
            name: "language",
            label: t("language"),
            type: "select",
            defaultValue: principal.user.locale,
            options: [
              { value: "bn", label: "বাংলা" },
              { value: "en", label: "English" },
            ],
          },
        ]}
        submitLabel={t("submit")}
        pendingLabel={t("pending")}
        messages={m}
        testId="profile-form"
      />
    </AccountFrame>
  );
}
