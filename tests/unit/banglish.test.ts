// Banglish-first guard (owner decision 2026-10-22; review checklist in docs/BANGLISH-PROPOSAL.md).
// The "bn" storefront is Latin-script Banglish: no Bengali-script UI string may come back by accident.
// Product and category data is not checked here: it is source data and is never rewritten by copy work.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import bn from "@/messages/bn.json";
import en from "@/messages/en.json";
import { renderEmail, EMAIL_TEMPLATES } from "@/lib/modules/identity/emails";

const BENGALI = /[\u0980-\u09FF]/;

function entries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}

/** One spelling per commerce term (proposal → conventions). Wrong spellings that must not appear. */
const GLOSSARY: [RegExp, string][] = [
  [/\bkart\b/i, "Cart"],
  [/\bchekout\b|\bcheck-out\b/i, "Checkout"],
  [/\bacount\b|\bekaunt\b/i, "Account"],
  [/\blog-?in koro\b/i, "Login korun (polite form)"],
  [/\bsign in\b/i, "Login"],
  [/\bsign out\b/i, "Logout"],
];

describe("Banglish catalogue", () => {
  const all = entries(bn);

  it("has no Bengali-script string", () => {
    expect(all.filter(([, v]) => BENGALI.test(v)).map(([k]) => k)).toEqual([]);
  });

  it("uses one spelling for each commerce term", () => {
    // Admin-only form messages are deliberately the English text (the admin is English only).
    const english = new Map(entries(en));
    const banglish = all.filter(([k, v]) => english.get(k) !== v);
    expect(banglish.length).toBeGreaterThan(150);
    for (const [pattern, preferred] of GLOSSARY) {
      expect(banglish.filter(([, v]) => pattern.test(v)).map(([k]) => `${k} (use ${preferred})`)).toEqual([]);
    }
  });

  it("keeps button labels short (at most four words)", () => {
    const buttons = all.filter(([k]) => /\.(submit|retry|action|reload|signOut|revoke|revokeOthers|register|login|requestNew|enableSubmit|disableSubmit|confirmSubmit|passwordSubmit|resendSubmit)$/.test(k));
    expect(buttons.length).toBeGreaterThan(10);
    expect(buttons.filter(([, v]) => v.split(/\s+/).length > 4).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });
});

describe("hard-coded customer copy", () => {
  it("Banglish e-mails contain no Bengali script and are marked bn-Latn", () => {
    for (const template of EMAIL_TEMPLATES) {
      const mail = renderEmail({ template, to: "a@example.com", locale: "bn", url: "https://example.com/x", role: "Owner" });
      expect(BENGALI.test(mail.subject + mail.text + mail.html)).toBe(false);
      expect(mail.html).toContain('lang="bn-Latn"');
    }
  });

  it("the last-resort error page contains no Bengali script", () => {
    expect(BENGALI.test(readFileSync("app/global-error.tsx", "utf8"))).toBe(false);
  });
});
