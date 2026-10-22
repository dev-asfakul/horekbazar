// /admin/returns/[returnId] (B8, returns.process). One return: the customer's reason and items, the
// history, and the next step the returns state machine allows: approve or reject, mark received,
// inspect every item (restock or write off), apply the result to stock once, record the refund.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm } from "@/components/forms/ActionForm";
import { inspectReturnAction, recordRefundAction, returnStepAction, settleReturnAction } from "@/lib/actions/admin-fulfilment";
import { adminPage, money } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { RETURNS, type ReturnDoc } from "@/lib/modules/fulfilment/schema";
import { RETURN_TRANSITIONS, refundCap, SIMPLE_STEPS } from "@/lib/modules/fulfilment/returns";
import { ORDERS, type OrderDoc } from "@/lib/modules/orders/schema";

export async function generateMetadata({ params }: PageProps<"/admin/returns/[returnId]">): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.fulfilment" });
  return { title: `${t("returnsTitle")} ${(await params).returnId.slice(-6)}`, robots: { index: false, follow: false } };
}

export default async function AdminReturnPage({ params }: PageProps<"/admin/returns/[returnId]">) {
  const { returnId } = await params;
  const { locale, db, messages } = await adminPage("/admin/returns", `/admin/returns/${returnId}`);
  if (!ObjectId.isValid(returnId) || returnId.length !== 24) notFound();
  const r = await db.collection<ReturnDoc>(RETURNS).findOne({ _id: new ObjectId(returnId) });
  if (!r) notFound();
  const order = await db.collection<OrderDoc>(ORDERS).findOne({ _id: r.orderId }, { projection: { orderNumber: 1, lines: 1 } });
  if (!order) notFound();
  const t = await getTranslations({ locale, namespace: "admin.fulfilment" });
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  const hidden = { returnId: String(r._id), version: String(r.version) };
  const steps = RETURN_TRANSITIONS[r.status].filter((s) => SIMPLE_STEPS.includes(s));
  const lineName = (lineId: string) => {
    const l = order.lines.find((x) => x.lineId === lineId);
    return l ? `${l.name.en} · ${l.variantTitle.en} · ${l.sku}` : lineId;
  };
  const cap = refundCap(order, r);

  return (
    <div className="admin-page" data-testid="admin-return" data-status={r.status}>
      <p>
        <Link className="prose-link" href="/admin/returns">
          {t("returnBack")}
        </Link>
      </p>
      <h1 className="font-display admin-title">{t("returnTitle", { number: r.orderNumber })}</h1>
      <p className="record-chips">
        <StatusChip tone={r.status === "requested" ? "draft" : ["rejected", "closed"].includes(r.status) ? "archived" : "published"} label={t(`returnStatuses.${r.status}`)} />
        <span className="record-sub">{date.format(r.requestedAt)}</span>
        <Link className="prose-link" href={`/admin/orders/${r.orderNumber}`}>
          {t("orderLink")}
        </Link>
      </p>
      <section className="admin-section" aria-labelledby="return-lines">
        <h2 id="return-lines" className="admin-section-title">
          {t("returnLines")}
        </h2>
        <p>
          {t("returnReason")}: {r.reason}
        </p>
        <ul className="admin-list" data-testid="return-lines">
          {r.lines.map((l) => (
            <li key={l.lineId} data-outcome={l.outcome ?? ""}>
              {lineName(l.lineId)} · ×{l.qty}
              {l.outcome ? ` · ${t(`outcomes.${l.outcome}`)}` : ""}
              {l.note ? ` · ${l.note}` : ""}
            </li>
          ))}
        </ul>
        {r.refund ? (
          <p data-testid="return-refund">
            {t("refund")}: {money(r.refund.amount)} · {r.refund.method === "store_reward" ? r.refund.method : t(`refundMethods.${r.refund.method}`)}
            {r.refund.reference ? ` · ${r.refund.reference}` : ""}
          </p>
        ) : null}
      </section>
      <section className="admin-section" aria-labelledby="return-next">
        <h2 id="return-next" className="admin-section-title">
          {t("colStatus")}
        </h2>
        {RETURN_TRANSITIONS[r.status].length === 0 ? <p className="field-hint">{t("noNext")}</p> : null}
        {steps.length > 0 ? (
          <div className="admin-actions" data-testid="return-actions">
            {steps.map((to) => (
              <ActionForm
                key={to}
                action={returnStepAction}
                testId={`return-to-${to}`}
                hidden={{ ...hidden, to }}
                fields={to === "rejected" || to === "closed" ? [{ name: "note", label: t("returnNote"), hint: t("returnNoteHint"), required: true, maxLength: 500 }] : []}
                messages={messages}
                submitLabel={t(`returnSteps.${to}` as never)}
                pendingLabel={t(`returnSteps.${to}` as never)}
                variant={to === "rejected" || to === "closed" ? "danger" : "primary"}
                layout={to === "rejected" || to === "closed" ? "stack" : "inline"}
              />
            ))}
          </div>
        ) : null}
        {r.status === "received" ? (
          <>
            <h3 className="admin-subtitle">{t("inspectTitle")}</h3>
            <ActionForm
              action={inspectReturnAction}
              testId="return-inspect"
              hidden={{ ...hidden, lineIds: r.lines.map((l) => l.lineId).join(",") }}
              layout="grid"
              fields={[
                ...r.lines.flatMap((l) => [
                  { name: `outcome_${l.lineId}`, label: `${t("outcome")}: ${lineName(l.lineId)} ×${l.qty}`, type: "select" as const, required: true, options: [{ value: "", label: "–" }, { value: "restock", label: t("outcomes.restock") }, { value: "write_off", label: t("outcomes.write_off") }] },
                  { name: `note_${l.lineId}`, label: t("lineNote", { name: lineName(l.lineId) }), maxLength: 300 },
                ]),
                { name: "note", label: t("inspectNote"), maxLength: 500, wide: true },
              ]}
              messages={messages}
              submitLabel={t("inspectSubmit")}
              pendingLabel={t("inspectSubmit")}
            />
          </>
        ) : null}
        {r.status === "inspected" ? (
          <>
            <h3 className="admin-subtitle">{t("settleTitle")}</h3>
            <p className="field-hint">{t("settleIntro")}</p>
            <ActionForm action={settleReturnAction} testId="return-settle" hidden={hidden} fields={[]} messages={messages} submitLabel={t("settleSubmit")} pendingLabel={t("settleSubmit")} layout="inline" />
          </>
        ) : null}
        {r.status === "restocked" || r.status === "written_off" ? (
          <>
            <h3 className="admin-subtitle">{t("refundTitle")}</h3>
            <p className="field-hint">{t("refundIntro")}</p>
            <ActionForm
              action={recordRefundAction}
              testId="return-refund-form"
              hidden={hidden}
              layout="grid"
              fields={[
                { name: "method", label: t("refundMethod"), type: "select", required: true, options: [{ value: "", label: "–" }, ...(["bkash", "nagad", "bank"] as const).map((m) => ({ value: m, label: t(`refundMethods.${m}`) }))] },
                { name: "amount", label: t("refundAmount"), type: "number", inputMode: "decimal", required: true, hint: t("refundCap", { amount: money(cap) }) },
                { name: "reference", label: t("refundReference"), maxLength: 100, wide: true },
              ]}
              messages={messages}
              submitLabel={t("refundTitle")}
              pendingLabel={t("refundTitle")}
            />
          </>
        ) : null}
      </section>
      <section className="admin-section" aria-labelledby="return-history">
        <h2 id="return-history" className="admin-section-title">
          {t("returnHistory")}
        </h2>
        <ol className="order-timeline">
          {r.history.map((h, i) => (
            <li key={i}>
              {t(`returnStatuses.${h.to}`)} · {h.by.type} <time dateTime={h.at.toISOString()}>{date.format(h.at)}</time>
              {h.note ? ` · ${h.note}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
