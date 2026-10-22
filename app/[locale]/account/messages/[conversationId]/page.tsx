// /account/messages/[conversationId] (B9; noindex; signed-in customer). One conversation and a reply
// box. Only the owner can open it (anyone else gets 404). The page refreshes itself while open.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { AutoRefresh } from "@/components/store/AutoRefresh";
import { postCustomerMessageAction } from "@/lib/actions/engagement";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { readConversation } from "@/lib/modules/messaging/messaging";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/messages/[conversationId]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.messages" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AccountConversationPage({ params }: PageProps<"/[locale]/account/messages/[conversationId]">) {
  const { locale, conversationId } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, `/account/messages/${conversationId}`);
  const db = identity.identity.db;
  const thread = /^[a-f0-9]{24}$/.test(conversationId) ? await readConversation(db, { from: "customer", userId: principal.user.id }, conversationId) : null;
  if (!thread) notFound();
  const t = await getTranslations({ locale, namespace: "account.messages" });
  const messages = await formMessages(locale);
  const c = thread.conversation;
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <AccountFrame locale={locale} current="messages" title={c.subject} staff={principal.role !== null}>
      <AutoRefresh seconds={20} />
      <p className="field-hint">
        <Link href={localeHref(locale, "/account/messages")}>{t("back")}</Link>
        {c.orderNumber ? (
          <>
            {" · "}
            <Link href={localeHref(locale, `/account/orders/${c.orderNumber}`)} lang="en">
              {c.orderNumber}
            </Link>
          </>
        ) : null}
      </p>
      <ol className="thread" data-testid="thread">
        {thread.messages.map((m) => (
          <li key={String(m._id)} className="thread-msg" data-from={m.from}>
            <span className="field-hint">
              {m.from === "staff" ? t("fromStore") : t("fromYou")} · <time dateTime={m.createdAt.toISOString()}>{date.format(m.createdAt)}</time>
            </span>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      {c.status === "closed" ? <p className="field-hint">{t("closedNote")}</p> : null}
      <ActionForm action={postCustomerMessageAction} testId="customer-reply" hidden={{ conversationId, clientKey: randomUUID() }} fields={[{ name: "body", label: t("reply"), type: "textarea", rows: 4, required: true, maxLength: 2000 }]} messages={messages} submitLabel={t("send")} pendingLabel={t("sending")} />
    </AccountFrame>
  );
}
