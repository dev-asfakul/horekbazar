"use server";
// B9 staff actions: review moderation (`reviews.moderate`), message replies and close/reopen
// (`messages.reply`), reward adjustments (`rewards.write`, Idempotency-Key) and the rewards switch
// (`settings.write`). Capability and step-up are checked on the server by staffContext.
import { refresh } from "next/cache";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, normaliseDigits, ok, parseInteger, serviceErrorCode, staffContext, versionOf } from "@/lib/actions/staff-action";
import { postMessage, setConversationStatus } from "@/lib/modules/messaging/messaging";
import { moderateReview, type ModerationStep } from "@/lib/modules/reviews/reviews";
import { adjustRewards } from "@/lib/modules/rewards/rewards";
import { updateRewardSettings } from "@/lib/modules/settings/settings";

const failed = (error: unknown, values?: Record<string, string>): FormState => {
  const code = serviceErrorCode(error);
  if (code === "try_again") console.error("engagement staff action failed", error instanceof Error ? error.name : "unknown");
  return fail(code, undefined, values);
};

export async function moderateReviewAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("reviews.moderate");
  if ("error" in ctx) return ctx.error;
  const kind = field(form, "kind");
  const text = field(form, "text").slice(0, 1000);
  let step: ModerationStep;
  if (kind === "publish") step = { kind };
  else if (kind === "reject") {
    if (!text.trim()) return fail("fix_fields", { text: "required" }, { text });
    step = { kind, reason: text.slice(0, 300) };
  } else if (kind === "reply") {
    if (!text.trim()) return fail("fix_fields", { text: "required" }, { text });
    step = { kind, body: text };
  } else return fail("try_again");
  try {
    await moderateReview(ctx.db, ctx.actor, field(form, "reviewId"), versionOf(form), step);
  } catch (error) {
    return failed(error, { text });
  }
  refresh();
  return ok("review_updated");
}

export async function staffReplyAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("messages.reply");
  if ("error" in ctx) return ctx.error;
  const body = field(form, "body").slice(0, 2000);
  if (!body.trim()) return fail("fix_fields", { body: "required" }, { body });
  try {
    await postMessage(ctx.client, ctx.db, { from: "staff", actor: ctx.actor }, field(form, "conversationId"), { body, clientKey: field(form, "clientKey") });
  } catch (error) {
    return failed(error, { body });
  }
  refresh();
  return ok("message_sent");
}

export async function conversationStatusAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("messages.reply");
  if ("error" in ctx) return ctx.error;
  const status = field(form, "status") === "closed" ? "closed" : "open";
  try {
    await setConversationStatus(ctx.db, ctx.actor, field(form, "conversationId"), versionOf(form), status);
  } catch (error) {
    return failed(error);
  }
  refresh();
  return ok(status === "closed" ? "conversation_closed" : "conversation_reopened");
}

export async function adjustRewardsAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("rewards.write");
  if ("error" in ctx) return ctx.error;
  const raw = normaliseDigits(field(form, "points"));
  const values = { userId: field(form, "userId").trim(), points: raw, reason: field(form, "reason").slice(0, 300) };
  const errors: Record<string, string> = {};
  const points = /^-?\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  if (!values.userId) errors.userId = "required";
  if (!Number.isInteger(points) || points === 0) errors.points = "number_invalid";
  if (!values.reason.trim()) errors.reason = "required";
  if (Object.keys(errors).length) return fail("fix_fields", errors, values);
  try {
    await adjustRewards(ctx.db, ctx.client, ctx.actor, { userId: values.userId, points, reason: values.reason, idempotencyKey: field(form, "idempotencyKey") });
  } catch (error) {
    return failed(error, values);
  }
  refresh();
  return ok("rewards_adjusted");
}

export async function rewardSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("settings.write");
  if ("error" in ctx) return ctx.error;
  const values = { pointsPer100Taka: normaliseDigits(field(form, "pointsPer100Taka")), expiryDays: normaliseDigits(field(form, "expiryDays")) };
  const rate = parseInteger(values.pointsPer100Taka, 0, 20);
  const expiry = parseInteger(values.expiryDays, 30, 730);
  const errors: Record<string, string> = {};
  if (rate === null) errors.pointsPer100Taka = "number_invalid";
  if (expiry === null) errors.expiryDays = "number_invalid";
  if (Object.keys(errors).length) return fail("fix_fields", errors, values);
  try {
    await updateRewardSettings(ctx.db, ctx.actor, versionOf(form), { enabled: field(form, "enabled") === "on", rules: { pointsPer100Taka: rate!, expiryDays: expiry! } });
  } catch (error) {
    return failed(error, values);
  }
  refresh();
  return ok("settings_saved");
}
