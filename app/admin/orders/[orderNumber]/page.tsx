// /admin/orders/[orderNumber] (B7, orders.read). The order snapshot, the customer's number to call
// before confirming (D13), the timeline, and one button per step the state machine allows from here
// and the staff member's role can take. Reasons are shown to the customer. Shipping, delivery and
// the parcel coming back are recorded on the shipment panel (B8), never as a bare status change.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm } from "@/components/forms/ActionForm";
import { transitionOrderAction } from "@/lib/actions/admin-orders";
import { ADMIN_NUMBERS, adminPage, lt, money } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { displayBdPhone } from "@/lib/modules/orders/addresses";
import { ORDER_EVENTS, ORDERS, type OrderDoc, type OrderEventDoc } from "@/lib/modules/orders/schema";
import { SHIPMENT_DRIVEN, TRANSITION_CAPABILITY, TRANSITIONS } from "@/lib/modules/orders/transitions";
import { shipmentsForOrder } from "@/lib/modules/fulfilment/shipments";
import { ShipmentPanel } from "@/components/admin/ShipmentPanel";
import { decideAccess } from "@/lib/modules/identity/principal";
import { OrderSummary } from "@/components/commerce/OrderSummary";

export async function generateMetadata({ params }: PageProps<"/admin/orders/[orderNumber]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.orders" });
  return { title: t("detailTitle", { number: (await params).orderNumber }), robots: { index: false, follow: false } };
}

const NEEDS_REASON = new Set(["rejected", "cancelled_by_store", "delivery_failed"]);

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  const { locale, db, messages, principal } = await adminPage("/admin/orders", `/admin/orders/${orderNumber}`);
  const order = await db.collection<OrderDoc>(ORDERS).findOne({ orderNumber });
  if (!order) notFound();
  const [events, shipments] = await Promise.all([db.collection<OrderEventDoc>(ORDER_EVENTS).find({ orderId: order._id }).sort({ seq: 1 }).toArray(), shipmentsForOrder(db, order._id)]);
  const t = await getTranslations({ locale, namespace: "admin.orders" });
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const all = TRANSITIONS[order.status];
  const next = all.filter((to) => !SHIPMENT_DRIVEN.includes(to));
  const allowed = next.filter((to) => {
    const cap = TRANSITION_CAPABILITY[to];
    return cap && decideAccess(principal, cap).result === "allowed";
  });
  const a = order.address;
  const phone = displayBdPhone(a.phone);

  return (
    <div className="admin-page" data-testid="admin-order" data-status={order.status}>
      <p>
        <Link className="prose-link" href="/admin/orders">
          {t("back")}
        </Link>
      </p>
      <h1 className="font-display admin-title">{t("detailTitle", { number: order.orderNumber })}</h1>
      <p className="record-chips">
        <StatusChip tone={order.status === "pending_confirmation" ? "draft" : order.status.startsWith("cancel") || order.status === "rejected" ? "archived" : "published"} label={t(`statuses.${order.status}`)} />
        <span className="record-sub">{date.format(order.placedAt)}</span>
        <span className="record-sub">{money(order.totals.grandTotal)}</span>
      </p>
      {order.statusReason ? (
        <p className="pdp-notice" role="note">
          {t("reason")}: {order.statusReason}
        </p>
      ) : null}
      {/* Layout only (Proposal A1): status and shipment beside the details from 1024 px. */}
      <div className="order-columns">
        <div className="order-side">
          <section className="admin-section" aria-labelledby="order-steps">
            <h2 id="order-steps" className="admin-section-title">
              {t("status")}
            </h2>
            {next.length < all.length ? <p className="field-hint">{t("shipmentDriven")}</p> : null}
            {all.length === 0 ? (
              <p className="field-hint">{t("noNext")}</p>
            ) : next.length === 0 ? null : allowed.length === 0 ? (
              <p className="field-hint">{t("deny")}</p>
            ) : (
              <div className="admin-actions" data-testid="order-actions">
                {allowed.map((to) => (
                  <ActionForm
                    key={to}
                    action={transitionOrderAction}
                    testId={`order-to-${to}`}
                    hidden={{ orderId: String(order._id), version: String(order.version), to }}
                    fields={NEEDS_REASON.has(to) ? [{ name: "reason", label: t("reason"), hint: t("reasonHint"), required: true, maxLength: 500 }] : []}
                    messages={messages}
                    submitLabel={t(`actions.${to}` as never)}
                    pendingLabel={t(`actions.${to}` as never)}
                    variant={NEEDS_REASON.has(to) ? "danger" : "primary"}
                    layout={NEEDS_REASON.has(to) ? "stack" : "inline"}
                  />
                ))}
              </div>
            )}
          </section>
          <ShipmentPanel order={order} shipments={shipments} principal={principal} messages={messages} />
        </div>
        <div className="order-main">
          <section className="admin-section" aria-labelledby="order-customer">
            <h2 id="order-customer" className="admin-section-title">
              {t("address")}
            </h2>
            <dl className="ledger">
              <div className="ledger-row">
                <dt>{t("customer")}</dt>
                <dd>
                  {order.customer.name} · <span lang="en">{order.customer.email}</span>
                </dd>
              </div>
              <div className="ledger-row">
                <dt>{t("phone")}</dt>
                <dd>
                  <a className="prose-link" href={`tel:${a.phone}`} data-testid="order-phone">
                    {phone}
                  </a>
                </dd>
              </div>
              <div className="ledger-row">
                <dt>{t("address")}</dt>
                <dd>
                  {a.name} · {a.line}, {a.area}, {a.district} · {lt(a.zoneName, locale)}
                  {a.landmark ? ` · ${a.landmark}` : ""}
                </dd>
              </div>
              <div className="ledger-row">
                <dt>{t("payment")}</dt>
                <dd>{t("cod")}</dd>
              </div>
              {order.note ? (
                <div className="ledger-row">
                  <dt>{t("note")}</dt>
                  <dd>{order.note}</dd>
                </div>
              ) : null}
            </dl>
          </section>
          <section className="admin-section" aria-labelledby="order-lines">
            <h2 id="order-lines" className="admin-section-title">
              {t("lines")}
            </h2>
            <OrderSummary order={order} locale={locale} format={ADMIN_NUMBERS} labels={{ subtotal: t("subtotal"), savings: t("savings"), coupon: t("coupon"), delivery: t("delivery"), grandTotal: t("grandTotal"), free: t("free"), qty: (qty) => t("qty", { qty }) }} />
          </section>
          <section className="admin-section" aria-labelledby="order-events">
            <h2 id="order-events" className="admin-section-title">
              {t("timeline")}
            </h2>
            <ol className="order-timeline">
              {events.map((e) => (
                <li key={e.seq}>
                  {t(`statuses.${e.to}`)} · {t("by", { actor: e.actor.type })} <time dateTime={e.createdAt.toISOString()}>{date.format(e.createdAt)}</time>
                  {e.reason ? ` · ${e.reason}` : ""}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
