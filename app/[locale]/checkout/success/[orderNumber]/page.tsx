// /checkout/success/[orderNumber] (B7; noindex). Shown only to the customer who placed the order.
// Phase E: when the store has push configured, offers order-update notifications here, after the
// order, from a button (never on page load).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderSummary } from "@/components/commerce/OrderSummary";
import { OrderUpdatesPrompt } from "@/components/notifications/OrderUpdatesPrompt";
import { SetupRequired } from "@/components/states/SetupRequired";
import { pushConfig } from "@/lib/adapters/push/webpush";
import { requireCustomer } from "@/lib/auth/server";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { ORDERS, type OrderDoc } from "@/lib/modules/orders/schema";
import { loadStore, moneyFormat } from "@/lib/storefront/context";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout/success/[orderNumber]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  return { title: t("successTitle"), robots: { index: false, follow: false } };
}

export default async function CheckoutSuccessPage({ params }: PageProps<"/[locale]/checkout/success/[orderNumber]">) {
  const { locale, orderNumber } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const principal = await requireCustomer(locale, `/checkout/success/${orderNumber}`);
  const order = await store.db.collection<OrderDoc>(ORDERS).findOne({ orderNumber, userId: principal.user.id });
  if (!order) notFound();
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  const o = await getTranslations({ locale, namespace: "account.orders" });
  const push = pushConfig();
  return (
    <div className="listing cart-page" data-testid="checkout-success">
      <h1 className="font-display listing-title">{t("successTitle")}</h1>
      <p className="listing-intro" role="status">
        {t("successText", { number: order.orderNumber })}
      </p>
      <p className="field-hint">{t("successEmail")}</p>
      <OrderSummary order={order} locale={locale} format={moneyFormat(store, locale)} labels={{ subtotal: o("subtotal"), savings: o("savings"), coupon: o("coupon"), delivery: o("delivery"), grandTotal: o("grandTotal"), free: o("free"), qty: (qty) => o("qty", { qty }) }} />
      <p className="cart-line-actions">
        <Link className="btn btn-primary" href={localeHref(locale, `/account/orders/${order.orderNumber}`)}>
          {t("viewOrder")}
        </Link>
        <Link className="btn btn-secondary" href={localeHref(locale, "/categories")}>
          {t("keepShopping")}
        </Link>
      </p>
      {push ? (
        <OrderUpdatesPrompt
          vapidPublicKey={push.publicKey}
          locale={locale}
          settingsHref={localeHref(locale, "/account/notifications")}
          labels={{ title: t("updatesTitle"), body: t("updatesBody"), turnOn: t("updatesTurnOn"), notNow: t("updatesNotNow"), working: t("updatesWorking"), on: t("updatesOn"), blocked: t("updatesBlocked"), settings: t("updatesSettings"), error: t("updatesError") }}
        />
      ) : null}
    </div>
  );
}
