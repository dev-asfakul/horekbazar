"use server";
// B7 staff order actions. The capability depends on the target state (TRANSITION_CAPABILITY) and is
// checked on the server; the state machine enforces which step is allowed from the current state.
import { refresh } from "next/cache";
import { ObjectId } from "mongodb";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, ok, staffContext } from "@/lib/actions/staff-action";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/modules/orders/schema";
import { TRANSITION_CAPABILITY, transitionOrder } from "@/lib/modules/orders/transitions";
import { CommerceError } from "@/lib/modules/pricing/cart";

export async function transitionOrderAction(_: FormState, form: FormData): Promise<FormState> {
  const to = ORDER_STATUSES.find((s) => s === field(form, "to")) as OrderStatus | undefined;
  const capability = to ? TRANSITION_CAPABILITY[to] : undefined;
  if (!to || !capability) return fail("try_again");
  const ctx = await staffContext(capability);
  if ("error" in ctx) return ctx.error;
  const id = field(form, "orderId");
  if (!ObjectId.isValid(id)) return fail("commerce_not_found");
  const reason = field(form, "reason").trim().slice(0, 500);
  try {
    await transitionOrder(ctx.db, ctx.client, { orderId: new ObjectId(id), expectedVersion: Number(field(form, "version")), to, reason: reason || undefined, actor: { type: "staff", id: ctx.actor.id, role: ctx.actor.role, ip: ctx.actor.ip ?? null } });
  } catch (error) {
    if (error instanceof CommerceError) return fail(`commerce_${error.code}`, undefined, { reason });
    throw error;
  }
  refresh();
  return ok("order_updated");
}
