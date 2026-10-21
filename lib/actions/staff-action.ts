// Shared plumbing for the B4 admin server actions (catalogue, inventory, merchandising, settings).
// Not a "use server" module: it exports helpers, not actions. Every action calls `staffContext` first,
// which re-resolves the principal and runs decideAccess(…, capability, { mutation: true }) on the
// server; hidden buttons are never the authorisation (MASTER ORDER: enforce on the server).
import { headers } from "next/headers";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { CatalogueError } from "@/lib/modules/catalogue/common";
import type { Capability } from "@/lib/modules/identity/capabilities";
import { clientIp } from "@/lib/modules/identity/limits";
import { decideAccess } from "@/lib/modules/identity/principal";
import type { FormState } from "@/lib/actions/form-state";

export const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};
export const fields = (form: FormData, key: string) => form.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
export const checked = (form: FormData, key: string) => field(form, key) === "on";

export const fail = (code: string, fieldErrors?: Record<string, string>, values?: Record<string, string>): FormState => ({
  status: "error",
  code,
  ...(fieldErrors && Object.keys(fieldErrors).length ? { fields: fieldErrors } : {}),
  ...(values ? { values } : {}),
});
export const ok = (code: string, data?: Record<string, unknown>): FormState => ({ status: "success", code, ...(data ? { data } : {}) });

/** Resolves the database and the acting staff member, or the FormState error to return. */
export async function staffContext(capability: Capability) {
  const result = await getIdentity();
  if (!result.ok) return { error: fail("accounts_unavailable") } as const;
  const principal = await getPrincipal();
  const decision = decideAccess(principal, capability, { mutation: true });
  if (decision.result === "step_up") return { error: fail("step_up_required") } as const;
  if (decision.result !== "allowed" || !principal?.role) return { error: fail("forbidden") } as const;
  const actor = { id: principal.user.id, role: principal.role.key, ip: clientIp(await headers()) };
  return { db: result.identity.db, client: result.identity.client, actor } as const;
}

/** Maps a service error to a message key under forms.errors (unknown errors stay generic). */
export function serviceErrorCode(error: unknown): string {
  if (error instanceof CatalogueError) return `catalogue_${error.code}`;
  // MongoDB document validation failure: the committed validator rejected the write.
  if (typeof error === "object" && error !== null && (error as { code?: number }).code === 121) return "catalogue_invalid";
  return "try_again";
}

// ── Form value parsing ────────────────────────────────────────────────────────────────────

const BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Accepts Bengali or Latin digits and strips grouping commas and spaces. */
export const normaliseDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d))).replace(/[,\s]/g, "");

/** Taka with up to two decimals → paisa (integer). Returns null when the text is not a price. */
export function parseTaka(text: string): number | null {
  const s = normaliseDigits(text.trim());
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
export const takaText = (amountMinor: number) => (amountMinor % 100 === 0 ? String(amountMinor / 100) : (amountMinor / 100).toFixed(2));

/** A whole number within [min, max], or null. */
export function parseInteger(text: string, min: number, max: number): number | null {
  const s = normaliseDigits(text.trim());
  if (!/^-?\d{1,9}$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

/** A positive decimal (net quantity), or null. */
export function parseDecimal(text: string, max: number): number | null {
  const s = normaliseDigits(text.trim());
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= max ? n : null;
}

/**
 * Reads `<prefix>Bn` and `<prefix>En`. Bengali is required when `required`; an empty pair is
 * `undefined`; English alone is an error (localised text needs Bengali, SCHEMA.md "LT").
 */
export function localized(form: FormData, prefix: string, max: number, required: boolean, errors: Record<string, string>) {
  const bn = field(form, `${prefix}Bn`).trim();
  const en = field(form, `${prefix}En`).trim();
  if (bn.length > max) errors[`${prefix}Bn`] = "too_long";
  if (en.length > max) errors[`${prefix}En`] = "too_long";
  if (!bn) {
    if (required || en) errors[`${prefix}Bn`] = "required";
    return undefined;
  }
  return en ? { bn, en } : { bn };
}

/** datetime-local value (Asia/Dhaka wall time, UTC+6, no DST) → Date; empty → undefined; bad → null. */
export function parseDhakaDateTime(text: string): Date | undefined | null {
  const s = text.trim();
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(`${s}:00+06:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function dhakaDateTimeText(date: Date | undefined): string {
  if (!date) return "";
  return new Date(date.getTime() + 6 * 3600_000).toISOString().slice(0, 16);
}

export const versionOf = (form: FormData) => parseInteger(field(form, "version"), 0, 1_000_000_000) ?? -1;
