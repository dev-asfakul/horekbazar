// Admin sections in navigation order, with the capability each needs. The nav and the admin index
// show only the sections the signed-in role allows; each page and action still checks on the server.
import type { Capability } from "@/lib/modules/identity/capabilities";
import type { AdminPage } from "@/lib/modules/identity/paths";

export type AdminSectionKey = "orders" | "shipments" | "returns" | "products" | "categories" | "inventory" | "collections" | "homepage" | "banners" | "promotions" | "coupons" | "settings" | "delivery" | "staff" | "security" | "health";

export interface AdminSection {
  href: AdminPage;
  /** Message key under admin.nav and admin.home (`<key>Desc`). */
  key: AdminSectionKey;
  capability: Capability | null;
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin/orders", key: "orders", capability: "orders.read" },
  { href: "/admin/shipments", key: "shipments", capability: "fulfilment.write" },
  { href: "/admin/returns", key: "returns", capability: "returns.process" },
  { href: "/admin/products", key: "products", capability: "catalogue.write" },
  { href: "/admin/categories", key: "categories", capability: "catalogue.write" },
  { href: "/admin/inventory", key: "inventory", capability: "inventory.adjust" },
  { href: "/admin/collections", key: "collections", capability: "merch.write" },
  { href: "/admin/homepage", key: "homepage", capability: "merch.write" },
  { href: "/admin/banners", key: "banners", capability: "merch.write" },
  { href: "/admin/promotions", key: "promotions", capability: "promotions.write" },
  { href: "/admin/coupons", key: "coupons", capability: "promotions.write" },
  { href: "/admin/settings", key: "settings", capability: "settings.write" },
  { href: "/admin/settings/delivery", key: "delivery", capability: "delivery.write" },
  { href: "/admin/staff", key: "staff", capability: "staff.manage" },
  { href: "/admin/security", key: "security", capability: null },
  { href: "/admin/health", key: "health", capability: "platform.read" },
];

export const sectionsFor = (capabilities: ReadonlySet<Capability> | undefined) => ADMIN_SECTIONS.filter((s) => s.capability === null || capabilities?.has(s.capability));
