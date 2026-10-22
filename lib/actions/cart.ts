"use server";
// B6 storefront cart actions. Each one works without JavaScript (plain form posts) and with it
// (useActionState). Rate limited by address; coupon tries have a tighter limit against guessing.
// When the rate-limit store is unreachable, cart edits still work (they are cheap and guarded by
// compare-and-set; refusing them would stop shopping during a cache outage) but coupon tries are
// refused, so codes cannot be guessed while limits are down.
import { refresh } from "next/cache";
import { headers } from "next/headers";
import type { FormState } from "@/lib/actions/form-state";
import { fail, ok } from "@/lib/actions/staff-action";
import type { LimitRule } from "@/lib/adapters/cache/rate-limit";
import { getDatabase } from "@/lib/adapters/db/client";
import { checkLimits, clientIp, LIMITS } from "@/lib/modules/identity/limits";
import { addToCart, applyCoupon, CommerceError, removeCoupon, setCartQuantity } from "@/lib/modules/pricing/cart";
import { cartOwnerForWrite } from "@/lib/storefront/cart-owner";
import { getSetupStatus } from "@/lib/setup/status";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};
const whole = (s: string) => (/^\d{1,3}$/.test(s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).trim()) ? Number(s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).trim()) : NaN);

async function context(rule: LimitRule = LIMITS.cartIp) {
  if (!(await getSetupStatus(process.env)).ready) return { error: fail("try_again") } as const;
  const limit = await checkLimits([{ rule, key: clientIp(await headers()) }]);
  if (limit === "limited") return { error: fail("rate_limited") } as const;
  if (limit === "unavailable" && rule === LIMITS.couponIp) return { error: fail("limits_unavailable") } as const;
  const db = await getDatabase();
  return { db, owner: await cartOwnerForWrite(db) } as const;
}

const failure = (error: unknown): FormState => {
  if (error instanceof CommerceError) return fail(`commerce_${error.code}`);
  return fail("try_again");
};

export async function addToCartAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  try {
    await addToCart(ctx.db, ctx.owner, text(form, "variantId"), whole(text(form, "quantity") || "1"));
  } catch (error) {
    return failure(error);
  }
  refresh();
  return ok("cart_added");
}

export async function setCartQuantityAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  try {
    await setCartQuantity(ctx.db, ctx.owner, text(form, "variantId"), whole(text(form, "quantity")));
  } catch (error) {
    return failure(error);
  }
  refresh();
  return ok("cart_updated");
}

export async function removeCartLineAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  try {
    await setCartQuantity(ctx.db, ctx.owner, text(form, "variantId"), 0);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return ok("cart_removed");
}

export async function applyCouponAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await context(LIMITS.couponIp);
  if ("error" in ctx) return ctx.error;
  const code = text(form, "code");
  if (!code.trim()) return fail("fix_fields", { code: "required" }, { code });
  try {
    await applyCoupon(ctx.db, ctx.owner, code.slice(0, 40));
  } catch (error) {
    if (error instanceof CommerceError) return fail(`commerce_${error.code}`, undefined, { code });
    return fail("try_again", undefined, { code });
  }
  refresh();
  return ok("coupon_applied");
}

export async function removeCouponAction(): Promise<FormState> {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  try {
    await removeCoupon(ctx.db, ctx.owner);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return ok("coupon_removed");
}
