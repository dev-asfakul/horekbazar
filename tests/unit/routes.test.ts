import { describe, expect, it } from "vitest";
import { localeHref, stripLocalePrefix } from "@/lib/i18n/href";
import { isPendingStorefrontPath } from "@/lib/routes";

describe("isPendingStorefrontPath", () => {
  it("accepts known storefront routes with the right number of segments", () => {
    expect(isPendingStorefrontPath(["cart"])).toBe(true);
    expect(isPendingStorefrontPath(["categories"])).toBe(true);
    expect(isPendingStorefrontPath(["c", "kitchen"])).toBe(true);
    expect(isPendingStorefrontPath(["c", "kitchen", "cookware", "pots"])).toBe(true);
    expect(isPendingStorefrontPath(["p", "steel-pot-5l"])).toBe(true);
    expect(isPendingStorefrontPath(["collections"])).toBe(true);
    expect(isPendingStorefrontPath(["account", "orders"])).toBe(true);
    expect(isPendingStorefrontPath(["account", "orders", "hb-1001", "invoice"])).toBe(true);
    expect(isPendingStorefrontPath(["checkout", "success", "hb-1001"])).toBe(true);
    expect(isPendingStorefrontPath(["privacy-policy"])).toBe(true);
    expect(isPendingStorefrontPath(["return-policy"])).toBe(true);
  });

  it("rejects unknown routes, too many segments and non-slug segments", () => {
    expect(isPendingStorefrontPath([])).toBe(false);
    expect(isPendingStorefrontPath(["nope"])).toBe(false);
    expect(isPendingStorefrontPath(["c"])).toBe(false);
    expect(isPendingStorefrontPath(["c", "a", "b", "c", "d"])).toBe(false); // depth 4
    expect(isPendingStorefrontPath(["p"])).toBe(false);
    expect(isPendingStorefrontPath(["cart", "x"])).toBe(false);
    expect(isPendingStorefrontPath(["p", "Steel_Pot"])).toBe(false);
    expect(isPendingStorefrontPath(["constructor"])).toBe(false);
    expect(isPendingStorefrontPath(["__proto__"])).toBe(false);
    expect(isPendingStorefrontPath(["privacy"])).toBe(false);
    expect(isPendingStorefrontPath(["checkout", "x"])).toBe(false);
    expect(isPendingStorefrontPath(["account", "wishlist"])).toBe(false); // not in v1 (D16)
    expect(isPendingStorefrontPath(["account", "orders", "hb-1001", "x"])).toBe(false);
    expect(isPendingStorefrontPath(["c", "kitchen-"])).toBe(false);
  });
});

describe("locale paths", () => {
  it("strips a locale prefix", () => {
    expect(stripLocalePrefix("/")).toBe("/");
    expect(stripLocalePrefix("/en")).toBe("/");
    expect(stripLocalePrefix("/en/c/kitchen")).toBe("/c/kitchen");
    expect(stripLocalePrefix("/bn/cart")).toBe("/cart");
    expect(stripLocalePrefix("/cart")).toBe("/cart");
    expect(stripLocalePrefix("/english")).toBe("/english");
  });

  it("builds public URLs: Bengali unprefixed, English under /en", () => {
    expect(localeHref("bn", "/")).toBe("/");
    expect(localeHref("bn", "/cart")).toBe("/cart");
    expect(localeHref("en", "/")).toBe("/en");
    expect(localeHref("en", "/c/kitchen")).toBe("/en/c/kitchen");
  });
});
