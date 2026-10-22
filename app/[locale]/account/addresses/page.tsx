// /account/addresses (B7; noindex; signed-in customer). Saved delivery addresses: add, edit, delete,
// default. Location is the D21(b) interim (store zone + free-text district and area) until D12.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { addressFields } from "@/lib/storefront/address-fields";
import { AccountFrame } from "@/components/identity/AccountFrame";
import { IdentityUnavailable } from "@/components/identity/IdentityUnavailable";
import { defaultAddressAction, deleteAddressAction, saveAddressAction } from "@/lib/actions/orders";
import { getIdentity, requireCustomer } from "@/lib/auth/server";
import { formMessages } from "@/lib/i18n/form-messages";
import { isLocale } from "@/lib/i18n/locales";
import { displayBdPhone, listAddresses } from "@/lib/modules/orders/addresses";
import { getSettings } from "@/lib/modules/settings/settings";
import { shown } from "@/lib/storefront/context";

export async function generateMetadata({ params }: PageProps<"/[locale]/account/addresses">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "account.addresses" });
  return { title: t("title"), robots: { index: false, follow: false } };
}


export default async function AddressesPage({ params }: PageProps<"/[locale]/account/addresses">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const identity = await getIdentity();
  if (!identity.ok) return <IdentityUnavailable locale={locale} reason={identity.reason} />;
  const principal = await requireCustomer(locale, "/account/addresses");
  const t = await getTranslations({ locale, namespace: "account.addresses" });
  const m = await formMessages(locale);
  const [list, settings] = await Promise.all([listAddresses(identity.identity.db, principal.user.id), getSettings(identity.identity.db)]);
  const zones = settings.delivery.zones.filter((z) => z.enabled);
  const zoneName = (id: string) => shown(zones.find((z) => z.id === id)?.name, locale) || id;
  const tt = t as unknown as (key: string) => string;

  return (
    <AccountFrame locale={locale} current="addresses" title={t("title")} staff={principal.role !== null}>
      <p className="field-hint">{t("intro")}</p>
      {list.length === 0 ? (
        <p className="listing-empty-title" data-testid="addresses-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="cart-lines" data-testid="address-list">
          {list.map((a) => (
            <li key={String(a._id)} className="cart-line" data-testid="address-row">
              <p className="cart-line-name">
                {a.name} · {t(`labels.${a.label}`)} {a.isDefault ? <span className="cart-chip">{t("default")}</span> : null}
              </p>
              <p className="cart-line-variant">
                {a.line}, {a.area}, {a.district} · {zoneName(a.zoneId)}
                {a.landmark ? ` · ${a.landmark}` : ""}
              </p>
              <p className="cart-line-variant" lang="en">
                {displayBdPhone(a.phone)}
              </p>
              <div className="cart-line-actions">
                {!a.isDefault ? <ActionForm action={defaultAddressAction} hidden={{ id: String(a._id) }} fields={[]} messages={m} submitLabel={t("makeDefault")} pendingLabel={t("saving")} variant="secondary" layout="inline" /> : null}
                <ActionForm action={deleteAddressAction} hidden={{ id: String(a._id) }} fields={[]} messages={m} submitLabel={t("delete")} pendingLabel={t("saving")} variant="secondary" layout="inline" />
              </div>
              <details className="staff-manage">
                <summary>{t("edit")}</summary>
                <ActionForm action={saveAddressAction} hidden={{ id: String(a._id), version: String(a.version) }} fields={addressFields(tt, zones, locale, a)} messages={m} submitLabel={t("save")} pendingLabel={t("saving")} layout="grid" />
              </details>
            </li>
          ))}
        </ul>
      )}
      {list.length < 10 ? (
        <section className="account-section" aria-labelledby="address-add">
          <h2 id="address-add" className="account-section-title">
            {t("add")}
          </h2>
          <p className="field-hint">{t("locationNote")}</p>
          <ActionForm action={saveAddressAction} testId="address-form" fields={addressFields(tt, zones, locale)} messages={m} submitLabel={t("save")} pendingLabel={t("saving")} layout="grid" hideOnSuccess={false} />
        </section>
      ) : null}
    </AccountFrame>
  );
}
