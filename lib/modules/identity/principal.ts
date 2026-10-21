// Principal and access decisions (domain-rules §1). Every protected server operation calls
// `decideAccess` with one capability. Hiding a control is never authorisation.
// The decision is pure so it is unit-tested for every capability and every principal shape.
import { ObjectId, type Db } from "mongodb";
import { STEP_UP_CAPABILITIES, STEP_UP_WINDOW_MS, type Capability } from "./capabilities.ts";
import { resolveRole, type ResolvedRole } from "./roles.ts";
import { AUTH_COLLECTIONS } from "./schema.ts";

export interface PrincipalUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  locale: "bn" | "en";
  phone: string | null;
  staffRoleKey: string | null;
}

export interface PrincipalSession {
  id: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  stepUpAt: Date | null;
  /** When this session passed a second factor (sign-in code, enrolment or step-up). */
  secondFactorAt: Date | null;
}

export interface Principal {
  user: PrincipalUser;
  session: PrincipalSession;
  role: ResolvedRole | null;
}

export type AccessDecision =
  | { result: "allowed" }
  | { result: "signed_out" }
  /** Signed in but no staff role, or the role lacks the capability. */
  | { result: "denied" }
  /** The role requires 2FA and the user has not enrolled: only enrolment is allowed. */
  | { result: "two_factor_enrolment" }
  /**
   * The user has 2FA but this session never passed it (Better Auth's two-factor plugin intercepts
   * only email/password sign-in, so a Google sign-in arrives without it). Only the code check is allowed.
   */
  | { result: "second_factor" }
  /** The capability needs a second-factor check within the last 10 minutes. */
  | { result: "step_up" };

export function decideAccess(principal: Principal | null, capability: Capability, options: { mutation?: boolean; now?: Date } = {}): AccessDecision {
  if (!principal) return { result: "signed_out" };
  const { role, user, session } = principal;
  if (!role || !user.emailVerified) return { result: "denied" };
  if (role.twoFactorRequired && !user.twoFactorEnabled) return { result: "two_factor_enrolment" };
  if (user.twoFactorEnabled && !session.secondFactorAt) return { result: "second_factor" };
  if (!role.capabilities.has(capability)) return { result: "denied" };
  if (options.mutation && STEP_UP_CAPABILITIES.has(capability)) {
    const now = (options.now ?? new Date()).getTime();
    if (!session.stepUpAt || now - session.stepUpAt.getTime() > STEP_UP_WINDOW_MS || !user.twoFactorEnabled) return { result: "step_up" };
  }
  return { result: "allowed" };
}

/** Any staff surface (the admin shell) needs a verified account with a role, enrolled in 2FA if required. */
export function decideStaffShell(principal: Principal | null): AccessDecision {
  if (!principal) return { result: "signed_out" };
  if (!principal.role || !principal.user.emailVerified) return { result: "denied" };
  if (principal.role.twoFactorRequired && !principal.user.twoFactorEnabled) return { result: "two_factor_enrolment" };
  if (principal.user.twoFactorEnabled && !principal.session.secondFactorAt) return { result: "second_factor" };
  return { result: "allowed" };
}

/** Matches an id stored either as a string or as an ObjectId (the adapter stores references as ObjectId). */
export const idFilter = (id: string) => (ObjectId.isValid(id) && String(new ObjectId(id)) === id ? { $in: [id, new ObjectId(id)] } : id);

/**
 * Loads the principal for a validated Better Auth session. The user and session are re-read from
 * MongoDB so role changes, 2FA changes and step-up apply on the next request (no cookie cache).
 */
export async function loadPrincipal(db: Db, sessionToken: string): Promise<Principal | null> {
  const session = await db.collection(AUTH_COLLECTIONS.session).findOne({ token: sessionToken });
  if (!session || !(session.expiresAt instanceof Date) || session.expiresAt.getTime() <= Date.now()) return null;
  const user = await db.collection(AUTH_COLLECTIONS.user).findOne({ _id: idFilter(String(session.userId)) as never });
  if (!user) return null;
  const staffRoleKey = typeof user.staffRoleKey === "string" && user.staffRoleKey ? user.staffRoleKey : null;
  return {
    user: {
      id: String(user._id),
      email: String(user.email),
      name: String(user.name ?? ""),
      emailVerified: user.emailVerified === true,
      twoFactorEnabled: user.twoFactorEnabled === true,
      locale: user.locale === "en" ? "en" : "bn",
      phone: typeof user.phone === "string" ? user.phone : null,
      staffRoleKey,
    },
    session: {
      id: String(session._id),
      token: sessionToken,
      createdAt: session.createdAt as Date,
      expiresAt: session.expiresAt,
      stepUpAt: session.stepUpAt instanceof Date ? session.stepUpAt : null,
      secondFactorAt: session.secondFactorAt instanceof Date ? session.secondFactorAt : null,
    },
    role: await resolveRole(db, staffRoleKey),
  };
}
