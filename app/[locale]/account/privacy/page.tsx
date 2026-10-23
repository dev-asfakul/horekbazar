// /account/privacy (B10 part b; noindex; signed-in customer). Download a copy of your own data, or ask
// the store to delete your account. Both need the password again (or a sign-in within 15 minutes for
// accounts without a password). The deletion copy says only what the code does: the request is
// recorded and nothing is erased automatically. What the store then deletes or keeps is owner/legal
// copy that does not exist yet, so it is marked [NEEDS COPY].
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { cancelDeletionAction, prepareExportAction, requestDeletionAction } from "@/lib/actions/privacy";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formatDateTime } from "@/lib/format/datetime";
import { formMessages } from "@/lib/i18n/form-messages";
import { isLocale } from "@/lib/i18n/locales";
import { AUTH_COLLECTIONS } from "@/lib/modules/identity/schema";
import { customerPrivacyRequests, openDeletionRequest } from "@/lib/modules/identity/privacy";
import { idFilter } from "@/lib/modules/identity/principal";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/privacy">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.privacy" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function AccountPrivacyPage({ params, searchParams }: PageProps<"/[locale]/account/privacy">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/privacy");
  const db = identity.identity.db;
  const t = await getTranslations({ locale, namespace: "account.privacy" });
  const messages = await formMessages(locale);
  const sp = await searchParams;
  const exportParam = typeof sp.export === "string" ? sp.export : "";
  const exportToken = UUID.test(exportParam) ? exportParam : null;
  const [hasPassword, open, history] = await Promise.all([
    db
      .collection(AUTH_COLLECTIONS.account)
      .findOne({ userId: idFilter(principal.user.id), providerId: "credential" }, { projection: { _id: 1 } })
      .then(Boolean),
    openDeletionRequest(db, principal.user.id),
    customerPrivacyRequests(db, principal.user.id),
  ]);
  const passwordField = hasPassword
    ? [{ name: "password", label: t("password"), type: "password" as const, autoComplete: "current-password", hint: t("passwordHint"), required: true }]
    : [];
  const hidden = { locale };

  return (
    <AccountFrame locale={locale} current="privacy" title={t("title")} staff={principal.role !== null}>
      <p className="field-hint">{t("intro")}</p>
      {!hasPassword ? <p className="field-hint">{t("noPasswordHint")}</p> : null}

      <section aria-labelledby="privacy-export" data-testid="privacy-export">
        <h2 id="privacy-export" className="account-section-title">
          {t("export.title")}
        </h2>
        <p className="field-hint">{t("export.body")}</p>
        {exportToken ? (
          <div className="admin-flash" role="status" data-testid="privacy-export-ready">
            <p>{t("export.ready")}</p>
            <a className="btn btn-primary" href={`/api/account/export?t=${exportToken}&l=${locale}`} download data-testid="privacy-download">
              {t("export.download")}
            </a>
          </div>
        ) : null}
        {exportParam === "invalid" ? (
          <p className="field-error" role="alert" data-testid="privacy-export-invalid">
            {t("export.invalid")}
          </p>
        ) : null}
        <ActionForm action={prepareExportAction} testId="privacy-export-form" fields={passwordField} hidden={hidden} messages={messages} submitLabel={t("export.submit")} pendingLabel={t("working")} />
      </section>

      <section aria-labelledby="privacy-deletion" data-testid="privacy-deletion">
        <h2 id="privacy-deletion" className="account-section-title">
          {t("deletion.title")}
        </h2>
        <p className="field-hint">{t("deletion.body")}</p>
        <p className="field-hint" data-testid="privacy-retention">
          {t("deletion.retention")}
        </p>
        {open ? (
          <>
            <p role="status" data-testid="privacy-deletion-open">
              {t("deletion.open", { date: formatDateTime(open.createdAt, locale) })}
            </p>
            <ActionForm action={cancelDeletionAction} testId="privacy-deletion-cancel" fields={[]} messages={messages} submitLabel={t("deletion.cancel")} pendingLabel={t("working")} variant="secondary" />
          </>
        ) : (
          <ActionForm
            action={requestDeletionAction}
            testId="privacy-deletion-form"
            fields={[...passwordField, { name: "confirm", label: t("deletion.confirm"), type: "checkbox", required: true }]}
            hidden={hidden}
            messages={messages}
            submitLabel={t("deletion.submit")}
            pendingLabel={t("working")}
            variant="danger"
          />
        )}
      </section>

      <section aria-labelledby="privacy-history">
        <h2 id="privacy-history" className="account-section-title">
          {t("history.title")}
        </h2>
        {history.length === 0 ? (
          <p className="field-hint">{t("history.empty")}</p>
        ) : (
          <ul className="staff-rows" data-testid="privacy-history">
            {history.map((r) => (
              <li key={String(r._id)} className="staff-row">
                <p className="staff-name">{t(`history.${r.kind}_${r.status}` as "history.export_ready")}</p>
                <p className="record-sub">{formatDateTime(r.createdAt, locale)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountFrame>
  );
}
