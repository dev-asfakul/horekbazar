"use server";
// Identity server actions (B3). Each one: validates input with Zod, applies the rate-limit port
// (fails closed when the store is unavailable), calls Better Auth on the server, and answers with a
// message code. Sign-up, password reset and resend never reveal whether an e-mail is registered.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { isAPIError } from "better-auth/api";
import { z } from "zod";
import { getIdentity, getPrincipal } from "@/lib/auth/server";
import { checkLimits, clientIp, LIMITS, type LimitOutcome } from "@/lib/modules/identity/limits";
import { localePath, safeNext } from "@/lib/modules/identity/paths";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/modules/identity/auth";
import { idFilter } from "@/lib/modules/identity/principal";
import { normalisePhone } from "@/lib/modules/identity/phone";
import { sessionTokenFromSetCookie } from "@/lib/modules/identity/cookies";
import { markSecondFactor, markStepUp, revokeSessions } from "@/lib/modules/identity/staff";
import { AUTH_COLLECTIONS } from "@/lib/modules/identity/schema";
import { recordAudit } from "@/lib/modules/platform/audit";
import type { FormState } from "@/lib/actions/form-state";

const locale = z.enum(["bn", "en"]).catch("bn");
const email = z.string().trim().toLowerCase().max(254).email();
const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
const name = z.string().trim().min(1).max(80);
const otp = z.string().trim().regex(/^\d{6}$/);
const backupCode = z.string().trim().regex(/^[A-Za-z0-9-]{8,24}$/);

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const fail = (code: string, fields?: Record<string, string>, values?: Record<string, string>): FormState => ({
  status: "error",
  code,
  ...(fields ? { fields } : {}),
  ...(values ? { values } : {}),
});

const limitFail = (outcome: Exclude<LimitOutcome, "ok">) => fail(outcome === "limited" ? "rate_limited" : "limits_unavailable");

const authCode = (error: unknown) => (isAPIError(error) ? String((error.body as { code?: string } | undefined)?.code ?? error.status) : "unknown");

async function ready() {
  const result = await getIdentity();
  return result.ok ? result.identity : null;
}

// ── Sign in ────────────────────────────────────────────────────────────────────────────────

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  const lang = locale.parse(field(form, "locale"));
  const next = safeNext(field(form, "next"), localePath(lang, "/account"));
  const parsed = z.object({ email, password: z.string().min(1).max(PASSWORD_MAX) }).safeParse({ email: field(form, "email"), password: field(form, "password") });
  const values = { email: field(form, "email") };
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0])] = issue.path[0] === "email" ? "email_invalid" : "required";
    return fail("fix_fields", fields, values);
  }
  const identity = await ready();
  if (!identity) return fail("accounts_unavailable");
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.signInIp, key: clientIp(h) }, { rule: LIMITS.signInEmail, key: parsed.data.email }]);
  if (limit !== "ok") return limitFail(limit);
  let twoFactor = false;
  try {
    const result = (await identity.auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password, rememberMe: true }, headers: h })) as { twoFactorRedirect?: boolean };
    twoFactor = result.twoFactorRedirect === true;
  } catch (error) {
    const code = authCode(error);
    if (code === "EMAIL_NOT_VERIFIED") return fail("email_not_verified", undefined, values);
    return fail("invalid_credentials", undefined, values);
  }
  if (twoFactor) redirect(`${localePath(lang, "/login")}?step=2fa&next=${encodeURIComponent(next)}`);
  redirect(next);
}

export async function verifyTwoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const lang = locale.parse(field(form, "locale"));
  const next = safeNext(field(form, "next"), localePath(lang, "/account"));
  const mode = field(form, "mode") === "backup" ? "backup" : "totp";
  const code = (mode === "totp" ? otp : backupCode).safeParse(field(form, "code"));
  if (!code.success) return fail("fix_fields", { code: mode === "totp" ? "otp_format" : "backup_format" });
  const identity = await ready();
  if (!identity) return fail("accounts_unavailable");
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.twoFactorIp, key: clientIp(h) }]);
  if (limit !== "ok") return limitFail(limit);
  let created: string | null;
  try {
    const result =
      mode === "totp"
        ? await identity.auth.api.verifyTOTP({ body: { code: code.data, trustDevice: false }, headers: h, returnHeaders: true })
        : await identity.auth.api.verifyBackupCode({ body: { code: code.data, trustDevice: false }, headers: h, returnHeaders: true });
    created = sessionTokenFromSetCookie(result.headers);
  } catch (error) {
    const c = authCode(error);
    if (c === "INVALID_TWO_FACTOR_COOKIE" || c === "OTP_HAS_EXPIRED") return fail("two_factor_expired");
    if (c === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") return fail("two_factor_locked");
    return fail("invalid_code", { code: "invalid_code" });
  }
  // The session created by this sign-in passed the second factor (checked by decideAccess for staff).
  if (created) await markSecondFactor(identity.db, created);
  redirect(next);
}

export async function signInWithGoogleAction(form: FormData): Promise<void> {
  const lang = locale.parse(field(form, "locale"));
  const next = safeNext(field(form, "next"), localePath(lang, "/account"));
  const identity = await ready();
  if (!identity?.googleEnabled) redirect(`${localePath(lang, "/login")}?error=google_unavailable`);
  const h = await headers();
  if ((await checkLimits([{ rule: LIMITS.oauthIp, key: clientIp(h) }])) !== "ok") redirect(`${localePath(lang, "/login")}?error=rate_limited`);
  const result = (await identity.auth.api.signInSocial({ body: { provider: "google", callbackURL: next, errorCallbackURL: `${localePath(lang, "/login")}?error=google_failed` }, headers: h })) as { url?: string };
  if (!result.url) redirect(`${localePath(lang, "/login")}?error=google_failed`);
  redirect(result.url);
}

export async function signOutAction(form: FormData): Promise<void> {
  const lang = locale.parse(field(form, "locale"));
  const identity = await ready();
  if (identity) await identity.auth.api.signOut({ headers: await headers() }).catch(() => null);
  redirect(localePath(lang, "/"));
}

// ── Registration, verification, password reset ────────────────────────────────────────────

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  const lang = locale.parse(field(form, "locale"));
  const values = { name: field(form, "name"), email: field(form, "email") };
  const parsed = z.object({ name, email, password }).safeParse({ name: field(form, "name"), email: field(form, "email"), password: field(form, "password") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      fields[key] = key === "email" ? "email_invalid" : key === "password" ? "password_length" : "required";
    }
    return fail("fix_fields", fields, values);
  }
  const identity = await ready();
  if (!identity) return fail("accounts_unavailable");
  if (!identity.emailEnabled) return fail("email_unavailable");
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.signUpIp, key: clientIp(h) }]);
  if (limit !== "ok") return limitFail(limit);
  try {
    await identity.auth.api.signUpEmail({ body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, locale: lang }, headers: h });
  } catch (error) {
    // An existing address gets the same answer as a new one (no account enumeration).
    if (authCode(error) !== "USER_ALREADY_EXISTS" && authCode(error) !== "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return fail("try_again", undefined, values);
  }
  return { status: "success", code: "check_inbox", data: { email: parsed.data.email } };
}

export async function resendVerificationAction(_: FormState, form: FormData): Promise<FormState> {
  const lang = locale.parse(field(form, "locale"));
  const parsed = email.safeParse(field(form, "email"));
  if (!parsed.success) return fail("fix_fields", { email: "email_invalid" });
  const identity = await ready();
  if (!identity) return fail("accounts_unavailable");
  if (!identity.emailEnabled) return fail("email_unavailable");
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.resetIp, key: clientIp(h) }, { rule: LIMITS.verifyResendEmail, key: parsed.data }]);
  if (limit !== "ok") return limitFail(limit);
  await identity.auth.api.sendVerificationEmail({ body: { email: parsed.data, callbackURL: localePath(lang, "/verify-email") }, headers: h }).catch(() => null);
  return { status: "success", code: "verification_resent" };
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const lang = locale.parse(field(form, "locale"));
  const parsed = email.safeParse(field(form, "email"));
  if (!parsed.success) return fail("fix_fields", { email: "email_invalid" }, { email: field(form, "email") });
  const identity = await ready();
  if (!identity) return fail("accounts_unavailable");
  if (!identity.emailEnabled) return fail("email_unavailable");
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.resetIp, key: clientIp(h) }, { rule: LIMITS.resetEmail, key: parsed.data }]);
  if (limit !== "ok") return limitFail(limit);
  await identity.auth.api.requestPasswordReset({ body: { email: parsed.data, redirectTo: localePath(lang, "/reset-password") }, headers: h }).catch(() => null);
  return { status: "success", code: "reset_requested" };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const token = z.string().min(10).max(500).safeParse(field(form, "token"));
  if (!token.success) return fail("reset_link_invalid");
  const parsed = password.safeParse(field(form, "password"));
  if (!parsed.success) return fail("fix_fields", { password: "password_length" });
  const identity = await ready();
  if (!identity) return fail("accounts_unavailable");
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.resetIp, key: clientIp(h) }]);
  if (limit !== "ok") return limitFail(limit);
  try {
    await identity.auth.api.resetPassword({ body: { newPassword: parsed.data, token: token.data }, headers: h });
  } catch {
    return fail("reset_link_invalid");
  }
  return { status: "success", code: "password_reset" };
}

// ── Signed-in account ──────────────────────────────────────────────────────────────────────


async function signedIn() {
  const identity = await ready();
  if (!identity) return null;
  const principal = await getPrincipal();
  return principal ? { identity, principal } : null;
}

export async function updateProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  const values = { name: field(form, "name"), phone: field(form, "phone"), language: field(form, "language") };
  const n = name.safeParse(values.name);
  const phoneRaw = values.phone.trim();
  const phone = phoneRaw === "" ? "" : normalisePhone(phoneRaw);
  const fields: Record<string, string> = {};
  if (!n.success) fields.name = "required";
  if (phone === null) fields.phone = "phone_format";
  if (Object.keys(fields).length > 0) return fail("fix_fields", fields, values);
  const language = locale.parse(values.language);
  await ctx.identity.db.collection(AUTH_COLLECTIONS.user).updateOne(
    { _id: idFilter(ctx.principal.user.id) as never },
    phone ? { $set: { name: n.data!, locale: language, phone, updatedAt: new Date() } } : { $set: { name: n.data!, locale: language, updatedAt: new Date() }, $unset: { phone: "" } },
  );
  refresh();
  return { status: "success", code: "profile_saved" };
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  const current = z.string().min(1).max(PASSWORD_MAX).safeParse(field(form, "currentPassword"));
  const next = password.safeParse(field(form, "newPassword"));
  const fields: Record<string, string> = {};
  if (!current.success) fields.currentPassword = "required";
  if (!next.success) fields.newPassword = "password_length";
  if (Object.keys(fields).length > 0) return fail("fix_fields", fields);
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.accountChange, key: ctx.principal.user.id }]);
  if (limit !== "ok") return limitFail(limit);
  try {
    await ctx.identity.auth.api.changePassword({ body: { currentPassword: current.data!, newPassword: next.data!, revokeOtherSessions: true }, headers: h });
  } catch (error) {
    return authCode(error) === "INVALID_PASSWORD" ? fail("fix_fields", { currentPassword: "password_wrong" }) : fail("try_again");
  }
  refresh();
  return { status: "success", code: "password_changed" };
}

export async function revokeSessionAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  const id = field(form, "sessionId");
  const filter = { _id: idFilter(id) as never, userId: idFilter(ctx.principal.user.id) };
  const { deletedCount } = await ctx.identity.db.collection(AUTH_COLLECTIONS.session).deleteOne(filter);
  if (deletedCount !== 1) return fail("try_again");
  refresh();
  return { status: "success", code: "session_revoked" };
}

export async function revokeOtherSessionsAction(): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  await revokeSessions(ctx.identity.db, ctx.principal.user.id, ctx.principal.session.token);
  refresh();
  return { status: "success", code: "sessions_revoked" };
}

// ── Two-factor ─────────────────────────────────────────────────────────────────────────────

export async function enableTwoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  const pw = z.string().min(1).max(PASSWORD_MAX).safeParse(field(form, "password"));
  if (!pw.success) return fail("fix_fields", { password: "required" });
  const limit = await checkLimits([{ rule: LIMITS.accountChange, key: ctx.principal.user.id }]);
  if (limit !== "ok") return limitFail(limit);
  try {
    const result = await ctx.identity.auth.api.enableTwoFactor({ body: { password: pw.data, issuer: "HorekBazar" }, headers: await headers() });
    if (result.method !== "totp") return fail("try_again"); // only authenticator-app TOTP is configured
    const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
    return { status: "success", code: "two_factor_started", data: { totpURI: result.totpURI, secret, backupCodes: result.backupCodes } };
  } catch (error) {
    return authCode(error) === "INVALID_PASSWORD" ? fail("fix_fields", { password: "password_wrong" }) : fail("try_again");
  }
}

export async function confirmTwoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  const code = otp.safeParse(field(form, "code"));
  if (!code.success) return fail("fix_fields", { code: "otp_format" });
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.twoFactorIp, key: clientIp(h) }]);
  if (limit !== "ok") return limitFail(limit);
  let keep: string | undefined;
  try {
    // Better Auth rotates the session here and sets the new cookie, but its JSON body still carries the
    // previous (now deleted) token, so the new token is read from the Set-Cookie header.
    const result = await ctx.identity.auth.api.verifyTOTP({ body: { code: code.data }, headers: h, returnHeaders: true });
    keep = sessionTokenFromSetCookie(result.headers) ?? undefined;
  } catch (error) {
    return authCode(error) === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" ? fail("two_factor_locked") : fail("invalid_code", { code: "invalid_code" });
  }
  // Enabling 2FA revokes every other session (domain-rules §9).
  // If the new token could not be read, every session is revoked and the person signs in again (safe side).
  await revokeSessions(ctx.identity.db, ctx.principal.user.id, keep);
  if (keep) await markStepUp(ctx.identity.db, keep); // the enrolment code is a fresh second factor
  if (ctx.principal.role) {
    await recordAudit(ctx.identity.db, { actor: { id: ctx.principal.user.id, role: ctx.principal.role.key }, action: "identity.two_factor_enabled", target: { type: "user", id: ctx.principal.user.id }, ip: clientIp(h) });
  }
  refresh();
  return { status: "success", code: "two_factor_enabled" };
}

export async function disableTwoFactorAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  if (ctx.principal.role?.twoFactorRequired) return fail("two_factor_required_by_role");
  const pw = z.string().min(1).max(PASSWORD_MAX).safeParse(field(form, "password"));
  if (!pw.success) return fail("fix_fields", { password: "required" });
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.accountChange, key: ctx.principal.user.id }]);
  if (limit !== "ok") return limitFail(limit);
  try {
    await ctx.identity.auth.api.disableTwoFactor({ body: { password: pw.data }, headers: h });
  } catch (error) {
    return authCode(error) === "INVALID_PASSWORD" ? fail("fix_fields", { password: "password_wrong" }) : fail("try_again");
  }
  const current = await getPrincipal();
  await revokeSessions(ctx.identity.db, ctx.principal.user.id, current?.session.token);
  refresh();
  return { status: "success", code: "two_factor_disabled" };
}

/** A fresh authenticator code, valid for 10 minutes of sensitive staff actions (domain-rules §1). */
export async function stepUpAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await signedIn();
  if (!ctx) return fail("signed_out");
  if (!ctx.principal.user.twoFactorEnabled) return fail("two_factor_needed");
  const code = otp.safeParse(field(form, "code"));
  if (!code.success) return fail("fix_fields", { code: "otp_format" });
  const h = await headers();
  const limit = await checkLimits([{ rule: LIMITS.twoFactorIp, key: clientIp(h) }]);
  if (limit !== "ok") return limitFail(limit);
  try {
    await ctx.identity.auth.api.verifyTOTP({ body: { code: code.data }, headers: h });
  } catch (error) {
    return authCode(error) === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" ? fail("two_factor_locked") : fail("invalid_code", { code: "invalid_code" });
  }
  await markStepUp(ctx.identity.db, ctx.principal.session.token);
  refresh();
  return { status: "success", code: "step_up_ok" };
}
