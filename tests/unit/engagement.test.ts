// B9 pure rules: points rounding, reviewer name privacy, the rewards switch, and staff page gates.
import { readFileSync } from "node:fs";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { sectionsFor } from "@/lib/admin/sections";
import { BUILT_IN_ROLES, CAPABILITIES, type Capability } from "@/lib/modules/identity/capabilities";
import { ADMIN_PAGE_CAPABILITY, adminPageCapability } from "@/lib/modules/identity/paths";
import { LIMITS } from "@/lib/modules/identity/limits";
import { availablePoints, pointsFor, rewardsOn } from "@/lib/modules/rewards/rewards";
import { reviewAuthorName } from "@/lib/modules/reviews/reviews";
import { DEFAULT_SETTINGS } from "@/lib/modules/settings/schema";

describe("rewards rules (§5.7)", () => {
  it("rounds points down and never credits a fraction", () => {
    expect(pointsFor(200000, 2)).toBe(40); // ৳2000 × 2 per ৳100
    expect(pointsFor(9999, 1)).toBe(0); // under ৳100
    expect(pointsFor(14999, 1)).toBe(1);
    expect(pointsFor(0, 20)).toBe(0);
  });
  it("is off by default and needs the switch, rules and a positive rate", () => {
    expect(rewardsOn(DEFAULT_SETTINGS)).toBe(false);
    expect(rewardsOn({ features: { ...DEFAULT_SETTINGS.features, rewards: true } })).toBe(false);
    expect(rewardsOn({ features: { ...DEFAULT_SETTINGS.features, rewards: true }, rewards: { pointsPer100Taka: 0, expiryDays: 365 } })).toBe(false);
    expect(rewardsOn({ features: { ...DEFAULT_SETTINGS.features, rewards: true }, rewards: { pointsPer100Taka: 1, expiryDays: 365 } })).toBe(true);
  });
});

describe("reviews (§10.4)", () => {
  it("shows only the first word of the account name", () => {
    expect(reviewAuthorName("  রহিম   উদ্দিন ")).toBe("রহিম");
    expect(reviewAuthorName("Salma Akter")).toBe("Salma");
    expect(reviewAuthorName("   ")).toBe("Customer");
  });
});

describe("B9 staff pages and limits", () => {
  it("gates each page by its capability, including deeper paths", () => {
    expect(ADMIN_PAGE_CAPABILITY["/admin/reviews"]).toBe("reviews.moderate");
    expect(ADMIN_PAGE_CAPABILITY["/admin/messages"]).toBe("messages.reply");
    expect(ADMIN_PAGE_CAPABILITY["/admin/rewards"]).toBe("rewards.write");
    expect(adminPageCapability("/admin/messages/0123456789abcdef01234567")).toBe("messages.reply");
    for (const c of ["reviews.moderate", "messages.reply", "rewards.write"]) expect(CAPABILITIES).toContain(c);
  });
  it("lists the sections only for roles that hold the capability", () => {
    expect(sectionsFor(new Set(["messages.reply"] as const)).map((s) => s.key)).toEqual(["messages", "security"]);
    expect(sectionsFor(new Set()).map((s) => s.key)).not.toContain("reviews");
  });
  it("rate-limits reviews and messages per customer", () => {
    expect(LIMITS.reviewSubmit).toMatchObject({ limit: 5, windowSeconds: 3600 });
    expect(LIMITS.messagePost).toMatchObject({ limit: 20, windowSeconds: 3600 });
  });
});

describe("available points (derived from the ledger, §5.7)", () => {
  const now = new Date("2026-10-22T00:00:00Z");
  const past = new Date("2026-10-01T00:00:00Z");
  const future = new Date("2027-10-01T00:00:00Z");
  const o1 = new ObjectId();
  const o2 = new ObjectId();
  it("counts each accrual net of its reversals until it expires", () => {
    expect(availablePoints([{ kind: "accrue", points: 40, orderId: o1, expiresAt: future }, { kind: "reverse", points: -10, orderId: o1 }], now)).toBe(30);
  });
  it("drops an expired accrual together with its reversals, so newer points are not eaten", () => {
    const entries = [
      { kind: "accrue" as const, points: 50, orderId: o1, expiresAt: past },
      { kind: "reverse" as const, points: -20, orderId: o1 },
      { kind: "accrue" as const, points: 30, orderId: o2, expiresAt: future },
    ];
    expect(availablePoints(entries, now)).toBe(30);
  });
  it("adjustments always count; expire entries are ignored; never below zero", () => {
    expect(availablePoints([{ kind: "adjust", points: 25 }, { kind: "expire", points: -25 }], now)).toBe(25);
    expect(availablePoints([{ kind: "adjust", points: -5 }], now)).toBe(0);
    expect(availablePoints([], now)).toBe(0);
  });
});

describe("B9 permissions (server-side)", () => {
  const roles = new Map(BUILT_IN_ROLES.map((r) => [r.key, new Set<Capability>(r.capabilities)]));
  it("built-in roles hold only the engagement capabilities they need", () => {
    expect(roles.get("support_agent")!.has("messages.reply")).toBe(true);
    expect(roles.get("support_agent")!.has("reviews.moderate")).toBe(false);
    expect(roles.get("support_agent")!.has("rewards.write")).toBe(false);
    expect(roles.get("order_operator")!.has("messages.reply")).toBe(false);
  });
  it("every staff action checks its own capability and every customer action is customer-only", () => {
    const admin = readFileSync("lib/actions/admin-engagement.ts", "utf8");
    const expected: Record<string, string> = { moderateReviewAction: "reviews.moderate", staffReplyAction: "messages.reply", conversationStatusAction: "messages.reply", adjustRewardsAction: "rewards.write", rewardSettingsAction: "settings.write" };
    const bodies = admin.split(/export async function /).slice(1);
    expect(bodies.map((b) => b.slice(0, b.indexOf("("))).sort()).toEqual(Object.keys(expected).sort());
    for (const b of bodies) expect(b).toContain(`staffContext("${expected[b.slice(0, b.indexOf("("))]}")`);
    const customer = readFileSync("lib/actions/engagement.ts", "utf8");
    // Customers never write the rewards ledger or moderation fields, and always post as themselves.
    expect(customer).not.toMatch(/rewards|moderateReview|setConversationStatus|from: "staff"/);
  });
});
