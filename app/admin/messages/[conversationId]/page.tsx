// /admin/messages/[conversationId] (B9, messages.reply). The thread, a reply box, close or reopen.
// Opening the page marks the customer's messages as read. The page refreshes itself while open.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { AutoRefresh } from "@/components/store/AutoRefresh";
import { conversationStatusAction, staffReplyAction } from "@/lib/actions/admin-engagement";
import { adminPage } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { readConversation } from "@/lib/modules/messaging/messaging";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.engagement" });
  return { title: t("messagesTitle"), robots: { index: false, follow: false } };
}

export default async function AdminConversationPage({ params }: PageProps<"/admin/messages/[conversationId]">) {
  const { conversationId } = await params;
  const { locale, db, messages } = await adminPage("/admin/messages", `/admin/messages/${conversationId}`);
  const t = await getTranslations({ locale, namespace: "admin.engagement" });
  const thread = /^[a-f0-9]{24}$/.test(conversationId) ? await readConversation(db, { from: "staff" }, conversationId) : null;
  if (!thread) notFound();
  const { conversation: c } = thread;
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-conversation">
      <AutoRefresh seconds={20} />
      <p className="admin-breadcrumb">
        <Link href="/admin/messages">{t("messagesTitle")}</Link>
      </p>
      <h1 className="font-display admin-title">{c.subject}</h1>
      <p className="record-chips">
        <span className="record-sub">{c.customerName}</span>
        {c.orderNumber ? <span className="record-sub">{c.orderNumber}</span> : null}
        <span className="record-sub">{t(`conversationStatuses.${c.status}`)}</span>
      </p>
      <section className="admin-section" aria-labelledby="thread">
        <h2 id="thread" className="admin-section-title">
          {t("thread")}
        </h2>
        <ol className="thread" data-testid="thread">
          {thread.messages.map((m) => (
            <li key={String(m._id)} className="thread-msg" data-from={m.from}>
              <span className="record-sub">
                {m.from === "staff" ? t("fromStore") : c.customerName} · <time dateTime={m.createdAt.toISOString()}>{date.format(m.createdAt)}</time>
              </span>
              <p>{m.body}</p>
            </li>
          ))}
        </ol>
        {c.status === "open" ? (
          <ActionForm action={staffReplyAction} testId="staff-reply" hidden={{ conversationId, clientKey: randomUUID() }} fields={[{ name: "body", label: t("replyLabel"), type: "textarea", rows: 4, required: true, maxLength: 2000 }]} messages={messages} submitLabel={t("send")} pendingLabel={t("sending")} />
        ) : (
          <p className="admin-notice">{t("closedNote")}</p>
        )}
        <div className="admin-actions">
          <ActionForm action={conversationStatusAction} testId="conversation-status" hidden={{ conversationId, version: String(c.version), status: c.status === "open" ? "closed" : "open" }} fields={[]} messages={messages} submitLabel={c.status === "open" ? t("close") : t("reopen")} pendingLabel={c.status === "open" ? t("close") : t("reopen")} variant="secondary" layout="inline" />
        </div>
      </section>
    </div>
  );
}
