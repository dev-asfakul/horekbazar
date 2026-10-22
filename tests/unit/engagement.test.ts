// B9 pure rules: points rounding, reviewer name privacy, the rewards switch, and staff page gates.
import { describe, expect, it } from "vitest";
import { sectionsFor } from "@/lib/admin/sections";
import { CAPABILITIES } from "@/lib/modules/identity/capabilities";
import { ADMIN_PAGE_CAPABILITY, adminPageCapability } from "@/lib/modules/identity/paths";
import { LIMITS } from "@/lib/modules/identity/limits";
import { pointsFor, rewardsOn } from "@/lib/modules/rewards/rewards";
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
