// Proposal A1 (docs/ADMIN-REDESIGN-A1.md): navigation groups and the current-page rule. Groups are
// presentation only: every section keeps its capability, and grouping never adds or drops a section.
import { describe, expect, it } from "vitest";
import { activeHref } from "@/lib/admin/active-section";
import { ADMIN_GROUPS, ADMIN_SECTIONS, groupSections, sectionsFor } from "@/lib/admin/sections";
import { WORK_COUNTS } from "@/lib/admin/work-counts";
import { decideAccess, type Principal } from "@/lib/modules/identity/principal";
import { BUILT_IN_ROLES } from "@/lib/modules/identity/capabilities";
import { ADMIN_PAGE_CAPABILITY } from "@/lib/modules/identity/paths";
import en from "@/messages/en.json";

const caps = (key: string) => new Set(BUILT_IN_ROLES.find((r) => r.key === key)!.capabilities);

describe("admin section groups", () => {
  it("has the 22 sections, each in exactly one known group", () => {
    expect(ADMIN_SECTIONS).toHaveLength(22);
    const grouped = groupSections(ADMIN_SECTIONS).flatMap((g) => g.sections.map((s) => s.key));
    expect(grouped.sort()).toEqual(ADMIN_SECTIONS.map((s) => s.key).sort());
    for (const s of ADMIN_SECTIONS) expect(ADMIN_GROUPS).toContain(s.group);
  });

  it("keeps each section's capability equal to the server page gate", () => {
    for (const s of ADMIN_SECTIONS) {
      if (s.capability === null) expect(s.key).toBe("security");
      else expect(ADMIN_PAGE_CAPABILITY[s.href as keyof typeof ADMIN_PAGE_CAPABILITY], s.href).toBe(s.capability);
    }
  });

  it("groups in the agreed order and leaves out empty groups", () => {
    expect(groupSections(ADMIN_SECTIONS).map((g) => g.group)).toEqual(["sales", "customers", "catalogue", "storefront", "marketing", "settings", "system"]);
    // A catalogue editor sees Catalogue (and Security), nothing from Sales or System.
    const editor = groupSections(sectionsFor(caps("catalogue_editor")));
    expect(editor.map((g) => g.group)).not.toContain("sales");
    expect(editor.map((g) => g.group)).not.toContain("system");
    expect(editor.flatMap((g) => g.sections.map((s) => s.key))).toContain("products");
    expect(editor.flatMap((g) => g.sections.map((s) => s.key))).toContain("security");
  });

  it("has an English label for every group, section and description", () => {
    for (const g of ADMIN_GROUPS) expect(en.admin.nav.groups[g]).toBeTruthy();
    for (const s of ADMIN_SECTIONS) {
      expect((en.admin.nav as Record<string, unknown>)[s.key], s.key).toBeTruthy();
      expect((en.admin.home as Record<string, unknown>)[`${s.key}Desc`], s.key).toBeTruthy();
    }
  });
});

describe("activeHref", () => {
  const hrefs = ["/admin", ...ADMIN_SECTIONS.map((s) => s.href)];
  it.each([
    ["/admin", "/admin"],
    ["/admin/", "/admin"],
    ["/admin/orders", "/admin/orders"],
    ["/admin/orders/HB-261024-ABCDEF", "/admin/orders"],
    ["/admin/settings", "/admin/settings"],
    ["/admin/settings/delivery", "/admin/settings/delivery"],
    ["/admin/products/new", "/admin/products"],
  ])("%s marks %s", (path, want) => {
    expect(activeHref(path, hrefs)).toBe(want);
  });

  it("matches whole path segments only, and nothing outside the list", () => {
    expect(activeHref("/admin/ordersx", hrefs)).toBe(null);
    expect(activeHref("/admin/unknown", hrefs)).toBe(null);
    expect(activeHref("/admin/orders", ["/admin"])).toBe(null);
  });
});

describe("work counts follow the linked section's capability", () => {
  const NOW = new Date("2026-10-24T10:00:00Z");
  const principal = (roleKey: string): Principal => {
    const role = BUILT_IN_ROLES.find((r) => r.key === roleKey)!;
    return {
      user: { id: "u1", email: "a@example.test", name: "A", emailVerified: true, twoFactorEnabled: true, locale: "en", phone: null, staffRoleKey: roleKey },
      session: { id: "s1", token: "t1", createdAt: NOW, expiresAt: new Date(NOW.getTime() + 86_400_000), stepUpAt: null, secondFactorAt: NOW },
      role: { key: roleKey, name: role.name, capabilities: new Set(role.capabilities), twoFactorRequired: role.twoFactorRequired },
    } as Principal;
  };
  const visible = (roleKey: string) => WORK_COUNTS.filter((d) => decideAccess(principal(roleKey), d.capability, { now: NOW }).result === "allowed").map((d) => d.key);

  it("each count's capability is the one its linked page checks", () => {
    for (const d of WORK_COUNTS) {
      const page = d.href.split("?")[0] as keyof typeof ADMIN_PAGE_CAPABILITY;
      expect(ADMIN_PAGE_CAPABILITY[page], d.key).toBe(d.capability);
    }
  });

  it.each(BUILT_IN_ROLES.map((r) => r.key))("%s sees exactly the counts its role allows", (key) => {
    const caps = new Set(BUILT_IN_ROLES.find((r) => r.key === key)!.capabilities);
    expect(visible(key)).toEqual(WORK_COUNTS.filter((d) => caps.has(d.capability)).map((d) => d.key));
  });

  it("a catalogue editor sees no order, message or return counts", () => {
    expect(visible("catalogue_editor")).not.toContain("orders");
    expect(visible("catalogue_editor")).not.toContain("messages");
    expect(visible("catalogue_editor")).not.toContain("returns");
  });
});
