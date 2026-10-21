// Markup checks for the B1 commerce primitives and Button (no browser needed).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LabelTile } from "@/components/commerce/LabelTile";
import { PriceTag } from "@/components/commerce/PriceTag";
import { Button } from "@/components/ui/Button";

const labels = { now: "Price", was: "Was" };
const bn = { numerals: "bengali", grouping: "south_asian" } as const;

describe("PriceTag", () => {
  it("shows the formatted price", () => {
    const html = renderToStaticMarkup(<PriceTag amountMinor={125000} format={bn} labels={labels} />);
    expect(html).toContain("৳১,২৫০");
    expect(html).not.toMatch(/<s[\s>]/);
  });

  it("shows a compare-at price only when it is higher than the price", () => {
    expect(renderToStaticMarkup(<PriceTag amountMinor={100} compareAtMinor={200} format={bn} labels={labels} />)).toMatch(/<s[\s>]/);
    expect(renderToStaticMarkup(<PriceTag amountMinor={200} compareAtMinor={200} format={bn} labels={labels} />)).not.toMatch(/<s[\s>]/);
    expect(renderToStaticMarkup(<PriceTag amountMinor={300} compareAtMinor={200} format={bn} labels={labels} />)).not.toMatch(/<s[\s>]/);
  });
});

describe("LabelTile", () => {
  it("shows the verified net quantity large and the category small", () => {
    const html = renderToStaticMarkup(<LabelTile categoryName="চাল" netQuantity="৫ কেজি" />);
    expect(html).toContain('aria-label="৫ কেজি, চাল"');
    expect(html).toContain("label-tile-quantity");
  });

  it("shows only the category when the net quantity is not verified, and never a placeholder phrase", () => {
    const html = renderToStaticMarkup(<LabelTile categoryName="Rice" />);
    expect(html).not.toContain("label-tile-quantity");
    expect(html.toLowerCase()).not.toContain("coming soon");
    expect(html).not.toContain("<img");
  });
});

describe("Button", () => {
  it("keeps the label while loading and sets aria-busy", () => {
    const html = renderToStaticMarkup(<Button loading>Place order</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Place order");
    expect(html).toContain("spinner");
  });

  it("never renders an inline style attribute (the production CSP blocks them)", () => {
    const html = renderToStaticMarkup(
      <>
        <Button variant="danger">x</Button>
        <PriceTag amountMinor={1} format={bn} labels={labels} />
        <LabelTile categoryName="x" netQuantity="1" />
      </>,
    );
    expect(html).not.toMatch(/\sstyle=/);
  });
});
