// /admin/settings/delivery (B4, delivery.write). Delivery zones with a fee and an estimate. Fees are
// owner values (no zone or fee is invented); mapping areas to zones waits for D12 (location dataset).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusChip } from "@/components/admin/RecordBits";
import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import { removeDeliveryZoneAction, upsertDeliveryZoneAction } from "@/lib/actions/merch";
import { takaText } from "@/lib/actions/staff-action";
import { adminPage, lt, money } from "@/lib/admin/page";
import { localizedFields, productFields } from "@/lib/admin/forms";
import { getAdminLocale } from "@/lib/auth/server";
import type { DeliveryZone } from "@/lib/modules/settings/schema";
import { getSettings } from "@/lib/modules/settings/settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getAdminLocale(), namespace: "admin.delivery" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function AdminDeliveryPage() {
  const { locale, db, messages } = await adminPage("/admin/settings/delivery");
  const t = await getTranslations({ locale, namespace: "admin.delivery" });
  const c = await getTranslations({ locale, namespace: "admin.catalogue" });
  const ct = c as unknown as Parameters<typeof productFields>[0];
  const s = await getSettings(db);
  const zones = s.delivery.zones;
  const fieldsFor = (z?: DeliveryZone): FieldSpec[] => [
    ...(z ? [] : [{ name: "zoneId", label: t("zoneId"), hint: t("zoneIdHint"), required: true, maxLength: 40, autoComplete: "off" } satisfies FieldSpec]),
    ...localizedFields(ct, "name", c("fields.name"), z?.name, { required: true, max: 60 }),
    { name: "fee", label: t("fee"), hint: t("feeHint"), type: "number", required: true, defaultValue: z ? takaText(z.fee.amountMinor) : "" },
    ...localizedFields(ct, "estimate", t("estimate"), z?.estimate, { required: true, max: 80, hint: t("estimateHint") }),
    { name: "enabled", label: t("enabled"), type: "checkbox", defaultValue: z ? (z.enabled ? "on" : "") : "on", wide: true },
  ];
  return (
    <div className="admin-page" data-testid="admin-delivery">
      <h1 className="font-display admin-title">{t("title")}</h1>
      <p className="admin-intro">{t("intro")}</p>
      <p className="admin-notice">{t("areasPending")}</p>
      <section className="admin-section" aria-labelledby="zones-title">
        <h2 id="zones-title" className="admin-section-title">
          {t("zonesTitle")}
        </h2>
        {zones.length === 0 ? (
          <div className="admin-empty" data-testid="zones-empty">
            <p className="admin-empty-title">{t("empty")}</p>
          </div>
        ) : (
          <ul className="staff-rows">
            {zones.map((z) => (
              <li key={z.id} className="staff-row" data-zone={z.id}>
                <p className="staff-name">
                  {lt(z.name, locale)} · {money(z.fee.amountMinor)}
                </p>
                <p className="record-chips">
                  <StatusChip tone={z.enabled ? "active" : "archived"} label={z.enabled ? t("on") : t("off")} />
                  <span className="record-sub">{lt(z.estimate, locale)}</span>
                  <span className="record-sub" lang="en">
                    {z.id}
                  </span>
                </p>
                <details className="staff-manage">
                  <summary>{c("manage")}</summary>
                  <ActionForm action={upsertDeliveryZoneAction} layout="grid" hidden={{ version: String(s.version), zoneId: z.id }} messages={messages} submitLabel={c("save")} pendingLabel={c("saving")} fields={fieldsFor(z)} />
                  <ActionForm action={removeDeliveryZoneAction} hidden={{ version: String(s.version), zoneId: z.id }} messages={messages} submitLabel={c("delete")} pendingLabel={c("saving")} variant="danger" fields={[{ name: "confirm", label: c("deleteConfirm"), type: "checkbox", required: true }]} />
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="admin-section" aria-labelledby="add-title">
        <h2 id="add-title" className="admin-section-title">
          {t("addTitle")}
        </h2>
        <ActionForm action={upsertDeliveryZoneAction} testId="zone-create-form" layout="grid" hidden={{ version: String(s.version), mode: "create" }} messages={messages} submitLabel={t("addSubmit")} pendingLabel={c("saving")} fields={fieldsFor()} />
      </section>
    </div>
  );
}
