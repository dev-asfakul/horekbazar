// Accent contrast gate (SCHEMA.md → theme.accent: saved only at ≥ 4.5:1 against white and the page background).
import { describe, expect, it } from "vitest";
import { accentContrast, contrastRatio, PAGE_BACKGROUND } from "@/lib/modules/settings/settings";

describe("accent contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2); // the classic AA grey
  });

  it("accepts the default accent and rejects colours that fail on either background", () => {
    expect(accentContrast("#1E4E9C").ok).toBe(true);
    expect(accentContrast("#F5C518").ok).toBe(false);
    // Passes against white (4.54:1) but not against the warmer page background.
    const grey = accentContrast("#767676");
    expect(grey.white).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#767676", PAGE_BACKGROUND)).toBeLessThan(4.5);
    expect(grey.ok).toBe(false);
  });
});
