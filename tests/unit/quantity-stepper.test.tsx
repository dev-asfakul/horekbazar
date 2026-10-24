// Phase B: the shared quantity stepper. Pure helpers plus server markup (no browser needed); the
// click, debounce and stock behaviour in a real browser is covered by tests/e2e-db/commerce/cart.spec.ts.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuantityStepper, clampQty, digitsOnly } from "@/components/commerce/QuantityStepper";
import { ProductQuantity } from "@/components/commerce/ProductQuantity";
import { MAX_CART_LINES, MAX_LINE_QTY } from "@/lib/modules/pricing/limits";
import { MAX_LINE_QTY as SCHEMA_MAX } from "@/lib/modules/pricing/schema";

const labels = { quantity: "Quantity", decrease: "Decrease quantity by 1", increase: "Increase quantity by 1" };
const noop = () => {};

describe("digitsOnly", () => {
  it("keeps Latin and Bengali digits only, at most three", () => {
    expect(digitsOnly("১২")).toBe("12");
    expect(digitsOnly("4a-5")).toBe("45");
    expect(digitsOnly("12345")).toBe("123");
    expect(digitsOnly("abc")).toBe("");
  });
});

describe("clampQty", () => {
  it("keeps whole numbers inside min..max", () => {
    expect(clampQty(0, 1, 6)).toBe(1);
    expect(clampQty(9, 1, 6)).toBe(6);
    expect(clampQty(3.7, 1, 6)).toBe(3);
    expect(clampQty(Number.NaN, 1, 6)).toBe(1);
  });
  it("never goes below min even when max is lower (out of stock)", () => {
    expect(clampQty(5, 1, 0)).toBe(1);
  });
});

describe("limits", () => {
  it("are one shared source for the client and the server schema", () => {
    expect(SCHEMA_MAX).toBe(MAX_LINE_QTY);
    expect(MAX_LINE_QTY).toBe(99);
    expect(MAX_CART_LINES).toBe(50);
  });
});

describe("QuantityStepper markup", () => {
  it("has a labelled field and named buttons, disabled until the page is interactive", () => {
    const html = renderToStaticMarkup(<QuantityStepper value={2} min={1} max={6} onChange={noop} labels={labels} name="quantity" />);
    expect(html).toContain(">Quantity</label>");
    expect(html).toContain('name="quantity"');
    expect(html).toContain('value="2"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain("Decrease quantity by 1");
    expect(html).toContain("Increase quantity by 1");
    // Both buttons are disabled in server markup; the typed field still works without JavaScript.
    expect(html.match(/<button[^>]*disabled/g)?.length).toBe(2);
    expect(html).not.toMatch(/<input[^>]*disabled/);
  });
  it("marks itself busy while a change is on its way", () => {
    expect(renderToStaticMarkup(<QuantityStepper value={1} min={1} max={6} onChange={noop} labels={labels} busy />)).toContain('aria-busy="true"');
  });
});

describe("ProductQuantity", () => {
  it("starts at 1 and posts as quantity", () => {
    const html = renderToStaticMarkup(<ProductQuantity max={6} labels={labels} />);
    expect(html).toContain('name="quantity"');
    expect(html).toContain('value="1"');
    expect(html).toContain('data-testid="pdp-qty"');
  });
});
