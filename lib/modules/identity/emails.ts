// Account e-mails (B3): verification, password reset, staff role changes. Bilingual by the
// recipient's language (Banglish first, owner decision 2026-10-22). Plain text plus minimal HTML; every value is escaped.
// The outbox payload carries only what the template needs; the handler renders at send time.
import type { EmailMessage } from "../../adapters/email/resend.ts";

export const EMAIL_TEMPLATES = ["verify-email", "reset-password", "staff-role-changed"] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

export interface EmailPayload {
  template: EmailTemplate;
  to: string;
  locale: "bn" | "en";
  name?: string;
  url?: string;
  storeName?: string;
  role?: string;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const copy = {
  "verify-email": {
    bn: { subject: "Apnar email verify korun", lead: "Account chalu korte nicher link-e jan. Link-ti 24 ghonta kaj korbe.", action: "Email verify korun", ignore: "Apni account na khule thakle ei email-ti bad din." },
    en: { subject: "Verify your email", lead: "Open the link below to activate your account. It works for 24 hours.", action: "Verify email", ignore: "If you did not create an account, ignore this email." },
  },
  "reset-password": {
    bn: { subject: "Password reset korun", lead: "Notun password dite nicher link-e jan. Link-ti 1 ghontar moddhe, shudhu ekbar kaj korbe.", action: "Notun password din", ignore: "Apni reset na cheye thakle kichu korte hobe na; apnar password bodlayni." },
    en: { subject: "Reset your password", lead: "Open the link below to choose a new password. It works once, for 1 hour.", action: "Choose a new password", ignore: "If you did not ask for this, you need do nothing; your password has not changed." },
  },
  "staff-role-changed": {
    bn: { subject: "Apnar staff role bodleche", lead: "Apnar account-er staff role ekhon:", action: "Admin khulun", ignore: "Ei change apnar jana na thakle store owner-ke janan." },
    en: { subject: "Your staff role changed", lead: "Your account's staff role is now:", action: "Open admin", ignore: "If you did not expect this change, tell the store owner." },
  },
} as const;

export function renderEmail(payload: EmailPayload): EmailMessage {
  const c = copy[payload.template][payload.locale];
  const store = payload.storeName ?? "HorekBazar";
  const greeting = payload.locale === "bn" ? `Priyo ${payload.name ?? "customer"},` : `Hello ${payload.name ?? "there"},`;
  const lead = payload.role ? `${c.lead} ${payload.role}` : c.lead;
  const lines = [greeting, "", lead, "", ...(payload.url ? [`${c.action}: ${payload.url}`, ""] : []), c.ignore, "", store];
  const link = payload.url
    ? `<p><a href="${escape(payload.url)}" style="color:#1e4e9c;font-weight:600">${escape(c.action)}</a></p><p style="color:#5c574e;font-size:13px">${escape(payload.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="${payload.locale === "bn" ? "bn-Latn" : "en"}"><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#1b1a17;max-width:560px;margin:24px auto;padding:0 16px">
<p>${escape(greeting)}</p><p>${escape(lead)}</p>${link}<p style="color:#5c574e">${escape(c.ignore)}</p><p>${escape(store)}</p></body></html>`;
  return { to: payload.to, subject: `${c.subject} · ${store}`, text: lines.join("\n"), html };
}
