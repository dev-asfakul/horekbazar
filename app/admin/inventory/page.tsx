// /admin/inventory (B4, inventory.adjust; a STEP_UP capability, so changes need two-step verification
// and a code within the last 10 minutes, checked again by each action). Receive and adjust stock
// per variant with a reason; every movement is a ledger row keyed by the form's adjustmentId, so a
// retried submission is not counted twice (domain-rules §4.1). Reconciliation only reports drift.
import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StepUpPanel } from "@/components/admin/StepUpPanel";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm } from "@/components/forms/ActionForm";
import { moveStockAction, setThresholdAction } from "@/lib/actions/catalogue";
import { adminPage, count, lt, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { formatDateTime } from "@/lib/format/datetime";
import { ledgerFor, reconcileStock } from "@/lib/modules/catalogue/inventory";
import { PRODUCTS, STOCK, VARIANTS, type ProductDoc, type StockDoc, type VariantDoc } from "@/lib/modules/catalogue/schema";
import { decideAccess } from "@/lib/modules/identity/principal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.inventory" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default async function AdminInventoryPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { locale, db, principal, messages } = await adminPage("/admin/inventory");
  const t = await getTranslations({ locale, namespace: "admin.inventory" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const steppedUp = decideAccess(principal, "inventory.adjust", { mutation: true }).result === "allowed";
  const q = searchParam(sp.q).trim().slice(0, 80);
  const low = searchParam(sp.low) === "1";

  let variants: VariantDoc[] = [];
  if (q || low) {
    const filter: Record<string, unknown> = {};
    if (q) {
      const re = new RegExp(escapeRegex(q), "i");
      const products = await db.collection<ProductDoc>(PRODUCTS).find({ $or: [{ "name.bn": re }, { "name.en": re }, { slug: re }] }, { projection: { _id: 1 } }).limit(50).toArray();
      filter.$or = [{ sku: re }, { productId: { $in: products.map((p) => p._id) } }];
    }
    if (low) {
      const lowStock = await db.collection<StockDoc>(STOCK).find({ $expr: { $lte: ["$available", "$lowStockThreshold"] } }, { projection: { variantId: 1 } }).limit(200).toArray();
      filter._id = { $in: lowStock.map((s) => s.variantId) };
    }
    variants = await db.collection<VariantDoc>(VARIANTS).find(filter).sort({ sku: 1 }).limit(25).toArray();
  }
  const ids = variants.map((v) => v._id);
  const [stock, products, drift] = await Promise.all([
    ids.length ? db.collection<StockDoc>(STOCK).find({ variantId: { $in: ids } }).toArray() : [],
    ids.length ? db.collection<ProductDoc>(PRODUCTS).find({ _id: { $in: [...new Set(variants.map((v) => v.productId))] } }, { projection: { name: 1 } }).toArray() : [],
    reconcileStock(db),
  ]);
  const stockOf = new Map(stock.map((s) => [String(s.variantId), s]));
  const productName = new Map(products.map((p) => [String(p._id), lt(p.name, locale)]));
  const ledgers = new Map(await Promise.all(variants.map(async (v) => [String(v._id), await ledgerFor(db, String(v._id), 10)] as const)));

  return (
    <div className="admin-page" data-testid="admin-inventory" data-stepped-up={steppedUp}>
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      {drift.length ? (
        <p className="admin-notice" data-testid="inventory-drift">
          {t("drift", { count: count(drift.length) })}
        </p>
      ) : (
        <p className="field-hint" data-testid="inventory-consistent">
          {t("consistent")}
        </p>
      )}

      <StepUpPanel principal={principal} steppedUp={steppedUp} locale={locale} messages={messages} />

      <form className="admin-filters" role="search" action="/admin/inventory" method="get" aria-label={t("find")}>
        <div className="field">
          <label className="field-label" htmlFor="iq">
            {t("search")}
          </label>
          <input id="iq" name="q" className="field-input" defaultValue={q} maxLength={80} placeholder={t("searchPlaceholder")} />
        </div>
        <label className="field-check" htmlFor="ilow">
          <input id="ilow" name="low" value="1" type="checkbox" className="field-checkbox" defaultChecked={low} />
          <span className="field-label">{t("lowOnly")}</span>
        </label>
        <div className="form-actions">
          <button type="submit" className="btn btn-secondary">
            {t("findSubmit")}
          </button>
        </div>
      </form>

      {!q && !low ? (
        <p className="field-hint">{t("prompt")}</p>
      ) : variants.length === 0 ? (
        <div className="admin-empty" data-testid="inventory-empty">
          <p className="admin-empty-title">{t("empty")}</p>
        </div>
      ) : (
        <ul className="staff-rows" data-testid="inventory-rows">
          {variants.map((v) => {
            const s = stockOf.get(String(v._id));
            const isLow = s ? s.available <= s.lowStockThreshold : false;
            return (
              <li key={String(v._id)} className="staff-row" data-sku={v.sku}>
                <p className="staff-name">
                  {productName.get(String(v.productId))} · {lt(v.title, locale)} <span className="record-sub" lang="en">{v.sku}</span>
                </p>
                <p className="record-chips">
                  <span data-testid="stock-figures">{t("figures", { onHand: count(s?.onHand ?? 0), reserved: count(s?.reserved ?? 0), available: count(s?.available ?? 0) })}</span>
                  {isLow ? <StatusChip tone="warning" label={t("low")} /> : null}
                  <span className="record-sub">{t("threshold", { n: count(s?.lowStockThreshold ?? 0) })}</span>
                </p>
                {steppedUp ? (
                  <details className="staff-manage">
                    <summary>{t("change")}</summary>
                    <ActionForm
                      action={moveStockAction}
                      testId={`stock-form-${v.sku}`}
                      hidden={{ variantId: String(v._id), adjustmentId: randomUUID() }}
                      messages={messages}
                      submitLabel={t("save")}
                      pendingLabel={c("saving")}
                      fields={[
                        { name: "kind", label: t("kind"), type: "select", defaultValue: "receive", options: [{ value: "receive", label: t("receive") }, { value: "adjust", label: t("adjust") }] },
                        { name: "qty", label: t("qty"), hint: t("qtyHint"), type: "number", inputMode: "text", required: true },
                        { name: "reason", label: t("reason"), hint: t("reasonHint"), maxLength: 300 },
                      ]}
                    />
                    <ActionForm
                      action={setThresholdAction}
                      hidden={{ variantId: String(v._id) }}
                      messages={messages}
                      submitLabel={t("thresholdSave")}
                      pendingLabel={c("saving")}
                      variant="secondary"
                      fields={[{ name: "threshold", label: t("thresholdField"), type: "number", inputMode: "numeric", defaultValue: String(s?.lowStockThreshold ?? 0) }]}
                    />
                  </details>
                ) : null}
                {(ledgers.get(String(v._id)) ?? []).length ? (
                  <details className="staff-manage">
                    <summary>{t("history")}</summary>
                    <table className="ledger-table">
                      <caption className="sr-only">{t("historyCaption", { sku: v.sku })}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t("when")}</th>
                          <th scope="col">{t("kind")}</th>
                          <th scope="col" className="num">
                            {t("qty")}
                          </th>
                          <th scope="col" className="num">
                            {t("onHandAfter")}
                          </th>
                          <th scope="col">{t("reason")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgers.get(String(v._id))!.map((row) => (
                          <tr key={String(row._id)}>
                            <td>{formatDateTime(row.createdAt, locale)}</td>
                            <td>{t(`kinds.${row.kind}`)}</td>
                            <td className="num">{row.qty > 0 ? `+${row.qty}` : `\u2212${Math.abs(row.qty)}`}</td>
                            <td className="num">{count(row.onHandAfter)}</td>
                            <td>{row.reason ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
