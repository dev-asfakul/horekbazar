import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { canClaim, guestLinkFor, guestOrderPath, guestOrderToken, hashGuestToken, isGuestToken } from "@/lib/modules/orders/guest";
import { couponStateProblem, type CouponRule } from "@/lib/modules/pricing/engine";

const env = { AUTH_SECRET: "x".repeat(48) };

describe("guest order links (D28)", () => {
  it("are 256-bit, URL-safe, deterministic per order and secret", () => {
    const id = new ObjectId();
    const token = guestOrderToken(id, env);
    expect(isGuestToken(token)).toBe(true);
    expect(token).toBe(guestOrderToken(String(id), env));
    expect(token).not.toBe(guestOrderToken(new ObjectId(), env));
    expect(token).not.toBe(guestOrderToken(id, { AUTH_SECRET: "y".repeat(48) }));
    expect(hashGuestToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(guestOrderPath("en", token)).toBe(`/en/order-status/${token}`);
    expect(guestOrderPath("bn", token)).toBe(`/order-status/${token}`);
  });

  it("refuse to make a link without a real secret", () => {
    expect(() => guestOrderToken(new ObjectId(), {})).toThrow();
    expect(() => guestOrderToken(new ObjectId(), { AUTH_SECRET: "short" })).toThrow();
  });

  it("re-derive the link only for the order it was made for", () => {
    const id = new ObjectId();
    const token = guestOrderToken(id, env);
    const order = { _id: id, guest: { tokenHash: hashGuestToken(token), expiresAt: new Date() } };
    expect(guestLinkFor(order, env)).toBe(token);
    expect(guestLinkFor({ ...order, _id: new ObjectId() }, env)).toBeNull();
    expect(guestLinkFor({ _id: id }, env)).toBeNull();
    expect(guestLinkFor(order, { AUTH_SECRET: "z".repeat(48) })).toBeNull();
  });

  it("reject malformed tokens before any lookup", () => {
    for (const bad of ["", "abc", "HB-261025-ABC123", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}/`]) expect(isGuestToken(bad)).toBe(false);
  });
});

describe("claiming a guest order", () => {
  const order = { customer: { name: "Rahim", email: "Rahim@Example.com" } };
  it("needs a verified email equal to the order email", () => {
    expect(canClaim(order, { email: "rahim@example.com", emailVerified: true })).toBe(true);
    expect(canClaim(order, { email: "rahim@example.com", emailVerified: false })).toBe(false);
    expect(canClaim(order, { email: "other@example.com", emailVerified: true })).toBe(false);
    expect(canClaim({ ...order, userId: "u1" }, { email: "rahim@example.com", emailVerified: true })).toBe(false);
    expect(canClaim({ customer: { name: "x", email: "" } }, { email: "", emailVerified: true })).toBe(false);
  });
});

describe("coupons for buyers without an account", () => {
  const base: CouponRule = {
    id: "c1", code: "SAVE", kind: "percent", value: 10, status: "active", startsAt: new Date(0), used: 0, customerUsed: 0, firstOrderOnly: false, customerHasOrders: false,
    include: { categoryIds: [], productIds: [] }, exclude: { categoryIds: [], productIds: [] },
  } as unknown as CouponRule;
  const now = new Date();
  it("ask for an account only when the coupon is per customer or first order only", () => {
    expect(couponStateProblem({ ...base, guest: true }, now)).toBeNull();
    expect(couponStateProblem({ ...base, guest: true, perCustomerLimit: 1 }, now)).toBe("account_required");
    expect(couponStateProblem({ ...base, guest: true, firstOrderOnly: true }, now)).toBe("account_required");
    expect(couponStateProblem({ ...base, perCustomerLimit: 1 }, now)).toBeNull();
  });
});
