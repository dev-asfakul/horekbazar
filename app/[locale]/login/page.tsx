// /login (B3; noindex). Step 1: e-mail and password (and Google when configured). Step 2 (?step=2fa):
// authenticator code or a backup code. `next` is restricted to same-site paths (safeNext).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AuthFrame } from "@/components/identity/AuthFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { resendVerificationAction, signInAction, signInWithGoogleAction, verifyTwoFactorAction } from "@/lib/actions/identity";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { safeNext } from "@/lib/modules/identity/paths";

export async function generateMetadata({ params }: PageProps<"/[locale]/login">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("title"), description: t("description"), robots: { index: false, follow: false } };
}

export default async function LoginPage({ params, searchParams }: PageProps<"/[locale]/login">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeNext(one(query.next), localeHref(locale, "/account"));
  const step = one(query.step) === "2fa" ? "2fa" : "password";
  const backup = one(query.mode) === "backup";
  const error = one(query.error);

  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  if (step === "password" && (await getPrincipal())) redirect(next);

  const t = await getTranslations({ locale, namespace: "auth" });
  const m = await formMessages(locale);
  const hidden = { locale, next };

  if (step === "2fa") {
    const twoFactorHref = (mode?: string) => `${localeHref(locale, "/login")}?step=2fa${mode ? `&mode=${mode}` : ""}&next=${encodeURIComponent(next)}`;
    return (
      <AuthFrame
        title={t("twoFactor.title")}
        intro={<p>{backup ? t("twoFactor.backupBody") : t("twoFactor.body")}</p>}
        aside={
          <ul className="auth-links">
            <li>
              <Link className="prose-link" href={backup ? twoFactorHref() : twoFactorHref("backup")}>
                {backup ? t("twoFactor.useApp") : t("twoFactor.useBackup")}
              </Link>
            </li>
            <li>
              <Link className="prose-link" href={`${localeHref(locale, "/login")}?next=${encodeURIComponent(next)}`}>
                {t("twoFactor.restart")}
              </Link>
            </li>
          </ul>
        }
      >
        <ActionForm
          action={verifyTwoFactorAction}
          hidden={{ ...hidden, mode: backup ? "backup" : "totp" }}
          fields={[backup ? { name: "code", label: t("twoFactor.backupCode"), type: "otp", autoComplete: "off", required: true } : { name: "code", label: t("twoFactor.code"), type: "otp", autoComplete: "one-time-code", required: true }]}
          submitLabel={t("twoFactor.submit")}
          pendingLabel={t("twoFactor.pending")}
          messages={m}
          testId="two-factor-form"
        />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={t("login.title")}
      aside={
        <ul className="auth-links">
          <li>
            <Link className="prose-link" href={localeHref(locale, "/forgot-password")}>
              {t("login.forgot")}
            </Link>
          </li>
          <li>
            {t("login.noAccount")}{" "}
            <Link className="prose-link" href={localeHref(locale, "/register")}>
              {t("login.register")}
            </Link>
          </li>
        </ul>
      }
    >
      {error === "google_unavailable" || error === "google_failed" || error === "rate_limited" ? (
        <p role="alert" className="form-summary form-summary-static">
          {error === "rate_limited" ? m.errors.rate_limited : error === "google_failed" ? t("login.googleFailed") : t("login.googleUnavailable")}
        </p>
      ) : null}
      <ActionForm
        action={signInAction}
        hidden={hidden}
        fields={[
          { name: "email", label: t("email"), type: "email", autoComplete: "email", required: true },
          { name: "password", label: t("password"), type: "password", autoComplete: "current-password", required: true },
        ]}
        submitLabel={t("login.submit")}
        pendingLabel={t("login.pending")}
        messages={m}
        testId="login-form"
      />
      {identity.identity.googleEnabled ? (
        <form action={signInWithGoogleAction} className="auth-alt">
          <p className="auth-or">{t("login.or")}</p>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn btn-secondary auth-alt-button">
            {t("login.google")}
          </button>
        </form>
      ) : null}
      {identity.identity.emailEnabled ? (
        <details className="auth-details">
          <summary>{t("login.resendTitle")}</summary>
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
        </details>
      ) : null}
    </AuthFrame>
  );
}
