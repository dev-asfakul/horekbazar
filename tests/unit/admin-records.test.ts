// B10 part c: the audit-log viewer and customer lookup. URL filters are validated and bounded before
// they reach a query (no operator injection, no regex injection), Dhaka dates map to the right UTC
// instants, and both pages are gated by the capability the build plan names.
import { describe, expect, it } from "vitest";
import { ADMIN_PAGE_CAPABILITY, adminPageCapability } from "@/lib/modules/identity/paths";
import { sectionsFor } from "@/lib/admin/sections";
import { auditMongoFilter, auditQueryString, dhakaDayStart, parseAuditFilters } from "@/lib/modules/platform/audit-query";
import { customerSearchFilter, isCustomerId, NOT_STAFF } from "@/lib/modules/identity/customers";
import { BUILT_IN_ROLES } from "@/lib/modules/identity/capabilities";

const roleCapabilities = (key: string) => new Set(BUILT_IN_ROLES.find((r) => r.key === key)!.capabilities);

describe("admin audit and customer page gates", () => {
  it("audit needs platform.read; customers need customers.read (also for a customer's detail page)", () => {
    expect(ADMIN_PAGE_CAPABILITY["/admin/audit"]).toBe("platform.read");
    expect(ADMIN_PAGE_CAPABILITY["/admin/customers"]).toBe("customers.read");
    expect(adminPageCapability("/admin/customers/65f000000000000000000001")).toBe("customers.read");
    expect(adminPageCapability("/admin/audit?action=order.")).toBe("platform.read");
  });
  it("the nav shows each section only to roles holding its capability", () => {
    expect(sectionsFor(new Set(["customers.read"])).map((s) => s.key)).toEqual(expect.arrayContaining(["customers"]));
    expect(sectionsFor(new Set(["customers.read"])).map((s) => s.key)).not.toContain("audit");
    expect(sectionsFor(new Set(["platform.read"])).map((s) => s.key)).toContain("audit");
    expect(sectionsFor(new Set(["orders.read"])).map((s) => s.key)).not.toContain("customers");
  });
  it("built-in roles: support and operators read customers but not the audit log", () => {
    const support = roleCapabilities("support_agent");
    expect(support.has("customers.read")).toBe(true);
    expect(support.has("platform.read")).toBe(false);
    expect(roleCapabilities("owner").has("platform.read")).toBe(true);
  });
});

describe("audit filters", () => {
  it("keeps well-formed values and drops everything else", () => {
    expect(parseAuditFilters({ action: "order.", actor: "u_1", type: "order", target: "HB-261023-ABC123", from: "2026-10-01", to: "2026-10-23" })).toEqual({
      action: "order.",
      actorId: "u_1",
      targetType: "order",
      targetId: "HB-261023-ABC123",
      from: "2026-10-01",
      to: "2026-10-23",
    });
    expect(parseAuditFilters({ action: "$where", actor: "{$ne:1}", type: "Order Type", target: "a b", from: "2026-02-30", to: "yesterday" })).toEqual({});
    expect(parseAuditFilters({ action: ["a", "b"] })).toEqual({});
    expect(parseAuditFilters({ action: "a".repeat(101) })).toEqual({});
  });
  it("a prefix ending in a dot is an anchored, escaped prefix match; anything else is exact", () => {
    expect(auditMongoFilter({ action: "order." })).toEqual({ action: { $regex: "^order\\." } });
    expect(auditMongoFilter({ action: "order.confirmed" })).toEqual({ action: "order.confirmed" });
  });
  it("Dhaka calendar days are UTC+6 midnights; the end date is inclusive", () => {
    expect(dhakaDayStart("2026-10-23")!.toISOString()).toBe("2026-10-22T18:00:00.000Z");
    expect(dhakaDayStart("2026-02-29")).toBeNull();
    const f = auditMongoFilter({ from: "2026-10-01", to: "2026-10-01" }) as { at: { $gte: Date; $lt: Date } };
    expect(f.at.$gte.toISOString()).toBe("2026-09-30T18:00:00.000Z");
    expect(f.at.$lt.toISOString()).toBe("2026-10-01T18:00:00.000Z");
  });
  it("the pager keeps filters", () => {
    expect(auditQueryString({ action: "order.", from: "2026-10-01" }, 3)).toBe("?action=order.&from=2026-10-01&page=3");
    expect(auditQueryString({}, 1)).toBe("");
  });
});

describe("customer search", () => {
  it("never lists staff, and matches the text literally", () => {
    expect(customerSearchFilter("")).toEqual(NOT_STAFF);
    const f = customerSearchFilter("a.b+c@(x)") as { $or: { email: { $regex: string } }[] };
    expect(f.$or[0]!.email.$regex).toBe("a\\.b\\+c@\\(x\\)");
    expect(() => new RegExp(f.$or[0]!.email.$regex)).not.toThrow();
  });
  it("phone digits are searched only with at least four digits", () => {
    expect(JSON.stringify(customerSearchFilter("017"))).not.toContain("phone");
    expect(JSON.stringify(customerSearchFilter("+880 1711"))).toContain('"phone":{"$regex":"8801711"}');
  });
  it("only canonical 24-hex ids are looked up", () => {
    expect(isCustomerId("65f000000000000000000001")).toBe(true);
    expect(isCustomerId("65F000000000000000000001")).toBe(false);
    expect(isCustomerId("abc")).toBe(false);
  });
});
