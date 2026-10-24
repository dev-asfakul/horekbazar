// /verify-email?token=… (B3; noindex, no referrer). The page verifies the token on the server and
// reports the real result; repeating it is harmless (the token is a signed, expiring JWT).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AuthFrame } from "@/components/identity/AuthFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { resendVerificationAction } from "@/lib/actions/identity";
import { getIdentity } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";

export async function generateMetadata({ params }: PageProps<"/[locale]/verify-email">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "auth.verify" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function VerifyEmailPage({ params, searchParams }: PageProps<"/[locale]/verify-email">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw.slice(0, 2000) : "";
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const t = await getTranslations({ locale, namespace: "auth" });
  let result: "ok" | "failed" | "missing" = "missing";
  if (token) {
    result = await identity.identity.auth.api
      .verifyEmail({ query: { token } })
      .then(() => "ok" as const)
      .catch(() => "failed" as const);
  }
  const m = await formMessages(locale);
  return (
    <AuthFrame icon="mail" title={t("verify.title")}>
      <p role="status" className={result === "ok" ? "form-success" : "admin-notice"} data-result={result}>
        {t(`verify.${result}`)}
      </p>
      {result === "ok" ? (
        <p className="auth-next">
          <Link className="btn btn-primary" href={localeHref(locale, "/login")}>
            {t("verify.login")}
          </Link>
        </p>
      ) : identity.identity.emailEnabled ? (
        <section className="auth-section" aria-labelledby="resend-title">
          <h2 id="resend-title" className="auth-section-title">
            {t("verify.resendTitle")}
          </h2>
          <ActionForm
            action={resendVerificationAction}
            hidden={{ locale }}
            fields={[{ name: "email", label: t("email"), type: "email", autoComplete: "email", required: true }]}
            submitLabel={t("login.resendSubmit")}
            pendingLabel={t("login.resendPending")}
            messages={m}
            variant="secondary"
            hideOnSuccess
          />
        </section>
      ) : null}
    </AuthFrame>
  );
}
