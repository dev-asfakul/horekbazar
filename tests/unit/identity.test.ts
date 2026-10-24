// B3 identity: pure rules (capability decisions, redirects, phone numbers, e-mails, setup token).
import { describe, expect, it } from "vitest";
import { BUILT_IN_ROLES, CAPABILITIES, STEP_UP_CAPABILITIES, STEP_UP_WINDOW_MS, type Capability } from "@/lib/modules/identity/capabilities";
import { renderEmail } from "@/lib/modules/identity/emails";
import { safeNext, signInRedirect } from "@/lib/modules/identity/paths";
import { normalisePhone } from "@/lib/modules/identity/phone";
import { decideAccess, decideStaffShell, type Principal } from "@/lib/modules/identity/principal";
import { setupTokenMatches } from "@/lib/modules/identity/staff";

const NOW = new Date("2026-10-21T10:00:00Z");

function principal(over: { roleKey?: string | null; caps?: Capability[]; twoFactorRequired?: boolean; twoFactorEnabled?: boolean; emailVerified?: boolean; stepUpAt?: Date | null; secondFactorAt?: Date | null } = {}): Principal {
  const roleKey = over.roleKey === undefined ? "owner" : over.roleKey;
  const builtIn = BUILT_IN_ROLES.find((r) => r.key === roleKey);
  return {
    user: { id: "u1", email: "a@example.com", name: "A", emailVerified: over.emailVerified ?? true, twoFactorEnabled: over.twoFactorEnabled ?? true, locale: "bn", phone: null, staffRoleKey: roleKey },
    session: { id: "s1", token: "t1", createdAt: NOW, stepUpAt: over.stepUpAt ?? null, secondFactorAt: over.secondFactorAt === undefined ? NOW : over.secondFactorAt, expiresAt: new Date(NOW.getTime() + 86_400_000) },
    role: roleKey ? { key: roleKey, name: { bn: "x" }, capabilities: new Set(over.caps ?? builtIn?.capabilities ?? []), twoFactorRequired: over.twoFactorRequired ?? builtIn?.twoFactorRequired ?? false } : null,
  } as Principal;
}

describe("decideAccess", () => {
  it("signed out, customer (no role) and unverified email", () => {
    expect(decideAccess(null, "orders.read").result).toBe("signed_out");
    expect(decideAccess(principal({ roleKey: null }), "orders.read").result).toBe("denied");
    expect(decideAccess(principal({ emailVerified: false }), "orders.read").result).toBe("denied");
  });

  it("every built-in role is allowed exactly its own capabilities (reads)", () => {
    for (const role of BUILT_IN_ROLES) {
      for (const cap of CAPABILITIES) {
        const p = principal({ roleKey: role.key, twoFactorEnabled: true });
        expect(decideAccess(p, cap, { now: NOW }).result, `${role.key} ${cap}`).toBe(role.capabilities.includes(cap) ? "allowed" : "denied");
      }
    }
  });

  it("a role requiring 2FA without enrolment gets only the enrolment state", () => {
    // D7: mandatory for Owner and Store manager only.
    expect(BUILT_IN_ROLES.filter((r) => r.twoFactorRequired).map((r) => r.key).sort()).toEqual(["owner", "store_manager"]);
    for (const key of ["owner", "store_manager"]) {
      expect(decideAccess(principal({ roleKey: key, twoFactorEnabled: false }), "orders.read").result).toBe("two_factor_enrolment");
      expect(decideStaffShell(principal({ roleKey: key, twoFactorEnabled: false })).result).toBe("two_factor_enrolment");
    }
    expect(decideAccess(principal({ roleKey: "support_agent", twoFactorEnabled: false }), "customers.read").result).toBe("allowed");
    expect(decideAccess(principal({ roleKey: "order_operator", twoFactorEnabled: false }), "orders.confirm").result).toBe("allowed");
  });

  it("step-up capabilities need a code within 10 minutes for mutations only", () => {
    for (const cap of STEP_UP_CAPABILITIES) {
      expect(decideAccess(principal(), cap, { now: NOW }).result).toBe("allowed"); // read
      expect(decideAccess(principal(), cap, { mutation: true, now: NOW }).result).toBe("step_up");
      expect(decideAccess(principal({ stepUpAt: new Date(NOW.getTime() - 60_000) }), cap, { mutation: true, now: NOW }).result).toBe("allowed");
      expect(decideAccess(principal({ stepUpAt: new Date(NOW.getTime() - STEP_UP_WINDOW_MS - 1) }), cap, { mutation: true, now: NOW }).result).toBe("step_up");
    }
    // A role without 2FA cannot satisfy step-up even with a timestamp.
    const p = principal({ roleKey: "custom", caps: ["staff.manage"], twoFactorRequired: false, twoFactorEnabled: false, stepUpAt: NOW });
    expect(decideAccess(p, "staff.manage", { mutation: true, now: NOW }).result).toBe("step_up");
    expect(decideAccess(principal(), "orders.confirm", { mutation: true, now: NOW }).result).toBe("allowed");
  });

  it("a 2FA user whose session skipped the code (Google sign-in) gets only the code check", () => {
    const p = principal({ secondFactorAt: null });
    expect(decideAccess(p, "orders.read").result).toBe("second_factor");
    expect(decideStaffShell(p).result).toBe("second_factor");
    // Without 2FA on the account there is nothing to skip.
    expect(decideAccess(principal({ roleKey: "catalogue_editor", twoFactorEnabled: false, secondFactorAt: null }), "catalogue.write").result).toBe("allowed");
  });

  it("staff shell: verified role holders only", () => {
    expect(decideStaffShell(null).result).toBe("signed_out");
    expect(decideStaffShell(principal({ roleKey: null })).result).toBe("denied");
    expect(decideStaffShell(principal({ roleKey: "catalogue_editor", twoFactorEnabled: false })).result).toBe("allowed");
  });

  it("owner holds every capability and only owner holds staff.manage among built-ins", () => {
    expect(BUILT_IN_ROLES.find((r) => r.key === "owner")!.capabilities).toEqual([...CAPABILITIES]);
    expect(BUILT_IN_ROLES.filter((r) => r.capabilities.includes("staff.manage")).map((r) => r.key)).toEqual(["owner"]);
  });
});

describe("redirect safety", () => {
  it("safeNext keeps same-site paths and rejects everything else", () => {
    expect(safeNext("/account/orders?x=1")).toBe("/account/orders?x=1");
    expect(safeNext("/admin")).toBe("/admin");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, 42, `/${"a".repeat(600)}`]) expect(safeNext(bad)).toBe("/account");
  });

  it("proxy sign-in redirect only for private pages without a session cookie", () => {
    expect(signInRedirect("/account", "", false)).toBe("/login?next=%2Faccount");
    expect(signInRedirect("/en/account/security", "", false)).toBe("/en/login?next=%2Fen%2Faccount%2Fsecurity");
    // Phase F (D28): guests may check out; the signed-in success page still asks for an account.
    expect(signInRedirect("/checkout", "?a=1", false)).toBeNull();
    expect(signInRedirect("/en/checkout", "", false)).toBeNull();
    expect(signInRedirect("/checkout/success/HB-261025-ABC123", "", false)).toBe("/login?next=%2Fcheckout%2Fsuccess%2FHB-261025-ABC123");
    expect(signInRedirect("/order-status/x", "", false)).toBeNull();
    expect(signInRedirect("/admin/staff", "", false)).toBe("/login?next=%2Fadmin%2Fstaff");
    expect(signInRedirect("/admin/setup", "", false)).toBeNull();
    expect(signInRedirect("/account", "", true)).toBeNull();
    expect(signInRedirect("/", "", false)).toBeNull();
    expect(signInRedirect("/accounting", "", false)).toBeNull();
    expect(signInRedirect("/login", "", false)).toBeNull();
  });
});

describe("normalisePhone", () => {
  it("accepts Bangladeshi mobiles in common forms", () => {
    for (const raw of ["01712345678", "+8801712345678", "8801712345678", "017-1234 5678", "০১৭১২৩৪৫৬৭৮"]) expect(normalisePhone(raw)).toBe("01712345678");
  });
  it("rejects other numbers", () => {
    for (const raw of ["01212345678", "0171234567", "017123456789", "+15551234567", "abc"]) expect(normalisePhone(raw)).toBeNull();
  });
});

describe("account e-mails", () => {
  it("escapes values, includes the link, uses the recipient's language, no em dashes", () => {
    const m = renderEmail({ template: "verify-email", to: "a@example.com", locale: "bn", name: "<b>x</b>", url: "https://shop.example/verify?t=a&b" });
    expect(m.subject).toContain("ইমেইল");
    expect(m.text).toContain("https://shop.example/verify?t=a&b");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(m.html).toContain("t=a&amp;b");
    expect(m.html).not.toContain("<b>x</b>");
    for (const template of ["verify-email", "reset-password", "staff-role-changed"] as const) {
      for (const locale of ["bn", "en"] as const) {
        const r = renderEmail({ template, to: "a@example.com", locale, url: "https://x.example", role: "Owner" });
        expect(r.text + r.html + r.subject).not.toMatch(/\u2014/);
      }
    }
  });
});

describe("setup token", () => {
  it("matches only the exact configured token of at least 16 characters", () => {
    const token = "s".repeat(32);
    expect(setupTokenMatches(token, token)).toBe(true);
    expect(setupTokenMatches(token, `${token}x`)).toBe(false);
    expect(setupTokenMatches(token, "")).toBe(false);
    expect(setupTokenMatches(undefined, "")).toBe(false);
    expect(setupTokenMatches("short", "short")).toBe(false);
  });
});
