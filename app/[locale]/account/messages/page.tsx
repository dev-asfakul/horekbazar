// /account/messages (B9; noindex; signed-in customer). The customer's conversations with the store
// and a form to start a new one, optionally about one of their orders (?order=ORD-… pre-fills it).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { startConversationAction } from "@/lib/actions/engagement";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { customerConversations } from "@/lib/modules/messaging/messaging";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/messages">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.messages" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountMessagesPage({ params, searchParams }: PageProps<"/[locale]/account/messages">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/messages");
  const db = identity.identity.db;
  const t = await getTranslations({ locale, namespace: "account.messages" });
  const order = (await searchParams).order;
  const orderNumber = typeof order === "string" && /^[A-Z0-9-]{4,40}$/.test(order) ? order : "";
  const [conversations, messages] = await Promise.all([customerConversations(db, principal.user.id), formMessages(locale)]);
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <AccountFrame locale={locale} current="messages" title={t("title")} staff={principal.role !== null}>
      <p className="field-hint">{t("intro")}</p>
      <section className="account-section" aria-labelledby="new-conversation">
        <h2 id="new-conversation" className="account-section-title">
          {t("new")}
        </h2>
        <ActionForm
          action={startConversationAction}
          testId="new-conversation"
          hidden={{ clientKey: randomUUID(), locale }}
          fields={[
            { name: "subject", label: t("subject"), required: true, maxLength: 120 },
            { name: "orderNumber", label: t("orderNumber"), hint: t("orderNumberHint"), maxLength: 40, defaultValue: orderNumber },
            { name: "body", label: t("body"), type: "textarea", rows: 4, required: true, maxLength: 2000 },
          ]}
          messages={messages}
          submitLabel={t("send")}
          pendingLabel={t("sending")}
        />
      </section>
      <section className="account-section" aria-labelledby="conversations">
        <h2 id="conversations" className="account-section-title">
          {t("list")}
        </h2>
        {conversations.length === 0 ? (
          <p className="listing-empty-title" data-testid="conversations-empty">
            {t("empty")}
          </p>
        ) : (
          <ul className="cart-lines" data-testid="conversation-list">
            {conversations.map((c) => (
              <li key={String(c._id)} className="cart-line" data-testid="conversation-row">
                <p className="cart-line-name">
                  <Link href={localeHref(locale, `/account/messages/${String(c._id)}`)}>{c.subject}</Link>{" "}
                  {c.unreadByCustomer > 0 ? <span className="cart-chip">{t("unread", { count: c.unreadByCustomer })}</span> : null}
                  {c.status === "closed" ? <span className="cart-chip">{t("closed")}</span> : null}
                </p>
                <p className="cart-line-variant">
                  {c.orderNumber ? <span lang="en">{c.orderNumber} · </span> : null}
                  {date.format(c.lastMessageAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AccountFrame>
  );
}
