"use server";
// B9 part 2 staff actions (`campaigns.send`, checked on the server by staffContext): write a push
// campaign draft, delete a draft, send a draft once. The audience is fixed to customers who ticked
// "offers and news" (domain-rules §1); the link must be a path on this site.
import { refresh } from "next/cache";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, localized, ok, serviceErrorCode, staffContext, versionOf } from "@/lib/actions/staff-action";
import { createCampaign, deleteCampaign, sendCampaign } from "@/lib/modules/notifications/notifications";
import { zInternalPath } from "@/lib/modules/notifications/schema";

const snapshot = (form: FormData) => Object.fromEntries(["titleBn", "titleEn", "bodyBn", "bodyEn", "url"].map((k) => [k, field(form, k)]));

export async function createCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("campaigns.send");
  if ("error" in ctx) return ctx.error;
  const values = snapshot(form);
  const errors: Record<string, string> = {};
  const title = localized(form, "title", 60, true, errors);
  const body = localized(form, "body", 160, true, errors);
  const url = zInternalPath().safeParse(field(form, "url").trim() || "/");
  if (!url.success) errors.url = "path_invalid";
  if (Object.keys(errors).length || !title || !body || !url.success) return fail("fix_fields", errors, values);
  try {
    await createCampaign(ctx.db, ctx.actor, { title, body, url: url.data });
  } catch (error) {
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("campaign_saved");
}

export async function deleteCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("campaigns.send");
  if ("error" in ctx) return ctx.error;
  try {
    await deleteCampaign(ctx.db, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("campaign_deleted");
}

export async function sendCampaignAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("campaigns.send");
  if ("error" in ctx) return ctx.error;
  let recipients: number;
  try {
    recipients = await sendCampaign(ctx.db, ctx.client, ctx.actor, field(form, "id"), versionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("campaign_sent", { recipients });
}
