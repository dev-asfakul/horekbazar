// /forgot-password (B3; noindex). Always answers the same way, whether or not the address has an account.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AuthFrame } from "@/components/identity/AuthFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { forgotPasswordAction } from "@/lib/actions/identity";
import { getIdentity } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/forgot-password">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "auth.forgot" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage({ params }: PageProps<"/[locale]/forgot-password">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const t = await getTranslations({ locale, namespace: "auth" });
  const m = await formMessages(locale);
  return (
    <AuthFrame
      title={t("forgot.title")}
      intro={<p>{t("forgot.body")}</p>}
      aside={
        <Link className="prose-link" href={localeHref(locale, "/login")}>
          {t("forgot.back")}
        </Link>
      }
    >
      <ActionForm
        action={forgotPasswordAction}
        hidden={{ locale }}
        fields={[{ name: "email", label: t("email"), type: "email", autoComplete: "email", required: true }]}
        submitLabel={t("forgot.submit")}
        pendingLabel={t("forgot.pending")}
        messages={m}
        hideOnSuccess
        testId="forgot-form"
      />
    </AuthFrame>
  );
}
