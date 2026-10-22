// /checkout (B7; noindex; signed-in customer, D13). The cart re-priced for the chosen address's zone,
// cash on delivery, an optional note, and Place order. The form carries the total shown here and a
// request key made for this view, so a double submit places one order and a price change since this
// view is refused with the new total (domain-rules §4.1). Closed while the store has ordering off.
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ActionForm } from "@/components/forms/ActionForm";
import { SetupRequired } from "@/components/states/SetupRequired";
import { placeOrderAction, saveAddressAction } from "@/lib/actions/orders";
import { requireCustomer } from "@/lib/auth/server";
import { formatMoney } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import { formMessages } from "@/lib/i18n/form-messages";
import { isLocale } from "@/lib/i18n/locales";
import { displayBdPhone, listAddresses } from "@/lib/modules/orders/addresses";
import { viewCart } from "@/lib/modules/pricing/cart";
import { addressFields } from "@/lib/storefront/address-fields";
import { cartOwner } from "@/lib/storefront/cart-owner";
import { loadStore, moneyFormat, shown, shownLang } from "@/lib/storefront/context";

export async function generateMetadata({ params }: PageProps<"/[locale]/checkout">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params, searchParams }: PageProps<"/[locale]/checkout">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const principal = await requireCustomer(locale, "/checkout");
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  const ct = await getTranslations({ locale, namespace: "store.cart" });
  const at = await getTranslations({ locale, namespace: "account.addresses" });
  const m = await formMessages(locale);
  const format = moneyFormat(store, locale);
  const money = (v: number) => formatMoney(v, format);

  if (!store.settings.features.checkout) {
    return (
      <div className="listing cart-page" data-testid="checkout" data-state="closed">
        <h1 className="font-display listing-title">{t("title")}</h1>
        <div className="listing-empty">
          <p className="listing-empty-title">{t("closed")}</p>
          <p className="field-hint">{t("closedText")}</p>
          <Link className="btn btn-secondary" href={localeHref(locale, "/cart")}>
            {t("backToCart")}
          </Link>
        </div>
      </div>
    );
  }

  const addresses = await listAddresses(store.db, principal.user.id);
  const sp = await searchParams;
  const chosen = addresses.find((a) => String(a._id) === sp.address) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
  const owner = (await cartOwner(store.db)) ?? { userId: principal.user.id };
  const view = await viewCart(store.db, owner, chosen ? { zoneId: chosen.zoneId } : {});
  if (!view.quote || view.quote.lines.length + view.quote.unavailable.length === 0) redirect(localeHref(locale, "/cart"));
  const { quote } = view;
  const priced = quote.priced;
  const sample = quote.lines.some((l) => l.product.sample);
  const blocking = quote.unavailable.length > 0 || quote.lines.some((l) => l.available < l.quantity) || (priced.coupon && !priced.coupon.applied);
  const zone = chosen ? quote.zones.find((z) => z.id === chosen.zoneId) : undefined;
  const savings = priced.lines.reduce((a, l) => a + (l.basePrice - l.unitPrice) * l.quantity, 0);
  const zones = store.settings.delivery.zones.filter((z) => z.enabled);
  const tt = at as unknown as (key: string) => string;

  return (
    <div className="listing cart-page" data-testid="checkout" data-state="open">
      <h1 className="font-display listing-title">{t("title")}</h1>
      <div className="cart-grid">
        <div>
          <section aria-labelledby="checkout-address">
            <h2 id="checkout-address" className="pdp-h2">
              {t("address")}
            </h2>
            {addresses.length === 0 ? (
              <>
                <p className="field-hint">{t("noAddress")}</p>
                <ActionForm action={saveAddressAction} testId="checkout-address-form" fields={addressFields(tt, zones, locale)} messages={m} submitLabel={at("save")} pendingLabel={at("saving")} layout="grid" />
              </>
            ) : (
              <>
                <form className="cart-zone" method="get" action={localeHref(locale, "/checkout")}>
                  <label className="field-label" htmlFor="checkout-address-select">
                    {t("chooseAddress")}
                  </label>
                  <select id="checkout-address-select" name="address" className="field-input" defaultValue={chosen ? String(chosen._id) : ""}>
                    {addresses.map((a) => (
                      <option key={String(a._id)} value={String(a._id)}>
                        {a.name} · {a.area}, {a.district}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn btn-secondary">
                    {t("useAddress")}
                  </button>
                </form>
                {chosen ? (
                  <p className="cart-line-variant" data-testid="checkout-chosen-address">
                    {chosen.name} · <span lang="en">{displayBdPhone(chosen.phone)}</span> · {chosen.line}, {chosen.area}, {chosen.district}
                    {zone ? ` · ${shown(zone.name, locale)}` : ""}
                  </p>
                ) : null}
                <Link className="prose-link" href={localeHref(locale, "/account/addresses")}>
                  {t("manageAddresses")}
                </Link>
              </>
            )}
          </section>
          <ul className="cart-lines checkout-lines">
            {quote.lines.map((l, i) => {
              const p = priced.lines[i]!;
              return (
                <li key={l.variantId} className="cart-line" data-testid="checkout-line">
                  <p className="cart-line-name" lang={shownLang(l.product.name, locale)}>
                    {shown(l.product.name, locale)}
                  </p>
                  <p className="cart-line-variant">
                    {shown(l.variant.title, locale)} · {ct("each", { price: money(p.unitPrice) })} × {p.quantity}
                  </p>
                  <p className="cart-line-total">
                    <strong>{money(p.lineTotal)}</strong>
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
        <aside className="cart-summary" aria-labelledby="checkout-summary">
          <h2 id="checkout-summary" className="pdp-h2">
            {t("summary")}
          </h2>
          <dl className="cart-totals">
            <div>
              <dt>{ct("subtotal")}</dt>
              <dd>{money(priced.merchandise)}</dd>
            </div>
            {savings > 0 ? (
              <div>
                <dt>{ct("savings")}</dt>
                <dd>−{money(savings)}</dd>
              </div>
            ) : null}
            {priced.coupon?.applied && priced.coupon.discount > 0 ? (
              <div>
                <dt>{ct("couponDiscount")}</dt>
                <dd>−{money(priced.coupon.discount)}</dd>
              </div>
            ) : null}
            <div>
              <dt>{ct("delivery")}</dt>
              <dd data-testid="checkout-delivery">{priced.delivery ? (priced.delivery.fee === 0 ? ct("deliveryFree") : money(priced.delivery.fee)) : ct("deliveryLater")}</dd>
            </div>
            <div className="cart-total">
              <dt>{ct("total")}</dt>
              <dd data-testid="checkout-total">{money(priced.total)}</dd>
            </div>
          </dl>
          {zone?.estimate ? <p className="field-hint">{t("estimate", { estimate: shown(zone.estimate, locale) })}</p> : null}
          <p className="field-hint">{t("payment")}</p>
          <p className="field-hint">{t("confirmNote")}</p>
          {sample ? (
            <p className="pdp-notice" role="note" data-testid="checkout-sample">
              {t("sampleBlocked")}
            </p>
          ) : blocking ? (
            <p className="pdp-notice" role="note">
              {t("fixCart")}{" "}
              <Link className="prose-link" href={localeHref(locale, "/cart")}>
                {t("backToCart")}
              </Link>
            </p>
          ) : chosen && priced.delivery ? (
            <ActionForm
              action={placeOrderAction}
              testId="place-order-form"
              hidden={{ addressId: String(chosen._id), expectedTotal: String(priced.total), idempotencyKey: randomUUID(), locale }}
              fields={[{ name: "note", label: t("note"), type: "textarea", rows: 2, maxLength: 500 }]}
              messages={m}
              submitLabel={t("place")}
              pendingLabel={t("placing")}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
