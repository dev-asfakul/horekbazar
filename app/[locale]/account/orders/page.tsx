// /account/orders (B7; noindex; signed-in customer). The customer's own orders, newest first.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formatMoney, moneyFormatFor } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import { isLocale } from "@/lib/i18n/locales";
import { ORDERS, type OrderDoc } from "@/lib/modules/orders/schema";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/orders">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.orders" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function OrdersPage({ params }: PageProps<"/[locale]/account/orders">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/orders");
  const db = identity.identity.db;
  const t = await getTranslations({ locale, namespace: "account.orders" });
  const [orders, settings] = await Promise.all([
    db.collection<OrderDoc>(ORDERS).find({ userId: principal.user.id }, { projection: { orderNumber: 1, status: 1, placedAt: 1, totals: 1, lines: 1 } }).sort({ placedAt: -1 }).limit(100).toArray(),
    getSettings(db),
  ]);
  const format = moneyFormatFor(locale, settings.locale);
  const date = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  return (
    <AccountFrame locale={locale} current="orders" title={t("title")} staff={principal.role !== null}>
      <p className="field-hint">{t("intro")}</p>
      {orders.length === 0 ? (
        <p className="listing-empty-title" data-testid="orders-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="cart-lines" data-testid="order-list">
          {orders.map((o) => (
            <li key={o.orderNumber} className="cart-line" data-testid="order-row" data-status={o.status}>
              <p className="cart-line-name">
                <Link href={localeHref(locale, `/account/orders/${o.orderNumber}`)} lang="en">
                  {o.orderNumber}
                </Link>{" "}
                <span className="cart-chip">{t(`statuses.${o.status}`)}</span>
              </p>
              <p className="cart-line-variant">
                {date.format(o.placedAt)} · {t("items", { count: o.lines.reduce((a, l) => a + l.quantity, 0) })} · {formatMoney(o.totals.grandTotal, format)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AccountFrame>
  );
}
