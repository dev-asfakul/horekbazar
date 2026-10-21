// Staff roles: seeding and lookup (domain-rules §1). Relative `.ts` imports for the CLI scripts.
import type { Db } from "mongodb";
import { BUILT_IN_ROLES, CAPABILITIES, isCapability, OWNER_ROLE_KEY, type Capability } from "./capabilities.ts";
import { STAFF_ROLES, type StaffRoleDoc } from "./schema.ts";

/** Inserts any missing built-in role. Existing roles (possibly renamed by the buyer) are left as they are. */
export async function seedBuiltInRoles(db: Db, now = new Date()) {
  const roles = db.collection<Omit<StaffRoleDoc, "_id">>(STAFF_ROLES);
  for (const role of BUILT_IN_ROLES) {
    await roles.updateOne(
      { key: role.key },
      { $setOnInsert: { key: role.key, name: role.name, capabilities: role.capabilities, builtIn: true, twoFactorRequired: role.twoFactorRequired, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
  }
}

export interface ResolvedRole {
  key: string;
  name: StaffRoleDoc["name"];
  capabilities: ReadonlySet<Capability>;
  twoFactorRequired: boolean;
}

/** Resolves a role key to its capabilities. Owner always has every capability and always requires 2FA. */
export async function resolveRole(db: Db, key: string | null | undefined): Promise<ResolvedRole | null> {
  if (!key) return null;
  const doc = await db.collection<StaffRoleDoc>(STAFF_ROLES).findOne({ key });
  if (key === OWNER_ROLE_KEY) {
    return { key, name: doc?.name ?? { bn: "মালিক", en: "Owner" }, capabilities: new Set(CAPABILITIES), twoFactorRequired: true };
  }
  if (!doc) return null;
  return { key, name: doc.name, capabilities: new Set(doc.capabilities.filter(isCapability)), twoFactorRequired: doc.twoFactorRequired };
}

export async function listRoles(db: Db) {
  return db.collection<StaffRoleDoc>(STAFF_ROLES).find({}, { sort: { builtIn: -1, key: 1 } }).toArray();
}
