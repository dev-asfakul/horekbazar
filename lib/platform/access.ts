// Staff access for admin pages (BUILD-PLAN §1: capability checked on the server for every request).
// Staff identity arrives in B3 (Better Auth + staffRoles); until then there is no principal, so
// every capability is denied in a production build. Proposed (B2): a local `next dev` server opens
// read-only admin pages without sign-in so the developer can see integration health; B3 removes this.
export type Capability = "platform.read";

export type AccessDecision = { allowed: true; via: "development_server" } | { allowed: false; capability: Capability };

export function checkStaffAccess(capability: Capability, env: Record<string, string | undefined> = process.env): AccessDecision {
  if (env.NODE_ENV === "development") return { allowed: true, via: "development_server" };
  return { allowed: false, capability };
}
