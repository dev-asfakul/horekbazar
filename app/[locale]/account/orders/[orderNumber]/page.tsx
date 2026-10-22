// /account/orders/[orderNumber] (B7; noindex; the owning customer only). Status, timeline from
// orderEvents, the snapshot lines and totals, the address, and self-cancel while allowed (§3).
// B8: delivery tracking (only checkpoints the store or the courier recorded, and only a tracking link
// that was entered or returned by the courier), and return requests within the return window.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderSummary } from "@/components/commerce/OrderSummary";
import { ActionForm } from "@/components/forms/ActionForm";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { cancelMyOrderAction, requestReturnAction } from "@/lib/actions/orders";
import { COURIER_NAMES } from "@/lib/adapters/courier/index";
import { returnEligibility } from "@/lib/modules/fulfilment/returns";
import { RETURNS, type ReturnDoc } from "@/lib/modules/fulfilment/schema";
import { shipmentsForOrder } from "@/lib/modules/fulfilment/shipments";
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
  const [events, settings, shipments, returns, eligibility] = await Promise.all([
    db.collection<OrderEventDoc>(ORDER_EVENTS).find({ orderId: order._id }).sort({ seq: 1 }).toArray(),
    getSettings(db),
    shipmentsForOrder(db, order._id),
    db.collection<ReturnDoc>(RETURNS).find({ orderId: order._id, userId: principal.user.id }).sort({ requestedAt: -1 }).toArray(),
    returnEligibility(db, order),
  ]);
  // The parcel the customer is waiting for: the newest shipment past draft that was not cancelled.
  const shipment = shipments.find((s) => s.status !== "draft" && s.status !== "cancelled");
  const checkpoints = (shipment?.checkpoints ?? []).filter((c) => c.code !== "draft" && c.code !== "booking_failed");
  const checkpointLabel = (code: string) => (code.startsWith("courier:") ? t(`courierStatus.${code.slice(8)}` as never) : t(`shipmentStatus.${code}` as never));
  const returnable = order.lines.filter((l) => (eligibility.remaining[l.lineId] ?? 0) > 0);
  const day = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Dhaka" });
  const nf = new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-GB");
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
      <p className="field-hint">
        <Link href={localeHref(locale, `/account/messages?order=${encodeURIComponent(order.orderNumber)}`)} data-testid="order-message-link">
          {t("messageStore")}
        </Link>
      </p>
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
      {["ready_to_ship", "shipped", "delivered", "delivery_failed", "returned_to_origin", "completed"].includes(order.status) || shipment ? (
        <section className="account-section order-tracking" aria-labelledby="order-tracking" data-testid="order-tracking" data-status={shipment?.status ?? "none"}>
          <h2 id="order-tracking" className="account-section-title">
            {t("trackingTitle")}
          </h2>
          {shipment ? (
            <>
              <dl className="ledger account-ledger">
                <div className="ledger-row">
                  <dt>{t("trackingCourier")}</dt>
                  <dd>{shipment.courier === "manual" ? shipment.carrierName : <span lang="en">{COURIER_NAMES[shipment.courier]}</span>}</dd>
                </div>
                {shipment.trackingCode ?? shipment.consignmentId ? (
                  <div className="ledger-row">
                    <dt>{t("trackingNumber")}</dt>
                    <dd lang="en" data-testid="order-tracking-number">
                      {shipment.trackingCode ?? shipment.consignmentId}
                    </dd>
                  </div>
                ) : null}
              </dl>
              {shipment.trackingUrl ? (
                <p>
                  <a className="prose-link" href={shipment.trackingUrl} rel="noopener noreferrer nofollow" target="_blank" data-testid="order-tracking-link">
                    {t("trackingLink")}
                  </a>
                </p>
              ) : null}
              <h3 className="account-section-title">{t("trackingCheckpoints")}</h3>
              <ol className="order-timeline" data-testid="order-tracking-checkpoints">
                {checkpoints.map((c, i) => (
                  <li key={i} data-code={c.code}>
                    <span>{checkpointLabel(c.code)}</span> <time dateTime={c.at.toISOString()}>{date.format(c.at)}</time>
                    {c.code === "delivery_failed" && c.note ? ` · ${c.note}` : ""}
                  </li>
                ))}
              </ol>
              <p className="field-hint">{t("trackingNote")}</p>
            </>
          ) : (
            <p className="field-hint" data-testid="order-tracking-none">
              {t("trackingNone")}
            </p>
          )}
        </section>
      ) : null}
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
      {order.status === "delivered" || returns.length > 0 ? (
        <section className="account-section" aria-labelledby="order-returns" data-testid="order-returns">
          <h2 id="order-returns" className="account-section-title">
            {t("returnTitle")}
          </h2>
          {returns.length > 0 ? (
            <>
              <h3 className="account-section-title">{t("returnsList")}</h3>
              <ul className="order-timeline" data-testid="order-return-list">
                {returns.map((r) => (
                  <li key={String(r._id)} data-status={r.status}>
                    {t(`returnStatus.${r.status}`)} · {t("returnItems", { count: nf.format(r.lines.reduce((a, l) => a + l.qty, 0)) })} <time dateTime={r.requestedAt.toISOString()}>{date.format(r.requestedAt)}</time>
                    {r.statusReason && (r.status === "rejected" || r.status === "closed") ? ` · ${r.statusReason}` : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {eligibility.open && returnable.length > 0 ? (
            <>
              <p className="field-hint">{t("returnIntro", { days: nf.format(settings.orders?.returnWindowDays ?? 7), date: day.format(eligibility.closesAt!) })}</p>
              <ActionForm
                action={requestReturnAction}
                testId="order-return-form"
                hidden={{ orderNumber: order.orderNumber, lineIds: returnable.map((l) => l.lineId).join(",") }}
                fields={[
                  ...returnable.map((l) => ({ name: `qty_${l.lineId}`, label: t("returnQty", { name: `${shown(l.name, locale)} · ${shown(l.variantTitle, locale)}`, max: nf.format(eligibility.remaining[l.lineId]!) }), type: "number" as const, inputMode: "numeric" as const, defaultValue: "0", maxLength: 2 })),
                  { name: "reason", label: t("returnReason"), hint: t("returnReasonHint"), type: "textarea", required: true, maxLength: 500 },
                ]}
                messages={m}
                submitLabel={t("returnSubmit")}
                pendingLabel={t("returnSubmit")}
                variant="secondary"
              />
            </>
          ) : order.status === "delivered" ? (
            <p className="field-hint" data-testid="order-return-closed">
              {eligibility.reason === "returns_off" ? t("returnOff") : t("returnClosed")}
            </p>
          ) : null}
        </section>
      ) : null}
      <Link className="prose-link" href={localeHref(locale, "/account/orders")}>
        {t("back")}
      </Link>
    </AccountFrame>
  );
}
