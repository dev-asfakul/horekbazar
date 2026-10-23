// /register (B3; noindex). Requires e-mail delivery, because every account verifies its e-mail (D13, sec-04).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AuthFrame } from "@/components/identity/AuthFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { signUpAction } from "@/lib/actions/identity";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/register">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "auth.register" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function RegisterPage({ params }: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  if (await getPrincipal()) redirect(localeHref(locale, "/account"));
  const t = await getTranslations({ locale, namespace: "auth" });
  const m = await formMessages(locale);
  return (
    <AuthFrame
      icon="user"
      title={t("register.title")}
      intro={<p>{t("register.description")}</p>}
      aside={
        <p>
          {t("register.haveAccount")}{" "}
          <Link className="prose-link" href={localeHref(locale, "/login")}>
            {t("register.login")}
          </Link>
        </p>
      }
    >
      {identity.identity.emailEnabled ? (
        <ActionForm
          action={signUpAction}
          hidden={{ locale }}
          fields={[
            { name: "name", label: t("name"), autoComplete: "name", required: true },
            { name: "email", label: t("email"), type: "email", autoComplete: "email", required: true },
            { name: "password", label: t("password"), type: "password", autoComplete: "new-password", hint: t("passwordHint"), required: true },
            { name: "passwordConfirm", label: t("passwordConfirm"), type: "password", autoComplete: "new-password", required: true },
          ]}
          submitLabel={t("register.submit")}
          pendingLabel={t("register.pending")}
          messages={m}
          hideOnSuccess
          testId="register-form"
        />
      ) : (
        <p className="admin-notice" data-testid="register-email-off">
          {t("register.emailOff")}
        </p>
      )}
    </AuthFrame>
  );
}
