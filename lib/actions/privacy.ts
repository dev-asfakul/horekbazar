"use server";
// B10 part b: /account/privacy actions. Signed-in customer only (getPrincipal on the server); every
// request needs fresh proof of identity (identity/privacy.ts reauthenticate) and is rate limited per
// customer, and wrong passwords count against the same limit. Nothing here logs personal data.
// Deliberately not gated on store setup: a customer's own data rights do not wait for store settings.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { FormState } from "@/lib/actions/form-state";
import { fail, field, ok } from "@/lib/actions/staff-action";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { localeHref } from "@/lib/i18n/href";
import { checkLimits, clientIp, LIMITS } from "@/lib/modules/identity/limits";
import { cancelDeletion, prepareExport, reauthenticate, requestDeletion } from "@/lib/modules/identity/privacy";

async function verified(form: FormData) {
  const identity = await getIdentity();
  if (!identity.ok) return { error: fail("try_again") } as const;
  const principal = await getPrincipal();
  if (!principal) return { error: fail("signed_out") } as const;
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.privacyRequest, key: principal.user.id }]);
  if (limit === "limited") return { error: fail("rate_limited") } as const;
  if (limit === "unavailable") return { error: fail("limits_unavailable") } as const;
  const ctx = await identity.identity.auth.$context;
  const result = await reauthenticate(
    identity.identity.db,
    { userId: principal.user.id, password: field(form, "password"), sessionCreatedAt: principal.session.createdAt },
    (args) => ctx.password.verify(args),
  );
  if (result === "password_required") return { error: fail("fix_fields", { password: "required" }) } as const;
  if (result === "wrong_password") return { error: fail("fix_fields", { password: "password_wrong" }) } as const;
  if (result === "sign_in_again") return { error: fail("privacy_sign_in_again") } as const;
  return { principal, db: identity.identity.db, ip: clientIp(h) } as const;
}

const locale = (form: FormData) => (field(form, "locale") === "en" ? "en" : "bn");

export async function prepareExportAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await verified(form);
  if ("error" in ctx) return ctx.error;
  let token: string;
  try {
    ({ token } = await prepareExport(ctx.db, ctx.principal.user.id, { ip: ctx.ip }));
  } catch (error) {
    console.error("privacy export failed", error instanceof Error ? error.name : "unknown");
    return fail("try_again");
  }
  redirect(`${localeHref(locale(form), "/account/privacy")}?export=${token}`);
}

export async function requestDeletionAction(_: FormState, form: FormData): Promise<FormState> {
  if (field(form, "confirm") !== "on") return fail("fix_fields", { confirm: "required" });
  const ctx = await verified(form);
  if ("error" in ctx) return ctx.error;
  try {
    const res = await requestDeletion(ctx.db, ctx.principal.user.id, { ip: ctx.ip });
    refresh();
    return ok(res.outcome === "received" ? "privacy_deletion_received" : "privacy_deletion_already");
  } catch (error) {
    console.error("privacy deletion request failed", error instanceof Error ? error.name : "unknown");
    return fail("try_again");
  }
}

/** Withdrawing a request needs only the signed-in owner: it makes nothing riskier. */
export async function cancelDeletionAction(): Promise<FormState> {
  const identity = await getIdentity();
  if (!identity.ok) return fail("try_again");
  const principal = await getPrincipal();
  if (!principal) return fail("signed_out");
  const limit = await checkLimits([{ rule: LIMITS.privacyRequest, key: principal.user.id }]);
  if (limit === "limited") return fail("rate_limited");
  if (limit === "unavailable") return fail("limits_unavailable");
  const h = await headers();
  const cancelled = await cancelDeletion(identity.identity.db, principal.user.id, { ip: clientIp(h) });
  refresh();
  return ok(cancelled ? "privacy_deletion_cancelled" : "privacy_deletion_none");
}
