// Account e-mails (B3): verification, password reset, staff role changes. Bilingual by the
// recipient's language (Bengali-script Banglish first, owner 2026-10-22). Plain text plus minimal HTML; every value is escaped.
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
    bn: { subject: "আপনার ইমেইল ভেরিফাই করুন", lead: "অ্যাকাউন্ট চালু করতে নিচের লিংকে যান। লিংকটি ২৪ ঘণ্টা কাজ করবে।", action: "ইমেইল ভেরিফাই করুন", ignore: "আপনি অ্যাকাউন্ট না খুলে থাকলে এই ইমেইলটি বাদ দিন।" },
    en: { subject: "Verify your email", lead: "Open the link below to activate your account. It works for 24 hours.", action: "Verify email", ignore: "If you did not create an account, ignore this email." },
  },
  "reset-password": {
    bn: { subject: "পাসওয়ার্ড রিসেট করুন", lead: "নতুন পাসওয়ার্ড দিতে নিচের লিংকে যান। লিংকটি ১ ঘণ্টার মধ্যে, শুধু একবার কাজ করবে।", action: "নতুন পাসওয়ার্ড দিন", ignore: "আপনি রিসেট না চেয়ে থাকলে কিছু করতে হবে না; আপনার পাসওয়ার্ড বদলায়নি।" },
    en: { subject: "Reset your password", lead: "Open the link below to choose a new password. It works once, for 1 hour.", action: "Choose a new password", ignore: "If you did not ask for this, you need do nothing; your password has not changed." },
  },
  "staff-role-changed": {
    bn: { subject: "আপনার স্টাফ রোল বদলেছে", lead: "আপনার অ্যাকাউন্টের স্টাফ রোল এখন:", action: "অ্যাডমিন খুলুন", ignore: "এই পরিবর্তন আপনার জানা না থাকলে স্টোর ওনারকে জানান।" },
    en: { subject: "Your staff role changed", lead: "Your account's staff role is now:", action: "Open admin", ignore: "If you did not expect this change, tell the store owner." },
  },
} as const;

export function renderEmail(payload: EmailPayload): EmailMessage {
  const c = copy[payload.template][payload.locale];
  const store = payload.storeName ?? "HorekBazar";
  const greeting = payload.locale === "bn" ? `প্রিয় ${payload.name ?? "কাস্টমার"},` : `Hello ${payload.name ?? "there"},`;
  const lead = payload.role ? `${c.lead} ${payload.role}` : c.lead;
  const lines = [greeting, "", lead, "", ...(payload.url ? [`${c.action}: ${payload.url}`, ""] : []), c.ignore, "", store];
  const link = payload.url
    ? `<p><a href="${escape(payload.url)}" style="color:#1e4e9c;font-weight:600">${escape(c.action)}</a></p><p style="color:#5c574e;font-size:13px">${escape(payload.url)}</p>`
    : "";
  const html = `<!doctype html><html lang="${payload.locale}"><body style="font-family:system-ui,sans-serif;line-height:1.6;color:#1b1a17;max-width:560px;margin:24px auto;padding:0 16px">
<p>${escape(greeting)}</p><p>${escape(lead)}</p>${link}<p style="color:#5c574e">${escape(c.ignore)}</p><p>${escape(store)}</p></body></html>`;
  return { to: payload.to, subject: `${c.subject} · ${store}`, text: lines.join("\n"), html };
}
