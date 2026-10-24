"use client";
// Tier: build (Proposal A1). Use-when: the admin sidebar (≥1024 px) and the full-screen menu (<1024 px).
// Avoid-when: storefront. Reduced-motion: colour changes only. Touch: rows are ≥44 px in the menu.
// Grouped section links for the signed-in role. Marks the current page with aria-current (longest
// matching href). Hiding a section here never grants or removes access: every page checks on the server.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { activeHref } from "@/lib/admin/active-section";

export interface AdminNavLink {
  href: string;
  label: string;
  icon: IconName;
  /** Waiting count shown as a badge (already formatted, e.g. "7" or "99+"). */
  badge?: string;
  badgeLabel?: string;
}

export interface AdminNavGroup {
  key: string;
  label: string | null;
  links: AdminNavLink[];
}

export function AdminNav({ groups, label, variant }: { groups: AdminNavGroup[]; label: string; variant: "sidebar" | "menu" }) {
  const pathname = usePathname() ?? "";
  const current = activeHref(
    pathname,
    groups.flatMap((g) => g.links.map((l) => l.href)),
  );
  return (
    <nav className="admin-navlist" data-variant={variant} aria-label={label}>
      {groups.map((g) => (
        <div key={g.key} className="admin-navgroup">
          {g.label ? (
            <p className="admin-navgroup-title" id={`${variant}-group-${g.key}`}>
              {g.label}
            </p>
          ) : null}
          <ul aria-labelledby={g.label ? `${variant}-group-${g.key}` : undefined}>
            {g.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="admin-navitem" aria-current={l.href === current ? "page" : undefined} data-testid={`admin-nav-${variant}`}>
                  <span className="admin-navicon">
                    <Icon name={l.icon} size={20} />
                  </span>
                  <span className="admin-navlabel">{l.label}</span>
                  {l.badge ? (
                    <span className="admin-badge" aria-label={l.badgeLabel}>
                      {l.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
