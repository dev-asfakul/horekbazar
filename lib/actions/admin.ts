"use server";
// Admin identity actions (B3): first-owner setup (D23) and staff management. Every staff mutation
// re-resolves the principal and calls decideAccess(…, "staff.manage", { mutation: true }) on the server,
// which also demands a fresh second-factor check (step-up) within the last 10 minutes.
import { headers } from "next/headers";
import { refresh } from "next/cache";
import { randomBytes } from "node:crypto";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/modules/identity/auth";
import { checkLimits, clientIp, LIMITS } from "@/lib/modules/identity/limits";
import { decideAccess } from "@/lib/modules/identity/principal";
import { ROLE_KEY, AUTH_COLLECTIONS } from "@/lib/modules/identity/schema";
import {
  claimInstallation,
  completeInstallation,
  ownerExists,
  releaseInstallation,
  resetStaffTwoFactor,
  setStaffRole,
  setupTokenMatches,
  StaffRuleError,
} from "@/lib/modules/identity/staff";
import type { FormState } from "@/lib/actions/form-state";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};
const fail = (code: string, fields?: Record<string, string>, values?: Record<string, string>): FormState => ({ status: "error", code, ...(fields ? { fields } : {}), ...(values ? { values } : {}) });

// ── First-owner setup (D23 option a: e-mail verification, plus the deployer's SETUP_TOKEN) ──────

export async function setupOwnerAction(_: FormState, form: FormData): Promise<FormState> {
  const values = { name: field(form, "name"), email: field(form, "email") };
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(80),
      email: z.string().trim().toLowerCase().max(254).email(),
      password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
      setupToken: z.string().min(1).max(200),
    })
    .safeParse({ name: values.name, email: values.email, password: field(form, "password"), setupToken: field(form, "setupToken") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fields[key] = key === "email" ? "email_invalid" : key === "password" ? "password_length" : "required";
    }
    return fail("fix_fields", fields, values);
  }
  const result = await getIdentity();
  if (!result.ok) return fail("accounts_unavailable");
  const { auth, db, emailEnabled } = result.identity;
  if (!emailEnabled) return fail("email_unavailable");
  const h = await headers();
  const ip = clientIp(h);
  const limit = await checkLimits([{ rule: LIMITS.setupIp, key: ip }]);
  if (limit !== "ok") return fail(limit === "limited" ? "rate_limited" : "limits_unavailable");
  if (!setupTokenMatches(process.env.SETUP_TOKEN?.trim(), parsed.data.setupToken.trim())) return fail("fix_fields", { setupToken: "setup_token_wrong" }, values);
  if (await ownerExists(db)) return fail("setup_done");
  if (await db.collection(AUTH_COLLECTIONS.user).findOne({ email: parsed.data.email }, { projection: { _id: 1 } })) return fail("fix_fields", { email: "email_taken_setup" }, values);

  const reservation = `pending-${randomBytes(12).toString("hex")}`;
  if (!(await claimInstallation(db, reservation))) return fail("setup_done");
  try {
    const created = await auth.api.signUpEmail({ body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, locale: "bn" }, headers: h });
    await completeInstallation(db, reservation, created.user.id, ip);
  } catch (error) {
    await releaseInstallation(db, reservation);
    return fail(isAPIError(error) ? "try_again" : "try_again", undefined, values);
  }
  return { status: "success", code: "owner_created", data: { email: parsed.data.email } };
}

// ── Staff management ────────────────────────────────────────────────────────────────────────

async function staffActor() {
  const result = await getIdentity();
  if (!result.ok) return { error: fail("accounts_unavailable") } as const;
  const principal = await getPrincipal();
  const decision = decideAccess(principal, "staff.manage", { mutation: true });
  if (decision.result === "step_up") return { error: fail("step_up_required") } as const;
  if (decision.result !== "allowed") return { error: fail("forbidden") } as const;
  return { identity: result.identity, principal: principal! } as const;
}

const staffErrorCode = (error: unknown) => (error instanceof StaffRuleError ? `staff_${error.code}` : "try_again");

export async function assignStaffRoleAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffActor();
  if ("error" in ctx) return ctx.error;
  const values = { email: field(form, "email"), roleKey: field(form, "roleKey") };
  const parsed = z.object({ email: z.string().trim().toLowerCase().email(), roleKey: z.string().regex(ROLE_KEY) }).safeParse(values);
  if (!parsed.success) return fail("fix_fields", { email: "email_invalid" }, values);
  try {
    await setStaffRole(ctx.identity.db, ctx.identity.client, ctx.principal, { email: parsed.data.email, roleKey: parsed.data.roleKey, ip: clientIp(await headers()) });
  } catch (error) {
    return fail(staffErrorCode(error), undefined, values);
  }
  refresh();
  return { status: "success", code: "staff_saved" };
}

export async function changeStaffRoleAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffActor();
  if ("error" in ctx) return ctx.error;
  const userId = field(form, "userId");
  const roleKey = field(form, "roleKey");
  if (!userId || !(roleKey === "" || ROLE_KEY.test(roleKey))) return fail("try_again");
  try {
    await setStaffRole(ctx.identity.db, ctx.identity.client, ctx.principal, { userId, roleKey: roleKey === "" ? null : roleKey, ip: clientIp(await headers()) });
  } catch (error) {
    return fail(staffErrorCode(error));
  }
  refresh();
  return { status: "success", code: roleKey === "" ? "staff_removed" : "staff_saved" };
}

export async function resetStaffTwoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await staffActor();
  if ("error" in ctx) return ctx.error;
  try {
    await resetStaffTwoFactor(ctx.identity.db, ctx.principal, field(form, "userId"), clientIp(await headers()));
  } catch (error) {
    return fail(staffErrorCode(error));
  }
  refresh();
  return { status: "success", code: "staff_two_factor_reset" };
}
