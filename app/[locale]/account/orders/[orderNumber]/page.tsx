// /account/orders/[orderNumber] (B7; noindex; the owning customer only). Status, timeline from
// orderEvents, the snapshot lines and totals, the address, and self-cancel while allowed (§3).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderSummary } from "@/components/commerce/OrderSummary";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { cancelMyOrderAction } from "@/lib/actions/orders";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { moneyFormatFor } from "@/lib/format/money";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { displayBdPhone } from "@/lib/modules/orders/addresses";
import { ORDER_EVENTS, ORDERS, type OrderDoc, type OrderEventDoc } from "@/lib/modules/orders/schema";
import { CUSTOMER_CANCELLABLE } from "@/lib/modules/orders/transitions";
import { getSettings } from "@/lib/modules/settings/settings";
import { shown } from "@/lib/storefront/context";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders/[orderNumber]">): Promise<Metadata> {
  const { locale, orderNumber } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.orders" });
  return { title: t("detailTitle", { number: orderNumber }), robots: { index: false, follow: false } };
}

export default async function OrderPage({ params }: PageProps<"/[locale]/account/orders/[orderNumber]">) {
  const { locale, orderNumber } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, `/account/orders/${orderNumber}`);
  const db = identity.identity.db;
  const order = await db.collection<OrderDoc>(ORDERS).findOne({ orderNumber, userId: principal.user.id });
  if (!order) notFound();
  const [events, settings] = await Promise.all([db.collection<OrderEventDoc>(ORDER_EVENTS).find({ orderId: order._id }).sort({ seq: 1 }).toArray(), getSettings(db)]);
  const t = await getTranslations({ locale, namespace: "account.orders" });
  const m = await formMessages(locale);
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const a = order.address;
  const canCancel = CUSTOMER_CANCELLABLE.includes(order.status);
  const open = !["rejected", "cancelled_by_customer", "cancelled_by_store", "completed", "returned_to_origin", "delivered"].includes(order.status);

  return (
    <AccountFrame locale={locale} current="orders" title={t("detailTitle", { number: order.orderNumber })} staff={principal.role !== null}>
      <p>
        <span className="cart-chip" data-testid="order-status" data-status={order.status}>
          {t(`statuses.${order.status}`)}
        </span>
      </p>
      {order.statusReason && ["rejected", "cancelled_by_store", "delivery_failed", "cancelled_by_customer"].includes(order.status) ? (
        <p className="pdp-notice" role="note">
          {t("reason")}: {order.statusReason}
        </p>
      ) : null}
      <section className="account-section" aria-labelledby="order-timeline">
        <h2 id="order-timeline" className="account-section-title">
          {t("timeline")}
        </h2>
        <ol className="order-timeline" data-testid="order-timeline">
          {events.map((e) => (
            <li key={e.seq}>
              <span>{t(`statuses.${e.to}`)}</span> <time dateTime={e.createdAt.toISOString()}>{date.format(e.createdAt)}</time>
            </li>
          ))}
        </ol>
      </section>
      <OrderSummary order={order} locale={locale} format={moneyFormatFor(locale, settings.locale)} labels={{ subtotal: t("subtotal"), savings: t("savings"), coupon: t("coupon"), delivery: t("delivery"), grandTotal: t("grandTotal"), free: t("free"), qty: (qty) => t("qty", { qty }) }} />
      <dl className="ledger account-ledger">
        <div className="ledger-row">
          <dt>{t("address")}</dt>
          <dd>
            {a.name} · <span lang="en">{displayBdPhone(a.phone)}</span>
            <br />
            {a.line}, {a.area}, {a.district} · {shown(a.zoneName, locale)}
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
      {canCancel ? (
        <section className="account-section" aria-labelledby="order-cancel">
          <h2 id="order-cancel" className="account-section-title">
            {t("cancel")}
          </h2>
          <p className="field-hint">{t("cancelHint")}</p>
          <ActionForm action={cancelMyOrderAction} testId="order-cancel-form" hidden={{ orderNumber: order.orderNumber, version: String(order.version) }} fields={[{ name: "reason", label: t("cancelReason"), maxLength: 300 }]} messages={m} submitLabel={t("cancel")} pendingLabel={t("cancelling")} variant="danger" />
        </section>
      ) : open ? (
        <p className="field-hint">{t("cancelLater")}</p>
      ) : null}
      <Link className="prose-link" href={localeHref(locale, "/account/orders")}>
        {t("back")}
      </Link>
    </AccountFrame>
  );
}
