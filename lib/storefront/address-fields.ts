// Address form fields shared by /account/addresses and /checkout (B7).
import type { FieldSpec } from "@/components/forms/ActionForm";
import { displayBdPhone } from "@/lib/modules/orders/addresses";
import type { AddressDoc } from "@/lib/modules/orders/schema";
import type { DeliveryZone } from "@/lib/modules/settings/schema";
import { shown } from "@/lib/storefront/context";

export function addressFields(t: (key: string) => string, zones: DeliveryZone[], locale: "bn" | "en", a?: AddressDoc): FieldSpec[] {
  return [
    { name: "label", label: t("label"), type: "select", defaultValue: a?.label ?? "home", options: (["home", "office", "other"] as const).map((k) => ({ value: k, label: t(`labels.${k}`) })) },
    { name: "name", label: t("name"), autoComplete: "name", required: true, maxLength: 80, defaultValue: a?.name ?? "" },
    { name: "phone", label: t("phone"), hint: t("phoneHint"), type: "tel", inputMode: "tel", autoComplete: "tel-national", required: true, defaultValue: a ? displayBdPhone(a.phone) : "" },
    { name: "zoneId", label: t("zone"), type: "select", required: true, defaultValue: a?.zoneId ?? zones[0]?.id ?? "", options: zones.map((z) => ({ value: z.id, label: shown(z.name, locale) })) },
    { name: "district", label: t("district"), autoComplete: "address-level2", required: true, maxLength: 60, defaultValue: a?.district ?? "" },
    { name: "area", label: t("area"), autoComplete: "address-level3", required: true, maxLength: 80, defaultValue: a?.area ?? "" },
    { name: "line", label: t("line"), autoComplete: "street-address", required: true, maxLength: 200, defaultValue: a?.line ?? "", wide: true },
    { name: "landmark", label: t("landmark"), maxLength: 120, defaultValue: a?.landmark ?? "", wide: true },
    { name: "isDefault", label: t("isDefault"), type: "checkbox", defaultValue: a?.isDefault ? "on" : "", wide: true },
  ];
}
