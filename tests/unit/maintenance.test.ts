import { describe, expect, it } from "vitest";
import { isMaintenanceMode, maintenanceHtml } from "@/lib/maintenance";

describe("maintenance", () => {
  it("is on only for MAINTENANCE_MODE=on", () => {
    expect(isMaintenanceMode({})).toBe(false);
    expect(isMaintenanceMode({ MAINTENANCE_MODE: "off" })).toBe(false);
    expect(isMaintenanceMode({ MAINTENANCE_MODE: "true" })).toBe(false);
    expect(isMaintenanceMode({ MAINTENANCE_MODE: " ON " })).toBe(true);
  });

  it("renders a localised, noindex page styled only through the nonce (no style attributes)", () => {
    const html = maintenanceHtml("bn", "abc123==");
    expect(html).toContain('<html lang="bn"');
    expect(html).toContain("সাইটের কাজ চলছে");
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<style nonce="abc123==">');
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toContain("<script");
    expect(maintenanceHtml("en", "n")).toContain("Down for maintenance");
  });

  it("escapes the nonce", () => {
    expect(maintenanceHtml("en", '"><script>')).not.toContain('"><script>');
  });
});
