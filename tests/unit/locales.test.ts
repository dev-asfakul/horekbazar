import { describe, expect, it } from "vitest";
import { routeLocale } from "@/lib/i18n/locales";

describe("routeLocale", () => {
  it("rewrites unprefixed paths to the Bengali default", () => {
    expect(routeLocale("/")).toEqual({ kind: "rewrite", locale: "bn", pathname: "/bn" });
    expect(routeLocale("/p/mustard-oil")).toEqual({ kind: "rewrite", locale: "bn", pathname: "/bn/p/mustard-oil" });
  });
  it("passes English paths through", () => {
    expect(routeLocale("/en")).toEqual({ kind: "next", locale: "en" });
    expect(routeLocale("/en/p/mustard-oil")).toEqual({ kind: "next", locale: "en" });
  });
  it("redirects an explicit /bn prefix to the canonical unprefixed URL", () => {
    expect(routeLocale("/bn")).toEqual({ kind: "redirect", pathname: "/" });
    expect(routeLocale("/bn/c/grocery")).toEqual({ kind: "redirect", pathname: "/c/grocery" });
  });
  it("does not treat lookalike segments as locales", () => {
    expect(routeLocale("/english")).toEqual({ kind: "rewrite", locale: "bn", pathname: "/bn/english" });
    expect(routeLocale("/bnx")).toEqual({ kind: "rewrite", locale: "bn", pathname: "/bn/bnx" });
  });
  it("bypasses API routes", () => {
    expect(routeLocale("/api/health")).toEqual({ kind: "bypass" });
  });
  it("does not locale-route /admin (own root layout), but keeps /administration a storefront path", () => {
    expect(routeLocale("/admin")).toEqual({ kind: "bypass" });
    expect(routeLocale("/admin/health")).toEqual({ kind: "bypass" });
    expect(routeLocale("/administration")).toEqual({ kind: "rewrite", locale: "bn", pathname: "/bn/administration" });
  });
});
