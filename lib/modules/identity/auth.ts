// Better Auth instance (DESIGN.md → Stack: Better Auth 1.7.12 with the MongoDB adapter).
// - E-mail and password with mandatory e-mail verification (D13; sec-04) and a 10-character minimum.
// - Passwords are hashed by Better Auth's default scrypt (salted, memory-hard; see docs/PROGRESS.md B3
//   for the note on Motomation rule sec-05, which names bcrypt or argon2).
// - TOTP two-factor with backup codes (twoFactor plugin); mandatory roles are enforced in principal.ts.
// - Google sign-in only when both Google variables are set; hidden otherwise.
// - `staffRoleKey` is `input: false`: no client request can set a role. Only identity/staff.ts writes it.
// - Better Auth's own rate limiter is off: every entry point goes through the HorekBazar rate-limit port
//   (Upstash in production, fail closed), see identity/limits.ts and app/api/auth/[...all]/route.ts.
// - Telemetry is off. Sessions live in MongoDB (no cookie cache), so revocation takes effect at once.
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { twoFactor } from "better-auth/plugins";
import type { Db, MongoClient } from "mongodb";
import { localePath } from "./paths.ts";
import { queueEmail } from "./mail.ts";

import { COOKIE_PREFIX } from "./cookies.ts";
export { COOKIE_PREFIX, SECURE_SESSION_COOKIE, SESSION_COOKIE } from "./cookies.ts";
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export interface AuthDeps {
  db: Db;
  client: MongoClient;
  secret: string;
  baseURL: string;
  google?: { clientId: string; clientSecret: string } | undefined;
  /** Extra plugins (the app adds nextCookies so server actions can set cookies). */
  plugins?: BetterAuthPlugin[];
  production: boolean;
}

type Locale = "bn" | "en";
const userLocale = (user: { locale?: unknown }): Locale => (user.locale === "en" ? "en" : "bn");

export function createAuth(deps: AuthDeps) {
  const site = deps.baseURL.replace(/\/$/, "");
  return betterAuth({
    appName: "HorekBazar",
    secret: deps.secret,
    baseURL: site,
    basePath: "/api/auth",
    trustedOrigins: [site],
    database: mongodbAdapter(deps.db, { client: deps.client, transaction: true }),
    telemetry: { enabled: false },
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const locale = userLocale(user as { locale?: unknown });
        await queueEmail(deps.db, {
          template: "reset-password",
          to: user.email,
          locale,
          name: user.name,
          url: `${site}${localePath(locale, "/reset-password")}?token=${encodeURIComponent(token)}`,
        }, { aggregateId: `reset-${user.id}` });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, token }) => {
        const locale = userLocale(user as { locale?: unknown });
        await queueEmail(deps.db, {
          template: "verify-email",
          to: user.email,
          locale,
          name: user.name,
          url: `${site}${localePath(locale, "/verify-email")}?token=${encodeURIComponent(token)}`,
        }, { aggregateId: `verify-${user.id}` });
      },
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false, defaultValue: "bn", input: true },
        phone: { type: "string", required: false, input: false },
        staffRoleKey: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 15,
      additionalFields: { stepUpAt: { type: "date", required: false, input: false }, secondFactorAt: { type: "date", required: false, input: false } },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
    ...(deps.google ? { socialProviders: { google: { clientId: deps.google.clientId, clientSecret: deps.google.clientSecret, prompt: "select_account" as const } } } : {}),
    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: deps.production,
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
    },
    plugins: [twoFactor({ issuer: "HorekBazar", backupCodeOptions: { amount: 10, length: 10 } }), ...(deps.plugins ?? [])],
  });
}

export type Auth = ReturnType<typeof createAuth>;
