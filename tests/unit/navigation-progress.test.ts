// Phase C: which clicks start the navigation bar, and the CSS contract (no full-screen loader,
// reduced motion keeps the bar still). The bar in a real browser: tests/e2e-db/navigation-progress.spec.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { internalTarget } from "@/components/shell/NavigationProgress";

const here = { origin: "https://shop.example", pathname: "/c/rice", search: "" };
const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const a = (href: string, attrs: { target?: string; download?: boolean } = {}) => ({ href, target: attrs.target ?? "", hasAttribute: (n: string) => n === "download" && !!attrs.download });

describe("internalTarget", () => {
  it("accepts a same-origin link to another page or another query", () => {
    expect(internalTarget(plain, a("https://shop.example/p/miniket"), here)?.pathname).toBe("/p/miniket");
    expect(internalTarget(plain, a("/c/rice?page=2"), here)?.search).toBe("?page=2");
  });
  it("ignores the same page, a hash on it, other origins, new tabs, downloads and modifier keys", () => {
    expect(internalTarget(plain, a("/c/rice"), here)).toBeNull();
    expect(internalTarget(plain, a("/c/rice#filters"), here)).toBeNull();
    expect(internalTarget(plain, a("https://other.example/"), here)).toBeNull();
    expect(internalTarget(plain, a("/p/x", { target: "_blank" }), here)).toBeNull();
    expect(internalTarget(plain, a("/p/x", { download: true }), here)).toBeNull();
    expect(internalTarget({ ...plain, metaKey: true }, a("/p/x"), here)).toBeNull();
    expect(internalTarget({ ...plain, ctrlKey: true }, a("/p/x"), here)).toBeNull();
    expect(internalTarget({ ...plain, button: 1 }, a("/p/x"), here)).toBeNull();
  });
});

describe("nav-progress CSS", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const block = css.slice(css.indexOf("/* Navigation progress"), css.indexOf("/* Loading skeletons"));
  it("is a thin bar that never takes clicks", () => {
    expect(block).toMatch(/height: 3px/);
    expect(block).toMatch(/pointer-events: none/);
  });
  it("moves only when motion is allowed", () => {
    const outside = block.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}\n/, "").replace(/@keyframes[\s\S]*?\n\}\n/, "");
    expect(outside).not.toMatch(/animation:|transition:/);
  });
});
