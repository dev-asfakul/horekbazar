"use server";
// B9 part 2 customer actions: save or remove this browser's push subscription and its topics, and
// turn notifications off on every browser. Signed-in customer only (getPrincipal on the server),
// rate limited per customer; nothing is saved while push is not configured. The offers topic is a
// separate choice from order updates and is off unless the customer ticks it (domain-rules §1).
import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/actions/form-state";
import { fail, ok } from "@/lib/actions/staff-action";
import { pushConfig } from "@/lib/adapters/push/webpush";
import { getDatabase } from "@/lib/adapters/db/client";
import { getPrincipal } from "@/lib/auth/server";
import { checkLimits, LIMITS } from "@/lib/modules/identity/limits";
import { removeAllPushSubscriptions, removePushSubscription, savePushSubscription } from "@/lib/modules/notifications/notifications";
import { getSetupStatus } from "@/lib/setup/status";

export type PushActionResult = { ok: true } | { ok: false; error: "signed_out" | "rate_limited" | "limits_unavailable" | "not_available" | "invalid" | "try_again" };

const b64 = (max: number) => z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/).max(max);
const subscriptionInput = z
  .object({
    endpoint: z.string().url().max(1000).regex(/^https:\/\//),
    keys: z.object({ p256dh: b64(200), auth: b64(50) }),
    topics: z.object({ orders: z.boolean(), marketing: z.boolean() }).strict(),
    locale: z.enum(["bn", "en"]),
  })
  .strict();

async function customer() {
  if (!(await getSetupStatus(process.env)).ready) return { error: "try_again" as const };
  if (!pushConfig()) return { error: "not_available" as const };
  const principal = await getPrincipal();
  if (!principal) return { error: "signed_out" as const };
  const limit = await checkLimits([{ rule: LIMITS.pushChange, key: principal.user.id }]);
  if (limit === "limited") return { error: "rate_limited" as const };
  if (limit === "unavailable") return { error: "limits_unavailable" as const };
  return { userId: principal.user.id, db: await getDatabase() };
}

/** Saves this browser's subscription with the chosen topics (called by PushOptIn after subscribe). */
export async function savePushSubscriptionAction(input: unknown): Promise<PushActionResult> {
  const parsed = subscriptionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ctx = await customer();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  try {
    await savePushSubscription(ctx.db, ctx.userId, parsed.data);
  } catch (error) {
    console.error("push subscription save failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "try_again" };
  }
  return { ok: true };
}

/** Removes this browser's subscription (after PushOptIn unsubscribed it in the browser). */
export async function removePushSubscriptionAction(input: unknown): Promise<PushActionResult> {
  const parsed = z.object({ endpoint: z.string().max(1000) }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const principal = await getPrincipal();
  if (!principal) return { ok: false, error: "signed_out" };
  try {
    await removePushSubscription(await getDatabase(), principal.user.id, parsed.data.endpoint);
  } catch (error) {
    console.error("push subscription remove failed", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "try_again" };
  }
  return { ok: true };
}

/** Form action: turn notifications off on every browser of this account. */
export async function removeAllPushAction(): Promise<FormState> {
  const principal = await getPrincipal();
  if (!principal) return fail("signed_out");
  try {
    await removeAllPushSubscriptions(await getDatabase(), principal.user.id);
  } catch (error) {
    console.error("push subscriptions remove failed", error instanceof Error ? error.name : "unknown");
    return fail("try_again");
  }
  refresh();
  return ok("push_all_off");
}
