// Tier: build. Use-when: the admin order page's shipment section (B8). Avoid-when: customer pages
// (the account order page renders its own tracking). Reduced-motion: no motion. Touch: 44 px
// buttons and fields. Server component.
// Shows the order's shipment, its courier status and checkpoints, and only the steps the shipment
// state machine allows and the staff member's role can take. The actions check the capability again
// on the server; hiding a button here is only a convenience. Unavailable couriers are listed with
// the reason; nothing is shown as booked unless the courier or staff recorded it.
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FormMessages } from "@/components/forms/ActionForm";
import { createShipmentAction, inspectRtoLineAction, refreshCourierStatusAction, retryBookingAction, shipmentStepAction, updateTrackingAction } from "@/lib/actions/admin-fulfilment";
import { money } from "@/lib/admin/page";
import { courierAvailability } from "@/lib/adapters/courier/index";
import type { Principal } from "@/lib/modules/identity/principal";
import { decideAccess } from "@/lib/modules/identity/principal";
import type { OrderDoc } from "@/lib/modules/orders/schema";
import type { ShipmentDoc } from "@/lib/modules/fulfilment/schema";
import { SHIPMENT_TRANSITIONS, SHIPPABLE_ORDER, STAFF_STEPS } from "@/lib/modules/fulfilment/shipments";

const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
const DANGER = new Set(["delivery_failed", "cancelled"]);

export async function ShipmentPanel({ order, shipments, principal, messages }: { order: OrderDoc; shipments: ShipmentDoc[]; principal: Principal; messages: FormMessages }) {
  const t = await getTranslations({ locale: "en", namespace: "admin.fulfilment" });
  const canWrite = decideAccess(principal, "fulfilment.write").result === "allowed";
  const canInspect = decideAccess(principal, "returns.process").result === "allowed";
  const couriers = courierAvailability();
  const current = shipments.find((s) => s.open) ?? (order.status === "returned_to_origin" ? shipments.find((s) => s.status === "returned") : undefined);
  const history = shipments.filter((s) => s !== current);
  const bookable = couriers.filter((c) => c.key === "manual" || (c.state === "available" && c.booking));
  const unavailable = couriers.filter((c) => c.key !== "manual" && !(c.state === "available" && c.booking));
  const courierName = (s: ShipmentDoc) => (s.courier === "manual" ? `${t("courierNames.manual")} · ${s.carrierName ?? ""}` : t(`courierNames.${s.courier}`));
  const code = (c: string) => (c.startsWith("courier:") ? `${t("courierReport")}: ${t(`courierStatus.${c.slice(8)}` as never)}` : c === "booking_failed" ? t("checkpointCodes.booking_failed") : t(`statuses.${c}` as never));

  return (
    <section className="admin-section" aria-labelledby="order-shipment" data-testid="shipment-panel">
      <h2 id="order-shipment" className="admin-section-title">
        {t("panelTitle")}
      </h2>
      {!canWrite ? <p className="field-hint">{t("panelReadOnly")}</p> : null}
      {current ? (
        <div data-testid="shipment-current" data-status={current.status} data-courier={current.courier}>
          <p className="record-chips">
            <StatusChip tone={current.status === "delivered" ? "published" : DANGER.has(current.status) || current.status === "returned" ? "archived" : "draft"} label={t(`statuses.${current.status}`)} />
            <span className="record-sub">{courierName(current)}</span>
          </p>
          {current.booking ? (
            <p className={current.booking.state === "failed" ? "pdp-notice" : "field-hint"} role={current.booking.state === "failed" ? "alert" : "status"} data-testid="shipment-booking" data-state={current.booking.state}>
              {t(`booking.${current.booking.state}`)}
              {current.booking.error ? ` ${current.booking.error}` : ""}
            </p>
          ) : null}
          <dl className="ledger">
            <div className="ledger-row">
              <dt>{t("consignment")}</dt>
              <dd data-testid="shipment-consignment">{current.consignmentId ?? "–"}</dd>
            </div>
            {current.trackingCode ? (
              <div className="ledger-row">
                <dt>{t("tracking")}</dt>
                <dd>{current.trackingCode}</dd>
              </div>
            ) : null}
            {current.trackingUrl ? (
              <div className="ledger-row">
                <dt>{t("link")}</dt>
                <dd>
                  <a className="prose-link" href={current.trackingUrl} rel="noopener noreferrer nofollow" target="_blank">
                    {current.trackingUrl}
                  </a>
                </dd>
              </div>
            ) : null}
            <div className="ledger-row">
              <dt>{t("invoice")}</dt>
              <dd>{current.invoice}</dd>
            </div>
            <div className="ledger-row">
              <dt>{t("cod")}</dt>
              <dd>{money(current.codAmount)}</dd>
            </div>
            {current.courier !== "manual" ? (
              <>
                <div className="ledger-row">
                  <dt>{t("courierReport")}</dt>
                  <dd data-testid="shipment-courier-status">{current.courierStatus ? `${t(`courierStatus.${current.courierStatus.code}`)} (${current.courierStatus.raw})` : "–"}</dd>
                </div>
                <div className="ledger-row">
                  <dt>{t("lastSync")}</dt>
                  <dd data-testid="shipment-last-sync">{current.lastSync ? `${date.format(current.lastSync.at)} · ${current.lastSync.ok ? t("syncOk") : t("syncFailed", { error: current.lastSync.error ?? "" })}` : t("never")}</dd>
                </div>
              </>
            ) : null}
            {current.statusReason ? (
              <div className="ledger-row">
                <dt>{t("reason")}</dt>
                <dd>{current.statusReason}</dd>
              </div>
            ) : null}
          </dl>
          {canWrite && current.open ? <ShipmentActions s={current} t={t} messages={messages} /> : null}
          {current.status === "returned" ? <RtoInspection order={order} s={current} canInspect={canInspect} t={t} messages={messages} /> : null}
          <h3 className="admin-subtitle">{t("checkpoints")}</h3>
          <ol className="order-timeline" data-testid="shipment-checkpoints">
            {current.checkpoints.map((c, i) => (
              <li key={i}>
                {code(c.code)} · {t(`source.${c.source}`)} <time dateTime={c.at.toISOString()}>{date.format(c.at)}</time>
                {c.note ? ` · ${c.note}` : ""}
              </li>
            ))}
          </ol>
        </div>
      ) : SHIPPABLE_ORDER.includes(order.status) ? (
        <>
          <p className="field-hint">{t("panelNone")}</p>
          {unavailable.length > 0 ? (
            <ul className="field-hint" data-testid="courier-unavailable">
              {unavailable.map((c) => (
                <li key={c.key} data-courier={c.key} data-state={c.state}>
                  {t("courierUnavailable", { courier: t(`courierNames.${c.key}`), reason: c.reason ?? t(`courierStates.${c.state}`) })}
                </li>
              ))}
            </ul>
          ) : null}
          {canWrite ? (
            <ActionForm
              action={createShipmentAction}
              testId="shipment-create"
              hidden={{ orderId: String(order._id) }}
              layout="grid"
              fields={[
                { name: "courier", label: t("courier"), type: "select", required: true, options: bookable.map((c) => ({ value: c.key, label: t(`courierNames.${c.key}`) })), defaultValue: "manual" },
                { name: "carrierName", label: t("carrierName"), hint: t("carrierHint"), maxLength: 80 },
                { name: "consignmentId", label: t("consignmentId"), hint: t("consignmentHint"), maxLength: 80 },
                { name: "trackingCode", label: t("trackingCode"), maxLength: 80 },
                { name: "trackingUrl", label: t("trackingUrl"), hint: t("trackingUrlHint"), type: "url", maxLength: 500, wide: true },
                { name: "note", label: t("note"), maxLength: 200, wide: true },
              ]}
              messages={messages}
              submitLabel={t("createSubmit")}
              pendingLabel={t("createSubmit")}
            />
          ) : null}
        </>
      ) : (
        <p className="field-hint">{shipments.length === 0 ? t("panelNotYet") : t("noNext")}</p>
      )}
      {history.length > 0 ? (
        <>
          <h3 className="admin-subtitle">{t("history")}</h3>
          <ul className="order-timeline" data-testid="shipment-history">
            {history.map((s) => (
              <li key={String(s._id)}>
                {courierName(s)} · {s.consignmentId ?? "–"} · {t(`statuses.${s.status}`)} · {date.format(s.updatedAt)}
                {s.statusReason ? ` · ${s.statusReason}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"admin.fulfilment">>>;

function ShipmentActions({ s, t, messages }: { s: ShipmentDoc; t: T; messages: FormMessages }) {
  const steps = SHIPMENT_TRANSITIONS[s.status].filter((to) => STAFF_STEPS.includes(to));
  const hidden = { shipmentId: String(s._id), version: String(s.version) };
  const manual = s.courier === "manual";
  const consignmentEditable = manual || (s.status === "draft" && s.booking?.state === "failed");
  const fields = [
    ...(manual ? ["carrierName"] : []),
    ...(consignmentEditable && (s.status === "draft" || s.status === "booked") ? ["consignmentId"] : []),
    ...(consignmentEditable ? ["trackingCode"] : []),
    "trackingUrl",
  ];
  const label: Record<string, string> = { carrierName: t("carrierName"), consignmentId: t("consignmentId"), trackingCode: t("trackingCode"), trackingUrl: t("trackingUrl") };
  return (
    <>
      {steps.length > 0 ? (
        <div className="admin-actions" data-testid="shipment-actions">
          {steps.map((to) => {
            const blocked = to === "handed_over" && !s.consignmentId;
            const hint = (t.has(`stepHints.${to}` as never) ? t(`stepHints.${to}` as never) : undefined) as string | undefined;
            return (
              <ActionForm
                key={to}
                action={shipmentStepAction}
                testId={`shipment-to-${to}`}
                hidden={{ ...hidden, to }}
                fields={DANGER.has(to) ? [{ name: "reason", label: t("reason"), hint: to === "delivery_failed" ? t("reasonHint") : (hint ?? ""), required: true, maxLength: 500 }] : []}
                messages={messages}
                submitLabel={t(`steps.${to}` as never)}
                pendingLabel={t(`steps.${to}` as never)}
                variant={DANGER.has(to) ? "danger" : "primary"}
                layout={DANGER.has(to) ? "stack" : "inline"}
              >
                {blocked ? <p className="field-hint">{t("consignmentHint")}</p> : !DANGER.has(to) && hint ? <p className="field-hint">{hint}</p> : null}
              </ActionForm>
            );
          })}
        </div>
      ) : null}
      {s.courier !== "manual" && s.status === "draft" && s.booking?.state === "failed" ? (
        <ActionForm action={retryBookingAction} testId="shipment-retry" hidden={hidden} fields={[]} messages={messages} submitLabel={t("retry")} pendingLabel={t("retry")} variant="secondary" layout="inline" />
      ) : null}
      {s.courier !== "manual" && s.consignmentId ? (
        <ActionForm action={refreshCourierStatusAction} testId="shipment-refresh" hidden={{ shipmentId: String(s._id) }} fields={[]} messages={messages} submitLabel={t("refresh")} pendingLabel={t("refresh")} variant="secondary" layout="inline" />
      ) : null}
      <h3 className="admin-subtitle">{t("editTracking")}</h3>
      <ActionForm
        action={updateTrackingAction}
        testId="shipment-tracking"
        hidden={{ ...hidden, fields: fields.join(",") }}
        layout="grid"
        fields={fields.map((name) => ({
          name,
          label: label[name]!,
          defaultValue: (s as unknown as Record<string, string | undefined>)[name] ?? "",
          maxLength: name === "trackingUrl" ? 500 : 80,
          ...(name === "trackingUrl" ? { type: "url" as const, wide: true, hint: t("trackingUrlHint") } : {}),
          ...(name === "consignmentId" ? { hint: t("consignmentHint") } : {}),
        }))}
        messages={messages}
        submitLabel={t("editSubmit")}
        pendingLabel={t("editSubmit")}
        variant="secondary"
      />
    </>
  );
}

function RtoInspection({ order, s, canInspect, t, messages }: { order: OrderDoc; s: ShipmentDoc; canInspect: boolean; t: T; messages: FormMessages }) {
  const done = new Map((s.rtoInspection ?? []).map((r) => [r.lineId, r]));
  const lines = order.lines.filter((l) => l.status !== "cancelled");
  return (
    <div data-testid="rto-inspection">
      <h3 className="admin-subtitle">{t("rtoTitle")}</h3>
      <p className="field-hint">{t("rtoIntro")}</p>
      <ul className="admin-list">
        {lines.map((l) => {
          const r = done.get(l.lineId);
          return (
            <li key={l.lineId} data-testid={`rto-line-${l.lineId}`} data-outcome={r?.outcome ?? ""}>
              <p>
                {l.name.en} · {l.variantTitle.en} · {l.sku} · ×{l.quantity}
              </p>
              {r ? (
                <p className="field-hint">
                  {t("rtoDone", { outcome: t(`outcomes.${r.outcome}`), qty: r.qty })}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              ) : canInspect ? (
                <ActionForm
                  action={inspectRtoLineAction}
                  testId={`rto-inspect-${l.lineId}`}
                  hidden={{ shipmentId: String(s._id), lineId: l.lineId }}
                  layout="grid"
                  fields={[
                    { name: "outcome", label: t("outcome"), type: "select", required: true, options: [{ value: "", label: "–" }, { value: "restock", label: t("outcomes.restock") }, { value: "write_off", label: t("outcomes.write_off") }] },
                    { name: "note", label: t("inspectNote"), maxLength: 300 },
                  ]}
                  messages={messages}
                  submitLabel={t("rtoSubmit")}
                  pendingLabel={t("rtoSubmit")}
                  variant="secondary"
                />
              ) : (
                <p className="field-hint">{t("deny")}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
