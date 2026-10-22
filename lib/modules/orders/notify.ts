// What order emails carry besides the template: the store name in the customer's language, the
// order page link, the formatted total. Built when the outbox row is written (B7).
import { formatMoney } from "../../format/money.ts";
import type { SettingsDoc } from "../settings/schema.ts";

export function orderEmailExtras(settings: Pick<SettingsDoc, "store">, locale: "bn" | "en", orderNumber: string, total?: number) {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const name = locale === "en" ? (settings.store.name.en ?? settings.store.name.bn) : settings.store.name.bn;
  const path = `${locale === "en" ? "/en" : ""}/account/orders/${orderNumber}`;
  return {
    storeName: name,
    ...(site.startsWith("http") ? { url: `${site}${path}` } : {}),
    ...(total !== undefined ? { total: formatMoney(total, { numerals: locale === "bn" ? "bengali" : "latin", grouping: "south_asian" }) } : {}),
  };
}
