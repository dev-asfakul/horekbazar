"use server";
// B7 customer actions: addresses, order placement, self-cancel. Every one needs a signed-in
// customer (getPrincipal on the server); ids from the form are re-checked against that customer.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { ObjectId } from "mongodb";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, normaliseDigits, ok } from "@/lib/actions/staff-action";
import { getClient, getDatabase, databaseConfig } from "@/lib/adapters/db/client";
import { getPrincipal } from "@/lib/auth/server";
import { localeHref } from "@/lib/i18n/href";
import { checkLimits, clientIp, LIMITS } from "@/lib/modules/identity/limits";
import { cleanAddress, createAddress, deleteAddress, setDefaultAddress, updateAddress, type AddressInput } from "@/lib/modules/orders/addresses";
import { placeOrder } from "@/lib/modules/orders/checkout";
import { claimGuestOrder, guestOrderToken, isGuestToken } from "@/lib/modules/orders/guest";
import { CART_COOKIE } from "@/lib/storefront/cart-owner";
import { ORDERS, type OrderDoc } from "@/lib/modules/orders/schema";
import { transitionOrder } from "@/lib/modules/orders/transitions";
import { requestReturn } from "@/lib/modules/fulfilment/returns";
import { CommerceError } from "@/lib/modules/pricing/cart";
import { getSetupStatus } from "@/lib/setup/status";

const LABELS = ["home", "office", "other"] as const;

async function customer() {
  if (!(await getSetupStatus(process.env)).ready) return { error: fail("try_again") } as const;
  const principal = await getPrincipal();
  if (!principal) return { error: fail("signed_out") } as const;
  return { principal, db: await getDatabase() } as const;
}

const commerceFail = (error: unknown, values?: Record<string, string>): FormState => {
  if (error instanceof CommerceError) return fail(`commerce_${error.code}`, undefined, values);
  console.error("order action failed", error instanceof Error ? error.name : "unknown");
  return fail("try_again", undefined, values);
};

function readAddress(form: FormData): { input?: AddressInput; errors: Record<string, string>; values: Record<string, string> } {
  const keys = ["label", "name", "phone", "zoneId", "district", "area", "line", "landmark"] as const;
  const values = Object.fromEntries(keys.map((k) => [k, field(form, k)])) as Record<(typeof keys)[number], string>;
  const errors: Record<string, string> = {};
  const limits: Record<string, number> = { name: 80, district: 60, area: 80, line: 200, landmark: 120 };
  for (const k of ["name", "district", "area", "line"] as const) if (!values[k].trim()) errors[k] = "required";
  for (const [k, max] of Object.entries(limits)) if ((values as Record<string, string>)[k]!.trim().length > max) errors[k] = "too_long";
  if (!values.phone.trim()) errors.phone = "required";
  if (!values.zoneId) errors.zoneId = "required";
  const label = LABELS.find((l) => l === values.label) ?? "home";
  if (Object.keys(errors).length) return { errors, values };
  return { input: { label, name: values.name, phone: values.phone, zoneId: values.zoneId, district: values.district, area: values.area, line: values.line, landmark: values.landmark, isDefault: form.get("isDefault") === "on" }, errors, values };
}

export async function saveAddressAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  const limit = await checkLimits([{ rule: LIMITS.accountChange, key: ctx.principal.user.id }]);
  if (limit === "limited") return fail("rate_limited");
  const { input, errors, values } = readAddress(form);
  if (!input) return fail("fix_fields", errors, values);
  const id = field(form, "id");
  try {
    if (id) await updateAddress(ctx.db, ctx.principal.user.id, id, Number(field(form, "version")), input);
    else await createAddress(ctx.db, ctx.principal.user.id, input);
  } catch (error) {
    if (error instanceof CommerceError && error.code === "phone_invalid") return fail("fix_fields", { phone: "phone_format" }, values);
    return commerceFail(error, values);
  }
  refresh();
  return ok("address_saved");
}

export async function deleteAddressAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  try {
    await deleteAddress(ctx.db, ctx.principal.user.id, field(form, "id"));
  } catch (error) {
    return commerceFail(error);
  }
  refresh();
  return ok("address_deleted");
}

export async function defaultAddressAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  try {
    await setDefaultAddress(ctx.db, ctx.principal.user.id, field(form, "id"));
  } catch (error) {
    return commerceFail(error);
  }
  refresh();
  return ok("address_saved");
}

/**
 * Places the order. The form carries the address, an optional note, the total the customer saw and
 * the request key generated when the checkout page was rendered. On success: the success page.
 */
export async function placeOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  const limit = await checkLimits([
    { rule: LIMITS.checkoutUser, key: ctx.principal.user.id },
    { rule: LIMITS.checkoutIp, key: clientIp(await headers()) },
  ]);
  if (limit === "limited") return fail("rate_limited");
  if (limit === "unavailable") return fail("limits_unavailable");
  const locale = field(form, "locale") === "en" ? "en" : "bn";
  const expected = Number(field(form, "expectedTotal"));
  const note = field(form, "note").slice(0, 500);
  if (!field(form, "addressId")) return fail("commerce_address_required");
  let orderNumber: string;
  try {
    const client = getClient(databaseConfig(process.env)!);
    const r = await placeOrder(ctx.db, client, {
      userId: ctx.principal.user.id,
      customer: { name: ctx.principal.user.name, email: ctx.principal.user.email },
      addressId: field(form, "addressId"),
      note,
      expectedTotal: Number.isSafeInteger(expected) ? expected : -1,
      idempotencyKey: field(form, "idempotencyKey"),
      locale,
    });
    orderNumber = r.orderNumber;
  } catch (error) {
    return commerceFail(error, { note });
  }
  redirect(localeHref(locale, `/checkout/success/${orderNumber}`));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Guest checkout (Phase F, D28): no account. The device cart, contact details and the delivery address
 * typed at checkout; the same server pricing, stock, zone and request-key checks as a customer's order.
 * On success: the order's secret status page, which is also the confirmation page.
 */
export async function placeGuestOrderAction(_: FormState, form: FormData): Promise<FormState> {
  if (!(await getSetupStatus(process.env)).ready) return fail("try_again");
  // Signed in: the account checkout (saved addresses) is the only one, so orders land in the account.
  if (await getPrincipal()) return fail("commerce_guest_signed_in");
  const raw = (await cookies()).get(CART_COOKIE)?.value ?? "";
  if (!/^[a-f0-9]{32}$/.test(raw)) return fail("commerce_cart_empty");
  const limit = await checkLimits([
    { rule: LIMITS.checkoutDevice, key: raw },
    { rule: LIMITS.checkoutIp, key: clientIp(await headers()) },
  ]);
  if (limit === "limited") return fail("rate_limited");
  if (limit === "unavailable") return fail("limits_unavailable");
  const db = await getDatabase();
  const { input, errors, values } = readAddress(form);
  const email = field(form, "email").trim();
  const note = field(form, "note").slice(0, 500);
  Object.assign(values, { email, note });
  if (!email) errors.email = "required";
  else if (email.length > 254 || !EMAIL.test(email)) errors.email = "email_invalid";
  if (!input || Object.keys(errors).length) return fail("fix_fields", errors, values);
  let address;
  try {
    address = await cleanAddress(db, input);
  } catch (error) {
    if (error instanceof CommerceError && error.code === "phone_invalid") return fail("fix_fields", { phone: "phone_format" }, values);
    return commerceFail(error, values);
  }
  const locale = field(form, "locale") === "en" ? "en" : "bn";
  const expected = Number(field(form, "expectedTotal"));
  let orderId: string;
  try {
    const r = await placeOrder(db, getClient(databaseConfig(process.env)!), {
      guest: { deviceId: raw, address },
      customer: { name: address.name, email },
      note,
      expectedTotal: Number.isSafeInteger(expected) ? expected : -1,
      idempotencyKey: field(form, "idempotencyKey"),
      locale,
    });
    orderId = r.orderId;
  } catch (error) {
    return commerceFail(error, values);
  }
  redirect(localeHref(locale, `/order-status/${guestOrderToken(orderId)}?placed=1`));
}

/**
 * Adds a guest order to the signed-in customer's account, from the order's secret link only, when the
 * account's email is verified and equal to the order's (D28). Never by email alone.
 */
export async function claimGuestOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  const limit = await checkLimits([{ rule: LIMITS.guestClaim, key: ctx.principal.user.id }]);
  if (limit === "limited") return fail("rate_limited");
  if (limit === "unavailable") return fail("limits_unavailable");
  const token = field(form, "token");
  if (!isGuestToken(token)) return fail("commerce_not_found");
  const locale = field(form, "locale") === "en" ? "en" : "bn";
  let orderNumber: string;
  try {
    ({ orderNumber } = await claimGuestOrder(ctx.db, token, ctx.principal.user));
  } catch (error) {
    return commerceFail(error);
  }
  redirect(localeHref(locale, `/account/orders/${orderNumber}`));
}

/** Customer self-cancel (pending or confirmed only; the state machine checks ownership and state). */
export async function cancelMyOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  const order = await ctx.db.collection<OrderDoc>(ORDERS).findOne({ orderNumber: field(form, "orderNumber"), userId: ctx.principal.user.id }, { projection: { _id: 1, version: 1 } });
  if (!order) return fail("commerce_not_found");
  const reason = field(form, "reason").trim().slice(0, 300);
  try {
    await transitionOrder(ctx.db, getClient(databaseConfig(process.env)!), { orderId: new ObjectId(order._id), expectedVersion: Number(field(form, "version")), to: "cancelled_by_customer", actor: { type: "customer", id: ctx.principal.user.id }, reason: reason || undefined });
  } catch (error) {
    return commerceFail(error);
  }
  refresh();
  return ok("order_cancelled");
}

/** B8: the owning customer asks to return delivered items within the return window. */
export async function requestReturnAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer();
  if ("error" in ctx) return ctx.error;
  const limit = await checkLimits([{ rule: LIMITS.returnRequest, key: ctx.principal.user.id }]);
  if (limit === "limited") return fail("rate_limited");
  if (limit === "unavailable") return fail("limits_unavailable");
  const reason = field(form, "reason").trim().slice(0, 500);
  const lineIds = field(form, "lineIds").split(",").filter((l) => /^[a-f0-9]{24}$/.test(l));
  const values: Record<string, string> = { reason };
  const lines: { lineId: string; qty: number }[] = [];
  for (const id of lineIds) {
    const raw = normaliseDigits(field(form, `qty_${id}`));
    values[`qty_${id}`] = raw;
    const qty = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(qty) || qty < 0 || qty > 99) return fail("fix_fields", { [`qty_${id}`]: "number_invalid" }, values);
    if (qty > 0) lines.push({ lineId: id, qty });
  }
  if (!reason) return fail("fix_fields", { reason: "required" }, values);
  try {
    await requestReturn(ctx.db, { userId: ctx.principal.user.id, orderNumber: field(form, "orderNumber"), lines, reason });
  } catch (error) {
    return commerceFail(error, values);
  }
  refresh();
  return ok("return_requested");
}
