"use server";
// B9 part 2b staff actions (`catalogue.write`, checked on the server by staffContext): ask Gemini for
// a draft of chosen product fields, apply one field (product version check, audit row, status
// untouched), or discard a draft. Every action refuses when GEMINI_API_KEY is unset, so the feature
// cannot be reached by posting the form directly. Drafting is limited to 20 per staff member per hour.
import { refresh } from "next/cache";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, fields, ok, parseInteger, serviceErrorCode, staffContext, versionOf } from "@/lib/actions/staff-action";
import { AiError, aiConfig } from "@/lib/adapters/ai/gemini";
import { applyDraftField, createProductDraft, discardDraft } from "@/lib/modules/ai/drafts";
import { AI_FIELD_KEYS, type AiField } from "@/lib/modules/ai/schema";
import { checkLimits, LIMITS } from "@/lib/modules/identity/limits";

const draftVersionOf = (form: FormData) => parseInteger(field(form, "draftVersion"), 0, 1_000_000_000) ?? -1;
const isField = (v: string): v is AiField => (AI_FIELD_KEYS as string[]).includes(v);

export async function createAiDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  const config = aiConfig();
  if (!config) return fail("ai_not_configured");
  const chosen = fields(form, "fields").filter(isField);
  const instructions = field(form, "instructions").slice(0, 300);
  const values = { instructions };
  if (chosen.length === 0) return fail("fix_fields", { fields: "required" }, values);
  const limit = await checkLimits([{ rule: LIMITS.aiDraft, key: ctx.actor.id }]);
  if (limit === "limited") return fail("rate_limited", undefined, values);
  if (limit === "unavailable") return fail("limits_unavailable", undefined, values);
  try {
    await createProductDraft(ctx.db, ctx.actor, field(form, "productId"), { fields: chosen, instructions }, config);
  } catch (error) {
    if (error instanceof AiError) {
      // The code only; the detail never contains the key but may quote the provider.
      console.error("ai draft failed", error.code);
      return fail(error.code, undefined, values);
    }
    return fail(serviceErrorCode(error), undefined, values);
  }
  refresh();
  return ok("ai_draft_created");
}

export async function applyAiFieldAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  if (!aiConfig()) return fail("ai_not_configured");
  const name = field(form, "field");
  if (!isField(name)) return fail("catalogue_invalid");
  try {
    await applyDraftField(ctx.db, ctx.client, ctx.actor, field(form, "draftId"), name, versionOf(form), draftVersionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("ai_field_applied");
}

export async function discardAiDraftAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffContext("catalogue.write");
  if ("error" in ctx) return ctx.error;
  try {
    await discardDraft(ctx.db, ctx.actor, field(form, "draftId"), draftVersionOf(form));
  } catch (error) {
    return fail(serviceErrorCode(error));
  }
  refresh();
  return ok("ai_draft_discarded");
}
