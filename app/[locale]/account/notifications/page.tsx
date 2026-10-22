// /account/notifications (B9 part 2; noindex; signed-in customer). What the store sends and how to
// choose: order e-mails (part of the order, to the account address), and browser notifications on
// this browser with separate "order updates" and "offers and news" choices. The browser section is
// shown only when the store has push configured; offers are never on unless ticked.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { removeAllPushAction } from "@/lib/actions/notifications";
import { pushConfig } from "@/lib/adapters/push/webpush";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { isLocale } from "@/lib/i18n/locales";
import { customerSubscriptions } from "@/lib/modules/notifications/notifications";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/notifications">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.notifications" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountNotificationsPage({ params }: PageProps<"/[locale]/account/notifications">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/notifications");
  const t = await getTranslations({ locale, namespace: "account.notifications" });
  const config = pushConfig();
  const subs = config ? await customerSubscriptions(identity.identity.db, principal.user.id) : [];
  const nf = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB");
  const messages = await formMessages(locale);
  const labels = {
    unsupported: t("push.unsupported"),
    blocked: t("push.blocked"),
    off: t("push.off"),
    on: t("push.on"),
    orders: t("push.orders"),
    ordersHint: t("push.ordersHint"),
    marketing: t("push.marketing"),
    marketingHint: t("push.marketingHint"),
    turnOn: t("push.turnOn"),
    save: t("push.save"),
    turnOff: t("push.turnOff"),
    working: t("push.working"),
    saved: t("push.saved"),
    turnedOff: t("push.turnedOff"),
    errors: { ...messages.errors, not_available: t("push.notAvailable"), invalid: messages.errors.try_again ?? "" },
  };

  return (
    <AccountFrame locale={locale} current="notifications" title={t("title")} staff={principal.role !== null}>
      <section aria-labelledby="notify-email">
        <h2 id="notify-email" className="account-section-title">
          {t("email.title")}
        </h2>
        <p className="field-hint" data-testid="notify-email">
          {t("email.body", { email: principal.user.email })}
        </p>
      </section>
      <section aria-labelledby="notify-push">
        <h2 id="notify-push" className="account-section-title">
          {t("push.title")}
        </h2>
        {config ? (
          <>
            <PushOptIn vapidPublicKey={config.publicKey} locale={locale} initialTopics={subs[0]?.topics ?? null} labels={labels} />
            {subs.length > 0 ? (
              <>
                <p className="field-hint" data-testid="push-devices">
                  {t("push.devices", { count: subs.length, n: nf.format(subs.length) })}
                </p>
                <ActionForm action={removeAllPushAction} testId="push-all-off" fields={[]} messages={messages} submitLabel={t("push.allOff")} pendingLabel={t("push.working")} />
              </>
            ) : null}
          </>
        ) : (
          <p className="field-hint" data-testid="push-not-available">
            {t("push.notAvailable")}
          </p>
        )}
      </section>
    </AccountFrame>
  );
}
