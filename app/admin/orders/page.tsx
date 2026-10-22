// /admin/orders (B7, orders.read). Newest first, filter by status; orders waiting for confirmation
// longer than the store's alert window are flagged (domain-rules §3 auto-cancel: flag only, off by default).
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { adminPage, count, lt, money, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { ORDER_STATUSES, ORDERS, type OrderDoc, type OrderStatus } from "@/lib/modules/orders/schema";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.orders" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const TONE: Partial<Record<OrderStatus, "published" | "draft" | "archived">> = { pending_confirmation: "draft", completed: "published", delivered: "published", rejected: "archived", cancelled_by_customer: "archived", cancelled_by_store: "archived" };

/** Orders placed before this instant have waited longer than the alert window. */
function staleCutoff(hours: number) {
  return new Date(Date.now() - hours * 3600_000);
}

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { locale, db } = await adminPage("/admin/orders");
  const t = await getTranslations({ locale, namespace: "admin.orders" });
  const sp = await searchParams;
  const status = ORDER_STATUSES.find((s) => s === searchParam(sp.status));
  const [orders, settings] = await Promise.all([
    db.collection<OrderDoc>(ORDERS).find(status ? { status } : {}, { projection: { orderNumber: 1, status: 1, placedAt: 1, totals: 1, lines: 1, customer: 1, address: 1 } }).sort({ placedAt: -1 }).limit(200).toArray(),
    getSettings(db),
  ]);
  const alertHours = settings.orders?.pendingAlertHours ?? 48;
  const cutoff = staleCutoff(alertHours);
  const stale = (o: OrderDoc) => o.status === "pending_confirmation" && o.placedAt < cutoff;
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-orders">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <form className="cart-zone admin-filter" method="get" action="/admin/orders">
        <label className="field-label" htmlFor="order-status-filter">
          {t("filter")}
        </label>
        <select id="order-status-filter" name="status" className="field-input" defaultValue={status ?? ""}>
          <option value="">{t("all")}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          {t("apply")}
        </button>
      </form>
      <section className="admin-section" aria-labelledby="orders-list">
        <h2 id="orders-list" className="admin-section-title">
          {t("listTitle", { count: count(orders.length) })}
        </h2>
        {orders.length === 0 ? (
          <div className="admin-empty" data-testid="orders-empty">
            <p className="admin-empty-title">{t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {orders.map((o) => (
              <li key={o.orderNumber} className="staff-row" data-testid="admin-order-row" data-status={o.status}>
                <p className="staff-name">
                  <Link href={`/admin/orders/${o.orderNumber}`}>{o.orderNumber}</Link>
                </p>
                <p className="record-chips">
                  <StatusChip tone={TONE[o.status] ?? "draft"} label={t(`statuses.${o.status}`)} />
                  {stale(o) ? <span className="record-sub record-warn">{t("stale", { hours: alertHours })}</span> : null}
                  <span className="record-sub">{o.address.name}</span>
                  <span className="record-sub">{lt(o.address.zoneName, locale)}</span>
                  <span className="record-sub">{t("items", { count: count(o.lines.reduce((a, l) => a + l.quantity, 0)) })}</span>
                  <span className="record-sub">{money(o.totals.grandTotal)}</span>
                  <span className="record-sub">{date.format(o.placedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
