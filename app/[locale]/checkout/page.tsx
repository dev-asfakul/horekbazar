// /checkout (B7; noindex). A signed-in customer uses a saved address (D13); a visitor without an account
// can check out as a guest (Phase F, D28) with contact and delivery details typed here, against the
// device cart, or sign in / create an account for its benefits. The cart re-priced for the chosen zone,
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
import { placeGuestOrderAction, placeOrderAction, saveAddressAction } from "@/lib/actions/orders";
import { getPrincipal } from "@/lib/auth/server";
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
  const principal = await getPrincipal();
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

  const sp = await searchParams;
  const zones = store.settings.delivery.zones.filter((z) => z.enabled);
  const tt = at as unknown as (key: string) => string;
  if (!principal) return <GuestCheckout locale={locale} store={store} zoneParam={typeof sp.zone === "string" ? sp.zone : undefined} zones={zones} />;

  const addresses = await listAddresses(store.db, principal.user.id);
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

type Store = Extract<Awaited<ReturnType<typeof loadStore>>, { ready: true }>;
type Zone = Store["settings"]["delivery"]["zones"][number];

/** Guest checkout (D28): the benefits choice, the delivery area, then contact and address, then Place order. */
async function GuestCheckout({ locale, store, zoneParam, zones }: { locale: "bn" | "en"; store: Store; zoneParam: string | undefined; zones: Zone[] }) {
  const t = await getTranslations({ locale, namespace: "store.checkout" });
  const gt = await getTranslations({ locale, namespace: "store.checkout.guest" });
  const ct = await getTranslations({ locale, namespace: "store.cart" });
  const at = await getTranslations({ locale, namespace: "account.addresses" });
  const m = await formMessages(locale);
  const money = (v: number) => formatMoney(v, moneyFormat(store, locale));
  const owner = await cartOwner(store.db);
  if (!owner || !("deviceId" in owner)) redirect(localeHref(locale, "/cart"));
  const chosenZone = zones.find((z) => z.id === zoneParam) ?? (zones.length === 1 ? zones[0] : undefined);
  const view = await viewCart(store.db, owner, chosenZone ? { zoneId: chosenZone.id } : {});
  if (!view.quote || view.quote.lines.length + view.quote.unavailable.length === 0) redirect(localeHref(locale, "/cart"));
  const { quote } = view;
  const priced = quote.priced;
  const sample = quote.lines.some((l) => l.product.sample);
  const blocking = quote.unavailable.length > 0 || quote.lines.some((l) => l.available < l.quantity) || (priced.coupon && !priced.coupon.applied);
  const zone = chosenZone ? quote.zones.find((z) => z.id === chosenZone.id) : undefined;
  const next = encodeURIComponent(localeHref(locale, "/checkout"));
  const tt = at as unknown as (key: string) => string;
  const fields = addressFields(tt, zones, locale).filter((f) => !["label", "zoneId", "isDefault"].includes(f.name));
  fields.splice(1, 0, { name: "email", label: gt("email"), hint: gt("emailHint"), type: "email", inputMode: "email", autoComplete: "email", required: true, maxLength: 254 });
  fields.push({ name: "note", label: t("note"), type: "textarea", rows: 2, maxLength: 500, wide: true });

  return (
    <div className="listing cart-page" data-testid="checkout" data-state="open" data-mode="guest">
      <h1 className="font-display listing-title">{t("title")}</h1>
      <section className="guest-choice" aria-labelledby="guest-choice-title" data-testid="guest-choice">
        <h2 id="guest-choice-title" className="pdp-h2">
          {gt("choiceTitle")}
        </h2>
        <p className="field-hint">{gt("benefitsLead")}</p>
        <ul className="guest-benefits">
          {(["addresses", "history", "rewards", "messages", "devices"] as const).map((k) => (
            <li key={k}>{gt(`benefits.${k}`)}</li>
          ))}
        </ul>
        <p className="guest-choice-actions">
          <Link className="btn btn-secondary" href={`${localeHref(locale, "/login")}?next=${next}`} data-testid="guest-sign-in">
            {gt("signIn")}
          </Link>
          <Link className="btn btn-secondary" href={`${localeHref(locale, "/register")}?next=${next}`} data-testid="guest-register">
            {gt("register")}
          </Link>
        </p>
        <p className="field-hint">{gt("guestNote")}</p>
      </section>
      <div className="cart-grid">
        <div>
          <section aria-labelledby="guest-zone-title">
            <h2 id="guest-zone-title" className="pdp-h2">
              {gt("zoneTitle")}
            </h2>
            <form className="cart-zone" method="get" action={localeHref(locale, "/checkout")} data-testid="guest-zone-form">
              <label className="field-label" htmlFor="guest-zone-select">
                {at("zone")}
              </label>
              <select id="guest-zone-select" name="zone" className="field-input" defaultValue={chosenZone?.id ?? ""} required>
                {chosenZone ? null : (
                  <option value="" disabled>
                    {gt("chooseZone")}
                  </option>
                )}
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {shown(z.name, locale)}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">
                {gt("useZone")}
              </button>
            </form>
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
          <section aria-labelledby="guest-details-title">
            <h2 id="guest-details-title" className="pdp-h2">
              {gt("detailsTitle")}
            </h2>
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
            ) : chosenZone && priced.delivery ? (
              <ActionForm
                action={placeGuestOrderAction}
                testId="guest-order-form"
                hidden={{ zoneId: chosenZone.id, expectedTotal: String(priced.total), idempotencyKey: randomUUID(), locale }}
                fields={fields}
                messages={m}
                submitLabel={t("place")}
                pendingLabel={t("placing")}
                layout="grid"
              />
            ) : (
              <p className="field-hint" data-testid="guest-zone-first">
                {gt("zoneFirst")}
              </p>
            )}
          </section>
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
        </aside>
      </div>
    </div>
  );
}
