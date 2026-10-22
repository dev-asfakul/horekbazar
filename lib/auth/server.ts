// App-side identity access: builds the Better Auth instance from the environment, resolves the
// current principal from the request cookies, and gates pages. Server only (imports next/headers).
import { cache } from "react";
import { headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { nextCookies } from "better-auth/next-js";
import type { Db, MongoClient } from "mongodb";
import { checkDatabase, databaseConfig, getClient, getDatabase } from "@/lib/adapters/db/client";
import { emailConfig } from "@/lib/adapters/email/resend";
import { createAuth, type Auth } from "@/lib/modules/identity/auth";
import { decideAccess, decideStaffShell, loadPrincipal, type Principal } from "@/lib/modules/identity/principal";
import { ADMIN_PAGE_CAPABILITY, localePath, type AdminPage } from "@/lib/modules/identity/paths";
import { adminLocale } from "@/lib/i18n/admin";

export type IdentityUnavailable = "database" | "auth_secret" | "site_url";

export interface Identity {
  auth: Auth;
  db: Db;
  client: MongoClient;
  emailEnabled: boolean;
  googleEnabled: boolean;
}

let cached: { key: string; identity: Identity } | null = null;

function siteUrl(env: NodeJS.ProcessEnv): string | null {
  const url = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (url && /^https?:\/\//.test(url)) return url;
  return env.NODE_ENV === "production" ? null : "http://localhost:3000";
}

/** The identity services, or why accounts are unavailable (names only; never values). */
export async function getIdentity(env: NodeJS.ProcessEnv = process.env): Promise<{ ok: true; identity: Identity } | { ok: false; reason: IdentityUnavailable }> {
  // Database first: with no database the whole store is in the shared setup-required state.
  const config = databaseConfig(env);
  if (!config) return { ok: false, reason: "database" };
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) return { ok: false, reason: "auth_secret" };
  const baseURL = siteUrl(env);
  if (!baseURL) return { ok: false, reason: "site_url" };
  if ((await checkDatabase(config)) !== "connected") return { ok: false, reason: "database" };
  const googleId = env.AUTH_GOOGLE_CLIENT_ID?.trim();
  const googleSecret = env.AUTH_GOOGLE_CLIENT_SECRET?.trim();
  const key = [secret, baseURL, config.uri, config.dbName, googleId ?? ""].join("|");
  if (cached?.key === key) return { ok: true, identity: { ...cached.identity, emailEnabled: emailConfig(env) !== null } };
  const db = await getDatabase(env);
  const client = getClient(config);
  const auth = createAuth({
    db,
    client,
    secret,
    baseURL,
    google: googleId && googleSecret ? { clientId: googleId, clientSecret: googleSecret } : undefined,
    plugins: [nextCookies()],
    production: env.NODE_ENV === "production",
  });
  const identity: Identity = { auth, db, client, emailEnabled: emailConfig(env) !== null, googleEnabled: Boolean(googleId && googleSecret) };
  cached = { key, identity };
  return { ok: true, identity };
}

/** Every reason identity cannot start yet (the admin setup page lists them all, by name only). */
export async function identityBlockers(env: NodeJS.ProcessEnv = process.env): Promise<IdentityUnavailable[]> {
  const blockers: IdentityUnavailable[] = [];
  const config = databaseConfig(env);
  if (!config || (await checkDatabase(config)) !== "connected") blockers.push("database");
  if ((env.AUTH_SECRET?.trim().length ?? 0) < 32) blockers.push("auth_secret");
  if (!siteUrl(env)) blockers.push("site_url");
  return blockers;
}

/** The signed-in principal for this request, validated by Better Auth and re-read from MongoDB. */
export const getPrincipal = cache(async function getPrincipal(): Promise<Principal | null> {
  const result = await getIdentity();
  if (!result.ok) return null;
  const { auth, db } = result.identity;
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (!session) return null;
  return loadPrincipal(db, session.session.token);
});

/** Admin language: the signed-in staff member's preference, else the store default. */
export async function getAdminLocale(): Promise<"bn" | "en"> {
  return adminLocale();
}

export async function requireCustomer(locale: "bn" | "en", path: string): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(localePath(locale, path))}`);
  return principal;
}


/**
 * Gate for an admin page. Signed out → /login; 2FA enrolment pending → /admin/security.
 * A denied decision is returned so the page renders the access-denied state (HTTP 200, noindex).
 */
export async function gateStaffPage(path: AdminPage, requestedPath: string = path): Promise<Principal> {
  const capability = ADMIN_PAGE_CAPABILITY[path];
  const principal = await getPrincipal();
  const decision = capability ? decideAccess(principal, capability) : decideStaffShell(principal);
  if (decision.result === "signed_out") redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
  // Enrolment pending, or a 2FA user whose session has not passed the code yet: only /admin/security.
  const pending = decision.result === "two_factor_enrolment" || decision.result === "second_factor";
  if (pending && path !== "/admin/security") redirect("/admin/security");
  if (decision.result === "allowed" || (pending && path === "/admin/security")) return principal!;
  forbidden(); // 403; app/admin/forbidden.tsx names the capability from ADMIN_PAGE_CAPABILITY
}
