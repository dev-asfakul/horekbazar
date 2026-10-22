// /cart (B6). The cart re-priced on every view (domain-rules §4.1, §5): promotions, flash sales,
// quantity tiers, coupon and the delivery charge for the chosen zone. Lines that changed since the
// customer last looked carry a notice (price up/down, stock low or gone, no longer sold). Every
// control is a plain form post. Checkout opens only when the store turns ordering on and the cart
// has nothing to fix; until then the page says ordering is not open.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PriceTag } from "@/components/commerce/PriceTag";
import { ActionForm } from "@/components/forms/ActionForm";
import { SetupRequired } from "@/components/states/SetupRequired";
import { applyCouponAction, removeCartLineAction, removeCouponAction, setCartQuantityAction } from "@/lib/actions/cart";
import { formatMoney } from "@/lib/format/money";
import { formMessages } from "@/lib/i18n/form-messages";
import { localeHref } from "@/lib/i18n/href";
import { viewCart, type CartView } from "@/lib/modules/pricing/cart";
import type { QuotedLine } from "@/lib/modules/pricing/quote";
import { cartOwner } from "@/lib/storefront/cart-owner";
import { loadStore, moneyFormat, shown, shownLang } from "@/lib/storefront/context";
import { localeOf } from "@/lib/storefront/page";
import { getPrincipal } from "@/lib/auth/server";

export async function generateMetadata({ params }: PageProps<"/[locale]/cart">): Promise<Metadata> {
  const locale = localeOf((await params).locale);
  if (!locale) return {};
  const t = await getTranslations({ locale, namespace: "store.cart" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function CartPage({ params, searchParams }: PageProps<"/[locale]/cart">) {
  const locale = localeOf((await params).locale);
  if (!locale) notFound();
  const store = await loadStore();
  if (!store.ready) return <SetupRequired locale={locale} status={store.status} />;
  const t = await getTranslations({ locale, namespace: "store.cart" });
  const common = await getTranslations({ locale, namespace: "common" });
  const messages = await formMessages(locale);
  const format = moneyFormat(store, locale);
  const money = (v: number) => formatMoney(v, format);
  const sp = await searchParams;
  const zones = store.settings.delivery.zones.filter((z) => z.enabled);
  const zoneId = typeof sp.zone === "string" && zones.some((z) => z.id === sp.zone) ? sp.zone : zones.length === 1 ? zones[0]!.id : undefined;
  const owner = await cartOwner(store.db);
  const view: CartView = owner ? await viewCart(store.db, owner, zoneId ? { zoneId } : {}) : { cart: null, quote: null, count: 0 };
  const signedIn = Boolean(await getPrincipal());

  if (!view.quote || (view.quote.lines.length === 0 && view.quote.unavailable.length === 0)) {
    return (
      <div className="listing cart-page" data-testid="cart" data-state="empty">
        <h1 className="font-display listing-title">{t("title")}</h1>
        <div className="listing-empty" data-testid="cart-empty">
          <p className="listing-empty-title">{t("empty")}</p>
          <p className="field-hint">{t("emptyText")}</p>
          <Link className="btn btn-primary" href={localeHref(locale, "/categories")}>
            {t("browse")}
          </Link>
        </div>
      </div>
    );
  }

  const { quote } = view;
  const priced = quote.priced;
  const pricedBy = new Map(priced.lines.map((l) => [l.variantId, l]));
  const savings = priced.lines.reduce((a, l) => a + (l.basePrice - l.unitPrice) * l.quantity, 0);
  const blocking = quote.unavailable.length > 0 || quote.lines.some((l) => l.notices.includes("out_of_stock") || l.notices.includes("insufficient_stock"));
  const couponProblem = priced.coupon && !priced.coupon.applied ? priced.coupon : null;
  const seen = new Map(view.cart!.lines.map((l) => [String(l.variantId), l.seenUnitPrice]));

  const notice = (l: QuotedLine, n: QuotedLine["notices"][number]) => {
    const was = seen.get(l.variantId);
    if (n === "insufficient_stock") return t("notices.insufficient_stock", { available: l.available });
    if (n === "price_up" || n === "price_down") return t(`notices.${n}`, { was: was !== undefined ? money(was) : "" });
    return t(`notices.${n}`);
  };

  const lineRow = (l: QuotedLine, available: boolean) => {
    const p = pricedBy.get(l.variantId);
    return (
      <li key={l.variantId} className="cart-line" data-testid="cart-line" data-variant={l.variantId} data-notices={l.notices.join(" ") || undefined}>
        <div className="cart-line-head">
          <Link className="cart-line-name" href={localeHref(locale, `/p/${l.product.slug}`)} lang={shownLang(l.product.name, locale)}>
            {shown(l.product.name, locale)}
          </Link>
          <p className="cart-line-variant" lang={shownLang(l.variant.title, locale)}>
            {shown(l.variant.title, locale)}
          </p>
        </div>
        {p ? (
          <div className="cart-line-price">
            <PriceTag amountMinor={p.unitPrice} compareAtMinor={p.unitPrice < p.basePrice ? p.basePrice : p.compareAt} format={format} labels={{ now: common("nowPrice"), was: common("wasPrice") }} />
            {p.appliedPromotion ? <span className="cart-chip">{p.appliedPromotion.kind === "flash_sale" ? t("flash") : t("sale")}</span> : null}
            {p.tierMinQty ? <span className="cart-chip">{t("tier", { qty: p.tierMinQty })}</span> : null}
            <p className="cart-line-total">
              {t("lineTotal")}: <strong>{money(p.lineTotal)}</strong>
            </p>
          </div>
        ) : null}
        {l.notices.length ? (
          <ul className="cart-notices" role="note">
            {l.notices.map((n) => (
              <li key={n} data-notice={n}>
                {notice(l, n)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="cart-line-actions">
          {available ? (
            <ActionForm
              action={setCartQuantityAction}
              hidden={{ variantId: l.variantId }}
              fields={[{ name: "quantity", label: t("quantity"), inputMode: "numeric", defaultValue: String(l.quantity), required: true, maxLength: 2, autoComplete: "off" }]}
              messages={messages}
              submitLabel={t("update")}
              pendingLabel={t("update")}
              variant="secondary"
              layout="inline"
            />
          ) : null}
          <ActionForm action={removeCartLineAction} hidden={{ variantId: l.variantId }} fields={[]} messages={messages} submitLabel={t("remove")} pendingLabel={t("remove")} variant="secondary" layout="inline" />
        </div>
      </li>
    );
  };

  return (
    <div className="listing cart-page" data-testid="cart" data-state="items">
      <h1 className="font-display listing-title">{t("title")}</h1>
      <p className="listing-intro">{t("items", { count: view.count })}</p>
      <div className="cart-grid">
        <div>
          <ul className="cart-lines">{quote.lines.map((l) => lineRow(l, true))}</ul>
          {quote.unavailable.length ? (
            <section aria-labelledby="cart-unavailable">
              <h2 id="cart-unavailable" className="pdp-h2">
                {t("unavailableTitle")}
              </h2>
              <ul className="cart-lines">{quote.unavailable.map((l) => lineRow(l, false))}</ul>
            </section>
          ) : null}
        </div>
        <aside className="cart-summary" aria-labelledby="cart-summary-title" data-testid="cart-summary">
          <h2 id="cart-summary-title" className="pdp-h2">
            {t("summary")}
          </h2>
          {priced.coupon?.applied ? (
            <div className="cart-coupon" data-testid="coupon-applied">
              <p>{t("couponApplied", { code: priced.coupon.code })}</p>
              <ActionForm action={removeCouponAction} fields={[]} messages={messages} submitLabel={t("couponRemove")} pendingLabel={t("couponRemove")} variant="secondary" layout="inline" />
            </div>
          ) : (
            <div className="cart-coupon">
              {couponProblem ? (
                <p className="cart-coupon-problem" role="note" data-testid="coupon-problem">
                  {t(`couponProblems.${couponProblem.problem}`, { missing: couponProblem.missing !== undefined ? money(couponProblem.missing) : "" })}
                </p>
              ) : null}
              <ActionForm action={applyCouponAction} testId="coupon-form" fields={[{ name: "code", label: t("coupon"), maxLength: 30, autoComplete: "off", defaultValue: couponProblem?.code ?? "" }]} messages={messages} submitLabel={t("couponApply")} pendingLabel={t("couponApply")} variant="secondary" layout="inline" />
              {couponProblem ? <ActionForm action={removeCouponAction} fields={[]} messages={messages} submitLabel={t("couponRemove")} pendingLabel={t("couponRemove")} variant="secondary" layout="inline" /> : null}
            </div>
          )}
          {zones.length > 1 ? (
            <form className="cart-zone" method="get" action={localeHref(locale, "/cart")}>
              <label className="field-label" htmlFor="cart-zone">
                {t("zone")}
              </label>
              <select id="cart-zone" name="zone" className="field-input" defaultValue={zoneId ?? ""}>
                <option value="">{t("zoneChoose")}</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {shown(z.name, locale)} · {money(z.fee.amountMinor)}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-secondary">
                {t("zoneShow")}
              </button>
            </form>
          ) : null}
          <dl className="cart-totals">
            <div>
              <dt>{t("subtotal")}</dt>
              <dd data-testid="cart-subtotal">{money(priced.merchandise)}</dd>
            </div>
            {savings > 0 ? (
              <div>
                <dt>{t("savings")}</dt>
                <dd>−{money(savings)}</dd>
              </div>
            ) : null}
            {priced.coupon?.applied && priced.coupon.discount > 0 ? (
              <div>
                <dt>{t("couponDiscount")}</dt>
                <dd data-testid="cart-coupon-discount">−{money(priced.coupon.discount)}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("delivery")}</dt>
              <dd data-testid="cart-delivery">{priced.delivery ? (priced.delivery.fee === 0 ? t("deliveryFree") : money(priced.delivery.fee)) : t("deliveryLater")}</dd>
            </div>
            <div className="cart-total">
              <dt>{t("total")}</dt>
              <dd data-testid="cart-total">{money(priced.total)}</dd>
            </div>
          </dl>
          {priced.delivery?.missingForFree ? <p className="field-hint">{t("freeMissing", { amount: money(priced.delivery.missingForFree) })}</p> : null}
          {!store.settings.features.checkout ? (
            <p className="pdp-notice" role="note" data-testid="checkout-off">
              {t("checkoutOff")}
            </p>
          ) : blocking ? (
            <p className="pdp-notice" role="note">
              {t("checkoutFix")}
            </p>
          ) : (
            <Link className="btn btn-primary cart-checkout" href={localeHref(locale, "/checkout")} data-testid="checkout-link">
              {t("checkout")}
            </Link>
          )}
          <p className="field-hint">{t("priceNote")}</p>
          {!signedIn ? (
            <p className="field-hint">
              <Link className="prose-link" href={`${localeHref(locale, "/login")}?next=${encodeURIComponent(localeHref(locale, "/cart"))}`}>
                {t("signInToSave")}
              </Link>
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
