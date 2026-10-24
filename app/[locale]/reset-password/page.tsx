// /reset-password?token=… (B3; noindex, no referrer: the token is in the URL). Reset revokes every session.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AuthFrame } from "@/components/identity/AuthFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { resetPasswordAction } from "@/lib/actions/identity";
import { getIdentity } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/reset-password">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "auth.reset" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ params, searchParams }: PageProps<"/[locale]/reset-password">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw.slice(0, 500) : "";
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const t = await getTranslations({ locale, namespace: "auth" });
  const m = await formMessages(locale);
  return (
    <AuthFrame
      icon="key"
      title={t("reset.title")}
      aside={
        <ul className="auth-links">
          <li>
            <Link className="prose-link" href={localeHref(locale, "/login")}>
              {t("reset.login")}
            </Link>
          </li>
          <li>
            <Link className="prose-link" href={localeHref(locale, "/forgot-password")}>
              {t("reset.requestNew")}
            </Link>
          </li>
        </ul>
      }
    >
      {token ? (
        <ActionForm
          action={resetPasswordAction}
          hidden={{ token, locale }}
          fields={[
            { name: "password", label: t("reset.newPassword"), type: "password", autoComplete: "new-password", hint: t("passwordHint"), required: true },
            { name: "passwordConfirm", label: t("passwordConfirm"), type: "password", autoComplete: "new-password", required: true },
          ]}
          submitLabel={t("reset.submit")}
          pendingLabel={t("reset.pending")}
          messages={m}
          hideOnSuccess
          testId="reset-form"
        />
      ) : (
        <p className="admin-notice">{t("reset.missing")}</p>
      )}
    </AuthFrame>
  );
}
