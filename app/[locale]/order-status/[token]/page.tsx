// /order-status/[token] (Phase F, D28; noindex, no referrer). A guest order's confirmation and status
// page, reached only through its secret link (orders/guest.ts): never by order number. Shows what the
// buyer typed and the order's progress, and offers the explicit claim into a verified account.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderSummary } from "@/components/commerce/OrderSummary";
import { ActionForm } from "@/components/forms/ActionForm";
import { SetupRequired } from "@/components/states/SetupRequired";
import { claimGuestOrderAction } from "@/lib/actions/orders";
import { getPrincipal } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { displayBdPhone } from "@/lib/modules/orders/addresses";
import { canClaim, findGuestOrder, isGuestToken } from "@/lib/modules/orders/guest";
import { ORDER_EVENTS, type OrderEventDoc } from "@/lib/modules/orders/schema";
import { guestOrderLookup } from "./lookup";
import { shipmentsForOrder } from "@/lib/modules/fulfilment/shipments";
import { loadStore, moneyFormat, shown } from "@/lib/storefront/context";


export async function generateMetadata({ params }: PageProps<"/[locale]/order-status/[token]">): Promise<Metadata> {
  const { locale, token } = await params;
  if (!isLocale(locale) || !isGuestToken(token)) notFound();
  const t = await getTranslations({ locale, namespace: "store.guestOrder" });
  // The link is the key: never indexed, and never sent on to another site in a Referer header.
  return { title: t("title"), robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function GuestOrderPage({ params, searchParams }: PageProps<"/[locale]/order-status/[token]">) {
  const { locale, token } = await params;
  if (!isLocale(locale) || !isGuestToken(token)) notFound();
  setRequestLocale(locale);
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store.guestOrder" });
  const ot = await getTranslations({ locale, namespace: "account.orders" });
  const found = (await guestOrderLookup(token)) ?? (await findGuestOrder(store.db, token));
  const principal = await getPrincipal();
  const here = localeHref(locale, `/order-status/${token}`);

  if (found.state === "not_found") notFound();
  if (found.state === "claimed") {
    if (principal && principal.user.id === found.order.userId) redirect(localeHref(locale, `/account/orders/${found.order.orderNumber}`));
    return (
      <div className="listing cart-page" data-testid="guest-order" data-state="claimed">
        <h1 className="font-display listing-title">{t("title")}</h1>
        <div className="listing-empty">
          <p className="listing-empty-title">{t("claimedTitle")}</p>
          <p className="field-hint">{t("claimedText")}</p>
          <Link className="btn btn-secondary" href={`${localeHref(locale, "/login")}?next=${encodeURIComponent(localeHref(locale, "/account/orders"))}`}>
            {t("signIn")}
          </Link>
        </div>
      </div>
    );
  }
  if (found.state === "expired") {
    return (
      <div className="listing cart-page" data-testid="guest-order" data-state="expired">
        <h1 className="font-display listing-title">{t("title")}</h1>
        <div className="listing-empty">
          <p className="listing-empty-title">{t("expiredTitle")}</p>
          <p className="field-hint">{t("expiredText")}</p>
          <Link className="btn btn-secondary" href={localeHref(locale, "/contact")}>
            {t("contact")}
          </Link>
        </div>
      </div>
    );
  }

  const { order } = found;
  const sp = await searchParams;
  const placed = sp.placed === "1";
  const [events, shipments, m] = await Promise.all([
    store.db.collection<OrderEventDoc>(ORDER_EVENTS).find({ orderId: order._id }).sort({ seq: 1 }).toArray(),
    shipmentsForOrder(store.db, order._id),
    formMessages(locale),
  ]);
  const shipment = shipments.find((s) => s.status !== "draft" && s.status !== "cancelled");
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const a = order.address;
  const claimable = principal ? canClaim(order, principal.user) : false;

  return (
    <div className="listing cart-page guest-order" data-testid="guest-order" data-state="open">
      <h1 className="font-display listing-title">{placed ? t("placedTitle") : t("title")}</h1>
      {placed ? (
        <div role="status" className="guest-placed">
          <p>{t("placedText", { number: order.orderNumber })}</p>
          <p className="field-hint">{t("placedEmail", { email: order.customer.email })}</p>
        </div>
      ) : null}
      <p className="field-hint" data-testid="guest-keep-link">
        {t("keepLink")}
      </p>
      <dl className="ledger account-ledger">
        <div className="ledger-row">
          <dt>{t("number")}</dt>
          <dd lang="en" data-testid="guest-order-number">
            {order.orderNumber}
          </dd>
        </div>
        <div className="ledger-row">
          <dt>{t("status")}</dt>
          <dd>
            <span className="cart-chip" data-testid="order-status" data-status={order.status}>
              {ot(`statuses.${order.status}`)}
            </span>
          </dd>
        </div>
      </dl>
      {order.statusReason && ["rejected", "cancelled_by_store", "delivery_failed", "cancelled_by_customer"].includes(order.status) ? (
        <p className="pdp-notice" role="note">
          {ot("reason")}: {order.statusReason}
        </p>
      ) : null}
      <section className="account-section" aria-labelledby="guest-timeline">
        <h2 id="guest-timeline" className="account-section-title">
          {ot("timeline")}
        </h2>
        <ol className="order-timeline" data-testid="order-timeline">
          {events.map((e) => (
            <li key={e.seq}>
              <span>{ot(`statuses.${e.to}`)}</span> <time dateTime={e.createdAt.toISOString()}>{date.format(e.createdAt)}</time>
            </li>
          ))}
        </ol>
      </section>
      {shipment && (shipment.trackingCode ?? shipment.consignmentId ?? shipment.trackingUrl) ? (
        <section className="account-section" aria-labelledby="guest-tracking" data-testid="order-tracking">
          <h2 id="guest-tracking" className="account-section-title">
            {ot("trackingTitle")}
          </h2>
          {shipment.trackingCode ?? shipment.consignmentId ? (
            <p>
              {ot("trackingNumber")}: <span lang="en">{shipment.trackingCode ?? shipment.consignmentId}</span>
            </p>
          ) : null}
          {shipment.trackingUrl ? (
            <p>
              <a className="prose-link" href={shipment.trackingUrl} rel="noopener noreferrer nofollow" target="_blank">
                {ot("trackingLink")}
              </a>
            </p>
          ) : null}
        </section>
      ) : null}
      <OrderSummary order={order} locale={locale} format={moneyFormat(store, locale)} labels={{ subtotal: ot("subtotal"), savings: ot("savings"), coupon: ot("coupon"), delivery: ot("delivery"), grandTotal: ot("grandTotal"), free: ot("free"), qty: (qty) => ot("qty", { qty }) }} />
      <dl className="ledger account-ledger">
        <div className="ledger-row">
          <dt>{ot("address")}</dt>
          <dd>
            {a.name} · <span lang="en">{displayBdPhone(a.phone)}</span>
            <br />
            {a.line}, {a.area}, {a.district} · {shown(a.zoneName, locale)}
            {a.landmark ? ` · ${a.landmark}` : ""}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        {t("help")}{" "}
        <Link className="prose-link" href={localeHref(locale, "/contact")}>
          {t("contact")}
        </Link>
      </p>
      <section className="account-section guest-choice" aria-labelledby="guest-claim" data-testid="guest-claim">
        <h2 id="guest-claim" className="account-section-title">
          {t("claimTitle")}
        </h2>
        {claimable ? (
          <>
            <p className="field-hint">{t("claimText")}</p>
            <ActionForm action={claimGuestOrderAction} testId="guest-claim-form" hidden={{ token, locale }} fields={[]} messages={m} submitLabel={t("claim")} pendingLabel={t("claiming")} />
          </>
        ) : principal && !principal.user.emailVerified ? (
          <p className="field-hint" data-testid="guest-claim-unverified">
            {t("claimUnverified")}
          </p>
        ) : principal ? (
          <p className="field-hint" data-testid="guest-claim-mismatch">
            {t("claimMismatch")}
          </p>
        ) : (
          <>
            <p className="field-hint">{t("claimSignedOut")}</p>
            <p className="guest-choice-actions">
              <Link className="btn btn-secondary" href={`${localeHref(locale, "/register")}?next=${encodeURIComponent(here)}`}>
                {t("register")}
              </Link>
              <Link className="btn btn-secondary" href={`${localeHref(locale, "/login")}?next=${encodeURIComponent(here)}`}>
                {t("signIn")}
              </Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
