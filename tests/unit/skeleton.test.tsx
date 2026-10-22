import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminTableSkeleton, ListingSkeleton, ProductSkeleton } from "@/components/skeleton/Skeleton";

describe("loading skeletons", () => {
  it("are busy regions with a spoken label and hidden shapes, and reuse the real layout classes", () => {
    const listing = renderToStaticMarkup(<ListingSkeleton label="লোড হচ্ছে" />);
    expect(listing).toContain('aria-busy="true"');
    expect(listing).toContain("লোড হচ্ছে");
    expect(listing).toContain('aria-hidden="true"');
    expect(listing).toContain('class="khata-grid"');
    expect((listing.match(/class="khata-item"/g) ?? []).length).toBe(12);
    expect(renderToStaticMarkup(<ProductSkeleton label="x" />)).toContain('class="pdp-grid"');
    expect(renderToStaticMarkup(<AdminTableSkeleton label="Loading" rows={3} />).match(/sk-table-row/g)).toHaveLength(3);
  });

  it("never animate (static skeletons, DESIGN.md)", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const block = css.slice(css.indexOf("/* Loading skeletons"));
    expect(block).not.toMatch(/animation|@keyframes|transition/);
  });
});
