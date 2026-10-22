// Banglish guard (owner, 2026-10-22): the "bn" storefront is Banglish written in Bengali script:
// conversational Bangla with English words in Bengali letters ("সেটআপ বাকি", "কার্ট", "লগইন করুন").
// Admin-only form messages are English (the admin is English only) and are recognised by being equal
// to the English text. Product and category data are source data and are not checked here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bn from "@/messages/bn.json";
import en from "@/messages/en.json";
import { renderEmail, EMAIL_TEMPLATES } from "@/lib/modules/identity/emails";

const BENGALI = /[\u0980-\u09FF]/;
/** Shopper-facing strings that are rightly Latin: the language switch's own name, and "SKU". */
const LATIN_OK = new Set(["shell.localeSwitch.label", "store.product.sku"]);

function entries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}

const english = new Map(entries(en));
const customer = entries(bn).filter(([k, v]) => english.get(k) !== v || LATIN_OK.has(k));

/** One Bengali spelling per commerce term; these variants must not appear. */
const GLOSSARY: [RegExp, string][] = [
  [/\b(Cart|Checkout|Orders?|Wishlist|Search|Login|Account|Delivery|Payment)\b/, "write the term in Bengali letters (কার্ট, চেকআউট, অর্ডার, উইশলিস্ট, সার্চ, লগইন, অ্যাকাউন্ট, ডেলিভারি, পেমেন্ট)"],
  [/একাউন্ট|এ্যাকাউন্ট/, "অ্যাকাউন্ট"],
  [/লগ ইন|লগ-ইন/, "লগইন"],
  [/লগ আউট|লগ-আউট/, "লগআউট"],
  [/চেক আউট/, "চেকআউট"],
  [/ইমেল\b|ই-মেইল/, "ইমেইল"],
  [/প্রডাক্ট|প্রোডাক্‌ট|পণ্য/, "প্রোডাক্ট (UI copy)"],
];

describe("Banglish catalogue (Bengali script)", () => {
  it("covers every shopper-facing string", () => {
    expect(customer.length).toBeGreaterThan(260);
  });

  it("writes every shopper-facing string in Bengali script", () => {
    expect(customer.filter(([k, v]) => !LATIN_OK.has(k) && !BENGALI.test(v)).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });

  it("uses one spelling for each commerce term", () => {
    for (const [pattern, preferred] of GLOSSARY) {
      expect(customer.filter(([, v]) => pattern.test(v)).map(([k, v]) => `${k}: ${v} (use ${preferred})`)).toEqual([]);
    }
  });

  it("keeps button labels short (at most four words)", () => {
    const buttons = customer.filter(([k]) => /\.(submit|retry|action|reload|signOut|revoke|revokeOthers|register|login|requestNew|enableSubmit|disableSubmit|confirmSubmit|passwordSubmit|resendSubmit)$/.test(k));
    expect(buttons.length).toBeGreaterThan(10);
    expect(buttons.filter(([, v]) => v.split(/\s+/).length > 4).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });
});

describe("hard-coded customer copy", () => {
  it("Bangla e-mails are in Bengali script and marked lang=bn", () => {
    for (const template of EMAIL_TEMPLATES) {
      const mail = renderEmail({ template, to: "a@example.com", locale: "bn", url: "https://example.com/x", role: "Owner" });
      expect(BENGALI.test(mail.subject)).toBe(true);
      expect(mail.html).toContain('lang="bn"');
    }
  });

  it("the last-resort error page carries the Bangla text", () => {
    expect(readFileSync("app/global-error.tsx", "utf8")).toContain("কিছু একটা সমস্যা হয়েছে");
  });
});
