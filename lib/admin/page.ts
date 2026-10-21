// Server helpers shared by the B4 admin pages: gate the page, resolve the database, the admin locale,
// and the form strings. Admin figures use Latin digits with lakh grouping (DESIGN.md → Admin numbers).
import { getAdminLocale, gateStaffPage, getIdentity } from "@/lib/auth/server";
import { formatCount, formatMoney, type MoneyFormat } from "@/lib/format/money";
import { formMessages } from "@/lib/i18n/form-messages";
import type { AdminPage } from "@/lib/modules/identity/paths";

export const ADMIN_NUMBERS: MoneyFormat = { numerals: "latin", grouping: "south_asian" };
export const money = (amountMinor: number) => formatMoney(amountMinor, ADMIN_NUMBERS);
export const count = (n: number) => formatCount(n, ADMIN_NUMBERS);

export async function adminPage(page: AdminPage, requestedPath: string = page) {
  const locale = await getAdminLocale();
  const principal = await gateStaffPage(page, requestedPath);
  const identity = await getIdentity();
  if (!identity.ok) throw new Error("identity unavailable after the staff gate");
  return { locale, principal, db: identity.identity.db, messages: await formMessages(locale) };
}

/** Bengali, or English on the English admin when present. */
export const lt = (text: { bn: string; en?: string | undefined } | undefined, locale: "bn" | "en") => (text ? (locale === "en" && text.en ? text.en : text.bn) : "");

export const searchParam = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");
