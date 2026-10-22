// /admin/shipments (B8, fulfilment.write). Every shipment, newest first, filterable by status, with
// what each courier can do on this deployment (configured, not configured, blocked, not in this
// build). Steps are taken on the order page's shipment panel.
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { adminPage, count, searchParam } from "@/lib/admin/page";
import { getAdminLocale } from "@/lib/auth/server";
import { courierAvailability } from "@/lib/adapters/courier/index";
import { SHIPMENT_STATUSES, SHIPMENTS, type ShipmentDoc } from "@/lib/modules/fulfilment/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.fulfilment" });
  return { title: t("shipmentsTitle"), robots: { index: false, follow: false } };
}

const TONE = { available: "published", not_configured: "draft", blocked: "archived", unsupported: "archived" } as const;

export default async function AdminShipmentsPage({ searchParams }: PageProps<"/admin/shipments">) {
  const { locale, db } = await adminPage("/admin/shipments");
  const t = await getTranslations({ locale, namespace: "admin.fulfilment" });
  const wanted = searchParam((await searchParams).status);
  const status = SHIPMENT_STATUSES.find((s) => s === wanted);
  const shipments = await db
    .collection<ShipmentDoc>(SHIPMENTS)
    .find(status ? { status } : {}, { projection: { orderNumber: 1, courier: 1, carrierName: 1, consignmentId: 1, status: 1, open: 1, courierStatus: 1, booking: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();
  const couriers = courierAvailability();
  const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });

  return (
    <div className="admin-page" data-testid="admin-shipments">
      <h1 className="font-display admin-title">{t("shipmentsTitle")}</h1>
      <p className="admin-intro">{t("shipmentsIntro")}</p>
      <section className="admin-section" aria-labelledby="couriers">
        <h2 id="couriers" className="admin-section-title">
          {t("couriers")}
        </h2>
        <ul className="courier-states" data-testid="courier-states">
          {couriers.map((c) => (
            <li key={c.key} data-courier={c.key} data-state={c.state}>
              <strong>{t(`courierNames.${c.key}`)}</strong>
              <StatusChip tone={TONE[c.state]} label={t(`courierStates.${c.state}`)} />
              {c.key !== "manual" && c.state === "available" ? <span className="record-sub">{c.webhook ? t("webhookOn") : t("webhookOff")}</span> : null}
              {c.reason ? <span className="field-hint">{c.reason}</span> : null}
            </li>
          ))}
        </ul>
        {couriers.every((c) => c.key === "manual" || c.state !== "available") ? <p className="field-hint">{t("manualOnly")}</p> : null}
      </section>
      <form className="cart-zone admin-filter" method="get" action="/admin/shipments">
        <label className="field-label" htmlFor="shipment-status-filter">
          {t("filterStatus")}
        </label>
        <select id="shipment-status-filter" name="status" className="field-input" defaultValue={status ?? ""}>
          <option value="">{t("filterAll")}</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-secondary">
          {t("filterApply")}
        </button>
      </form>
      <section className="admin-section" aria-labelledby="shipments-list">
        <h2 id="shipments-list" className="admin-section-title">
          {t("shipmentsTitle")} ({count(shipments.length)})
        </h2>
        {shipments.length === 0 ? (
          <div className="admin-empty" data-testid="shipments-empty">
            <p className="admin-empty-title">{status ? t("emptyFiltered") : t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {shipments.map((s) => (
              <li key={String(s._id)} className="staff-row" data-testid="shipment-row" data-status={s.status}>
                <p className="staff-name">
                  <Link href={`/admin/orders/${s.orderNumber}`}>{s.orderNumber}</Link>
                </p>
                <p className="record-chips">
                  <StatusChip tone={s.status === "delivered" ? "published" : s.open ? "draft" : "archived"} label={t(`statuses.${s.status}`)} />
                  <span className="record-sub">{s.courier === "manual" ? `${t("courierNames.manual")} · ${s.carrierName ?? ""}` : t(`courierNames.${s.courier}`)}</span>
                  <span className="record-sub">
                    {t("colConsignment")}: {s.consignmentId ?? "–"}
                  </span>
                  {s.courierStatus ? (
                    <span className="record-sub">
                      {t("colCourierStatus")}: {t(`courierStatus.${s.courierStatus.code}`)}
                    </span>
                  ) : null}
                  {s.booking?.state === "failed" ? <span className="record-sub record-warn">{t("booking.failed")}</span> : null}
                  <span className="record-sub">{date.format(s.updatedAt)}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
