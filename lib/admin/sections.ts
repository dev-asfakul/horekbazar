// Admin sections in navigation order, with the capability each needs. The nav and the admin index
// show only the sections the signed-in role allows; each page and action still checks on the server.
// Groups and icons are presentation only (Proposal A1, docs/ADMIN-REDESIGN-A1.md); they never grant access.
import type { IconName } from "@/components/ui/Icon";
import type { Capability } from "@/lib/modules/identity/capabilities";
import type { AdminPage } from "@/lib/modules/identity/paths";

export type AdminSectionKey = "orders" | "shipments" | "returns" | "messages" | "reviews" | "rewards" | "notifications" | "products" | "categories" | "inventory" | "collections" | "homepage" | "banners" | "promotions" | "coupons" | "settings" | "delivery" | "customers" | "staff" | "security" | "health" | "audit";

export const ADMIN_GROUPS = ["sales", "customers", "catalogue", "storefront", "marketing", "settings", "system"] as const;
export type AdminGroupKey = (typeof ADMIN_GROUPS)[number];

export interface AdminSection {
  href: AdminPage;
  /** Message key under admin.nav and admin.home (`<key>Desc`). */
  key: AdminSectionKey;
  capability: Capability | null;
  /** Navigation group (message key under admin.nav.groups). */
  group: AdminGroupKey;
  icon: IconName;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin/orders", key: "orders", capability: "orders.read", group: "sales", icon: "orders" },
  { href: "/admin/shipments", key: "shipments", capability: "fulfilment.write", group: "sales", icon: "truck" },
  { href: "/admin/returns", key: "returns", capability: "returns.process", group: "sales", icon: "returns" },
  { href: "/admin/messages", key: "messages", capability: "messages.reply", group: "customers", icon: "chat" },
  { href: "/admin/reviews", key: "reviews", capability: "reviews.moderate", group: "customers", icon: "star" },
  { href: "/admin/rewards", key: "rewards", capability: "rewards.write", group: "marketing", icon: "gift" },
  { href: "/admin/notifications", key: "notifications", capability: "campaigns.send", group: "marketing", icon: "bell" },
  { href: "/admin/products", key: "products", capability: "catalogue.write", group: "catalogue", icon: "tag" },
  { href: "/admin/categories", key: "categories", capability: "catalogue.write", group: "catalogue", icon: "tree" },
  { href: "/admin/inventory", key: "inventory", capability: "inventory.adjust", group: "catalogue", icon: "box" },
  { href: "/admin/collections", key: "collections", capability: "merch.write", group: "catalogue", icon: "stack" },
  { href: "/admin/homepage", key: "homepage", capability: "merch.write", group: "storefront", icon: "store" },
  { href: "/admin/banners", key: "banners", capability: "merch.write", group: "storefront", icon: "image" },
  { href: "/admin/promotions", key: "promotions", capability: "promotions.write", group: "marketing", icon: "percent" },
  { href: "/admin/coupons", key: "coupons", capability: "promotions.write", group: "marketing", icon: "ticket" },
  { href: "/admin/settings", key: "settings", capability: "settings.write", group: "settings", icon: "sliders" },
  { href: "/admin/settings/delivery", key: "delivery", capability: "delivery.write", group: "settings", icon: "pin" },
  { href: "/admin/customers", key: "customers", capability: "customers.read", group: "customers", icon: "user" },
  { href: "/admin/staff", key: "staff", capability: "staff.manage", group: "settings", icon: "id" },
  { href: "/admin/security", key: "security", capability: null, group: "settings", icon: "shield" },
  { href: "/admin/health", key: "health", capability: "platform.read", group: "system", icon: "pulse" },
  { href: "/admin/audit", key: "audit", capability: "platform.read", group: "system", icon: "doc" },
];

/** Order inside each group (the owner's A1 order); sections not listed keep ADMIN_SECTIONS order. */
const GROUP_ORDER: AdminSectionKey[] = ["orders", "shipments", "returns", "customers", "messages", "reviews", "products", "categories", "inventory", "collections", "homepage", "banners", "promotions", "coupons", "rewards", "notifications", "settings", "delivery", "staff", "security", "health", "audit"];

export const sectionsFor = (capabilities: ReadonlySet<Capability> | undefined) => ADMIN_SECTIONS.filter((s) => s.capability === null || capabilities?.has(s.capability));

/** Permitted sections grouped for the menu, sidebar and home tiles. Empty groups are left out. */
export function groupSections<T extends { key: AdminSectionKey; group: AdminGroupKey }>(sections: readonly T[]): { group: AdminGroupKey; sections: T[] }[] {
  const rank = (k: AdminSectionKey) => GROUP_ORDER.indexOf(k);
  return ADMIN_GROUPS.map((group) => ({
    group,
    sections: sections.filter((s) => s.group === group).sort((a, b) => rank(a.key) - rank(b.key)),
  })).filter((g) => g.sections.length > 0);
}
