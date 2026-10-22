// Order lines and totals from the order's own snapshot (B7). Never re-reads product prices: what the
// customer agreed to at placement is what is shown, on the account page, the success page and admin.
import type { MoneyFormat } from "@/lib/format/money";
import { formatMoney } from "@/lib/format/money";
import type { OrderDoc } from "@/lib/modules/orders/schema";
import { shown, shownLang } from "@/lib/storefront/context";

export interface OrderSummaryLabels {
  subtotal: string;
  savings: string;
  coupon: string;
  delivery: string;
  grandTotal: string;
  free: string;
  qty: (qty: number) => string;
}

export function OrderSummary({ order, locale, format, labels }: { order: OrderDoc; locale: "bn" | "en"; format: MoneyFormat; labels: OrderSummaryLabels }) {
  const money = (v: number) => formatMoney(v, format);
  return (
    <>
      <ul className="cart-lines" data-testid="order-lines">
        {order.lines.map((l) => (
          <li key={l.lineId} className="cart-line" data-line-status={l.status}>
            <p className="cart-line-name" lang={shownLang(l.name, locale)}>
              {shown(l.name, locale)}
            </p>
            <p className="cart-line-variant">
              {shown(l.variantTitle, locale)} · {money(l.unitPrice)} {labels.qty(l.quantity)}
            </p>
            <p className="cart-line-total">
              <strong>{money(l.lineTotal)}</strong>
            </p>
          </li>
        ))}
      </ul>
      <dl className="cart-totals order-totals">
        <div>
          <dt>{labels.subtotal}</dt>
          <dd>{money(order.totals.merchandise)}</dd>
        </div>
        {order.totals.savings > 0 ? (
          <div>
            <dt>{labels.savings}</dt>
            <dd>−{money(order.totals.savings)}</dd>
          </div>
        ) : null}
        {order.totals.coupon > 0 ? (
          <div>
            <dt>
              {labels.coupon}
              {order.coupon ? <span lang="en"> ({order.coupon.code})</span> : null}
            </dt>
            <dd>−{money(order.totals.coupon)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{labels.delivery}</dt>
          <dd>{order.totals.delivery === 0 ? labels.free : money(order.totals.delivery)}</dd>
        </div>
        <div className="cart-total">
          <dt>{labels.grandTotal}</dt>
          <dd data-testid="order-total">{money(order.totals.grandTotal)}</dd>
        </div>
      </dl>
    </>
  );
}
