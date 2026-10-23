// /admin/customers/[id] (B10, customers.read). One customer's account, saved addresses and recent orders.
// Read only. An unknown id, a malformed id, or a staff account is a 404 (no existence oracle).
// Order links are shown only when the viewer can open orders (orders.read).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { adminPage, money } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { getCustomer } from "@/lib/modules/identity/customers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.customers" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

export default async function AdminCustomerPage({ params }: PageProps<"/admin/customers/[id]">) {
  const { id } = await params;
  const { locale, db, principal } = await adminPage("/admin/customers", `/admin/customers/${id}`);
  const customer = await getCustomer(db, id);
  if (!customer) notFound();
  const t = await getTranslations({ locale, namespace: "admin.customers" });
  const o = await getTranslations({ locale, namespace: "admin.orders" });
  const canOpenOrders = principal.role?.capabilities.has("orders.read") ?? false;
  const rows: [string, string][] = [
    [t("name"), customer.name],
    [t("email"), customer.email],
    [t("phone"), customer.phone ?? t("noPhone")],
    [t("locale"), customer.locale ?? "bn"],
    [t("twoFactor"), customer.twoFactorEnabled ? t("on") : t("off")],
    ...(customer.createdAt ? ([[t("joinedLabel"), date.format(customer.createdAt)]] as [string, string][]) : []),
  ];

  return (
    <div className="admin-page" data-testid="admin-customer">
      <p className="admin-breadcrumb">
        <Link href="/admin/customers">{t("back")}</Link>
      </p>
      <h1 className="font-display admin-title">{customer.name || customer.email}</h1>

      <section className="admin-section" aria-labelledby="cu-profile">
        <h2 id="cu-profile" className="admin-section-title">
          {t("profile")}
        </h2>
        <dl className="ledger">
          {rows.map(([label, value]) => (
            <div key={label} className="ledger-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="record-chips">
          <StatusChip tone={customer.emailVerified ? "published" : "draft"} label={customer.emailVerified ? t("verified") : t("unverified")} />
        </p>
      </section>

      <section className="admin-section" aria-labelledby="cu-privacy">
        <h2 id="cu-privacy" className="admin-section-title">
          {t("privacyTitle")}
        </h2>
        <p className="field-hint" data-testid="customer-privacy">
          {customer.deletionRequestedAt ? t("deletionOpen", { date: date.format(customer.deletionRequestedAt) }) : t("noPrivacy")}
        </p>
      </section>

      <section className="admin-section" aria-labelledby="cu-addresses">
        <h2 id="cu-addresses" className="admin-section-title">
          {t("addresses")}
        </h2>
        {customer.addresses.length === 0 ? (
          <p className="field-hint">{t("noAddresses")}</p>
        ) : (
          <ul className="staff-rows">
            {customer.addresses.map((a, i) => (
              <li key={i} className="staff-row" data-testid="customer-address">
                <p className="staff-name">
                  {a.name} {a.isDefault ? <StatusChip tone="active" label={t("default")} /> : null}
                </p>
                <p className="record-chips">
                  <span className="record-sub">{a.phone}</span>
                  <span className="record-sub">{[a.line, a.area, a.district].filter(Boolean).join(", ")}</span>
                  {a.landmark ? <span className="record-sub">{a.landmark}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section" aria-labelledby="cu-orders">
        <h2 id="cu-orders" className="admin-section-title">
          {t("recentOrders")} ({t("orders", { count: customer.orders })})
        </h2>
        {customer.recentOrders.length === 0 ? (
          <p className="field-hint">{t("noOrders")}</p>
        ) : (
          <ul className="staff-rows">
            {customer.recentOrders.map((ord) => (
              <li key={ord.orderNumber} className="staff-row" data-testid="customer-order">
                <p className="staff-name">
                  {canOpenOrders ? (
                    <Link href={`/admin/orders/${ord.orderNumber}`} aria-label={t("openOrder", { orderNumber: ord.orderNumber })}>
                      {ord.orderNumber}
                    </Link>
                  ) : (
                    ord.orderNumber
                  )}
                </p>
                <p className="record-chips">
                  <span className="record-sub">{o(`statuses.${ord.status}`)}</span>
                  <span className="record-sub">{money(ord.totals.grandTotal)}</span>
                  <span className="record-sub">{date.format(ord.placedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
