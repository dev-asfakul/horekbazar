// /admin/messages (B9, messages.reply). Customer conversations, open by default, most recent first.
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { staffInbox } from "@/lib/modules/messaging/messaging";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.engagement" });
  return { title: t("messagesTitle"), robots: { index: false, follow: false } };
}

export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const { locale, db } = await adminPage("/admin/messages");
  const t = await getTranslations({ locale, namespace: "admin.engagement" });
  const status = searchParam((await searchParams).status) === "closed" ? "closed" : "open";
  const { items, total } = await staffInbox(db, { status }, 100);
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-messages">
      <h1 className="font-display admin-title">{t("messagesTitle")}</h1>
      <p className="admin-intro">{t("messagesIntro")}</p>
      <form className="cart-zone admin-filter" method="get" action="/admin/messages">
        <label className="field-label" htmlFor="conversation-status-filter">
          {t("filterStatus")}
        </label>
        <select id="conversation-status-filter" name="status" className="field-input" defaultValue={status}>
          <option value="open">{t("conversationStatuses.open")}</option>
          <option value="closed">{t("conversationStatuses.closed")}</option>
        </select>
        <button type="submit" className="btn btn-secondary">
          {t("filterApply")}
        </button>
      </form>
      <section className="admin-section" aria-labelledby="conversations-list">
        <h2 id="conversations-list" className="admin-section-title">
          {t(`conversationStatuses.${status}`)} ({count(total)})
        </h2>
        {items.length === 0 ? (
          <div className="admin-empty" data-testid="conversations-empty">
            <p className="admin-empty-title">{t("messagesEmpty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {items.map((c) => (
              <li key={String(c._id)} className="staff-row" data-testid="conversation-row" data-unread={c.unreadByStaff > 0 || undefined}>
                <p className="staff-name">
                  <Link href={`/admin/messages/${String(c._id)}`}>{c.subject}</Link>
                </p>
                <p className="record-chips">
                  {c.unreadByStaff > 0 ? <StatusChip tone="draft" label={t("unread", { count: c.unreadByStaff })} /> : null}
                  <span className="record-sub">{c.customerName}</span>
                  {c.orderNumber ? <span className="record-sub">{c.orderNumber}</span> : null}
                  <span className="record-sub">{date.format(c.lastMessageAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
