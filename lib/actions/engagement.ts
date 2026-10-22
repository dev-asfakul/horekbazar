"use server";
// B9 customer actions: write a review, open a conversation, send a message. Every one needs a
// signed-in customer (getPrincipal on the server); ids from the form are re-checked by the service
// against that customer. Rate limited per customer (lib/modules/identity/limits.ts).
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, normaliseDigits, ok } from "@/lib/actions/staff-action";
import { getClient, getDatabase, databaseConfig } from "@/lib/adapters/db/client";
import { getPrincipal } from "@/lib/auth/server";
import { localeHref } from "@/lib/i18n/href";
import type { LimitRule } from "@/lib/adapters/cache/rate-limit";
import { checkLimits, LIMITS } from "@/lib/modules/identity/limits";
import { postMessage, startConversation } from "@/lib/modules/messaging/messaging";
import { CommerceError } from "@/lib/modules/pricing/cart";
import { submitReview } from "@/lib/modules/reviews/reviews";
import { getSettings } from "@/lib/modules/settings/settings";
import { getSetupStatus } from "@/lib/setup/status";

async function customer(rule: LimitRule) {
  if (!(await getSetupStatus(process.env)).ready) return { error: fail("try_again") } as const;
  const principal = await getPrincipal();
  if (!principal) return { error: fail("signed_out") } as const;
  const limit = await checkLimits([{ rule, key: principal.user.id }]);
  if (limit === "limited") return { error: fail("rate_limited") } as const;
  if (limit === "unavailable") return { error: fail("limits_unavailable") } as const;
  return { principal, db: await getDatabase() } as const;
}

const commerceFail = (error: unknown, values?: Record<string, string>): FormState => {
  if (error instanceof CommerceError) return fail(`commerce_${error.code}`, undefined, values);
  console.error("engagement action failed", error instanceof Error ? error.name : "unknown");
  return fail("try_again", undefined, values);
};

export async function submitReviewAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer(LIMITS.reviewSubmit);
  if ("error" in ctx) return ctx.error;
  const values = { rating: normaliseDigits(field(form, "rating")), title: field(form, "title").slice(0, 120), body: field(form, "body").slice(0, 2000) };
  const errors: Record<string, string> = {};
  const rating = Number(values.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "required";
  if (!values.body.trim()) errors.body = "required";
  if (Object.keys(errors).length) return fail("fix_fields", errors, values);
  try {
    const settings = await getSettings(ctx.db);
    await submitReview(ctx.db, { id: ctx.principal.user.id, name: ctx.principal.user.name }, { orderId: field(form, "orderId"), lineId: field(form, "lineId"), rating, title: values.title, body: values.body }, { enabled: settings.features.reviews });
  } catch (error) {
    return commerceFail(error, values);
  }
  refresh();
  return ok("review_submitted");
}

export async function startConversationAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer(LIMITS.messagePost);
  if ("error" in ctx) return ctx.error;
  const values = { subject: field(form, "subject").slice(0, 120), body: field(form, "body").slice(0, 2000), orderNumber: field(form, "orderNumber").slice(0, 40) };
  const errors: Record<string, string> = {};
  if (!values.subject.trim()) errors.subject = "required";
  if (!values.body.trim()) errors.body = "required";
  if (Object.keys(errors).length) return fail("fix_fields", errors, values);
  let id: string;
  try {
    const client = getClient(databaseConfig(process.env)!);
    ({ id } = await startConversation(client, ctx.db, { id: ctx.principal.user.id, name: ctx.principal.user.name }, { ...values, clientKey: field(form, "clientKey") }));
  } catch (error) {
    return commerceFail(error, values);
  }
  const locale = field(form, "locale") === "en" ? "en" : "bn";
  redirect(localeHref(locale, `/account/messages/${id}`));
}

export async function postCustomerMessageAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await customer(LIMITS.messagePost);
  if ("error" in ctx) return ctx.error;
  const body = field(form, "body").slice(0, 2000);
  if (!body.trim()) return fail("fix_fields", { body: "required" }, { body });
  try {
    const client = getClient(databaseConfig(process.env)!);
    await postMessage(client, ctx.db, { from: "customer", customer: { id: ctx.principal.user.id, name: ctx.principal.user.name } }, field(form, "conversationId"), { body, clientKey: field(form, "clientKey") });
  } catch (error) {
    return commerceFail(error, { body });
  }
  refresh();
  return ok("message_sent");
}
