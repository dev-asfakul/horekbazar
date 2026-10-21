// Capabilities and built-in staff roles (domain-rules §1; SCHEMA.md → staffRoles).
// Permissions are capability-based: every protected server operation checks one capability on the
// server. Roles are named sets of capabilities stored in `staffRoles`; the six built-in roles are
// seeded by data migration 0001 and a buyer can rename them or add custom roles without code changes.
// The Owner role always resolves to every capability in code, so the store can never lock the Owner out.
// Relative `.ts` imports keep this module runnable by the Node 24 CLI scripts.

export const CAPABILITIES = [
  "platform.read",
  "staff.manage",
  "settings.write",
  "settings.integrations.write",
  "delivery.write",
  "catalogue.write",
  "merch.write",
  "inventory.adjust",
  "promotions.write",
  "campaigns.send",
  "rewards.write",
  "orders.read",
  "orders.note",
  "orders.request_cancel",
  "orders.confirm",
  "fulfilment.write",
  "returns.process",
  "customers.read",
  "customers.export",
  "reviews.moderate",
  "messages.reply",
  "reports.read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const isCapability = (value: unknown): value is Capability =>
  typeof value === "string" && (CAPABILITIES as readonly string[]).includes(value);

/** Capabilities whose use requires a fresh second-factor check within STEP_UP_WINDOW_MS (domain-rules §1). */
export const STEP_UP_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "staff.manage",
  "settings.integrations.write",
  "customers.export",
  "inventory.adjust",
]);
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;

export const OWNER_ROLE_KEY = "owner";

export interface BuiltInRole {
  key: string;
  name: { bn: string; en: string };
  capabilities: Capability[];
  twoFactorRequired: boolean;
}

const support: Capability[] = ["orders.read", "orders.note", "orders.request_cancel", "customers.read", "messages.reply"];
const operator: Capability[] = ["orders.read", "orders.note", "orders.confirm", "fulfilment.write", "returns.process", "customers.read"];
const catalogue: Capability[] = ["catalogue.write", "merch.write"];
const marketing: Capability[] = ["promotions.write", "campaigns.send", "rewards.write"];
const unique = (list: Capability[]) => [...new Set(list)];

/** The six built-in roles (domain-rules §1). 2FA is mandatory for Owner and Store manager (D7); optional for the others. */
export const BUILT_IN_ROLES: BuiltInRole[] = [
  { key: OWNER_ROLE_KEY, name: { bn: "মালিক", en: "Owner" }, capabilities: [...CAPABILITIES], twoFactorRequired: true },
  {
    key: "store_manager",
    name: { bn: "স্টোর ম্যানেজার", en: "Store manager" },
    capabilities: unique([...support, ...operator, ...catalogue, ...marketing, "inventory.adjust", "reviews.moderate", "delivery.write", "reports.read", "platform.read"]),
    twoFactorRequired: true,
  },
  { key: "order_operator", name: { bn: "অর্ডার অপারেটর", en: "Order operator" }, capabilities: operator, twoFactorRequired: false },
  { key: "catalogue_editor", name: { bn: "ক্যাটালগ সম্পাদক", en: "Catalogue editor" }, capabilities: catalogue, twoFactorRequired: false },
  { key: "marketing_manager", name: { bn: "মার্কেটিং ম্যানেজার", en: "Marketing manager" }, capabilities: marketing, twoFactorRequired: false },
  { key: "support_agent", name: { bn: "সাপোর্ট এজেন্ট", en: "Support agent" }, capabilities: support, twoFactorRequired: false },
];
