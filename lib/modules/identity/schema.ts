// Identity collections owned by this module (SCHEMA.md → Identity). Better Auth owns `user`, `session`,
// `account`, `verification` and `twoFactor` (shapes per its MongoDB adapter; indexes from lib/db/collections.ts).
// HorekBazar adds `staffRoles` and the `installation` singleton that serialises the first-owner claim (D23).
import { z } from "zod";
import { zDate, zObjectId } from "../../db/bson-zod.ts";
import { CAPABILITIES } from "./capabilities.ts";

export const ROLE_KEY = /^[a-z][a-z0-9_]{1,39}$/;

export const staffRoleSchema = z
  .object({
    _id: zObjectId(),
    key: z.string().regex(ROLE_KEY),
    name: z.object({ bn: z.string().min(1).max(60), en: z.string().min(1).max(60).optional() }).strict(),
    capabilities: z.array(z.enum(CAPABILITIES)),
    builtIn: z.boolean(),
    twoFactorRequired: z.boolean(),
    createdAt: zDate(),
    updatedAt: zDate(),
  })
  .strict();
export type StaffRoleDoc = z.infer<typeof staffRoleSchema>;

/** One document, `_id: "installation"`. Its unique `_id` makes the first-owner claim race-free. */
export const installationSchema = z
  .object({
    _id: z.literal("installation"),
    ownerUserId: z.string().min(1).max(64),
    ownerClaimedAt: zDate(),
    /** How the first Owner was verified (D23). Only "email" is implemented. */
    verification: z.enum(["email"]),
    /** Bumped inside every transaction that changes an Owner's role, so concurrent changes conflict. */
    ownerChangeSeq: z.number().int().min(0).optional(),
  })
  .strict();
export type InstallationDoc = z.infer<typeof installationSchema>;

export const STAFF_ROLES = "staffRoles";
export const INSTALLATION = "installation";
/** Better Auth collection names (MongoDB adapter, singular, no prefix). */
export const AUTH_COLLECTIONS = { user: "user", session: "session", account: "account", verification: "verification", twoFactor: "twoFactor" } as const;
