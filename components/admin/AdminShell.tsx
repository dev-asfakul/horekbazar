// Tier: build (Proposal A1, docs/ADMIN-REDESIGN-A1.md). Use-when: every /admin page. Avoid-when:
// storefront and account pages (SiteShell).
// Reduced-motion: no motion beyond colour. Touch: every control is ≥44 px below 1024 px.
// Server shell: below 1024 px a slim top bar (menu button, current section, wordmark) opening a
// full-screen menu; from 1024 px a fixed sidebar. Both show the same groups: only the sections the
// signed-in role allows (the server still checks each page), the staff member's name and role,
// View store and Sign out. No storefront dock.
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminNav, type AdminNavGroup } from "@/components/admin/AdminNav";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { Icon } from "@/components/ui/Icon";
import { signOutAction } from "@/lib/actions/identity";

export interface AdminShellIdentity {
  name: string;
  role: string;
  twoFactor: string;
}

export interface AdminShellProps {
  label: string;
  groups: AdminNavGroup[];
  identity: AdminShellIdentity | null;
  store: { href: string; label: string } | null;
  labels: {
    nav: string;
    signOut: string;
    openMenu: string;
    closeMenu: string;
    menu: string;
    home: string;
  };
  locale: "bn" | "en";
  children: ReactNode;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

function Panel({
  variant,
  groups,
  identity,
  store,
  labels,
  locale,
}: Omit<AdminShellProps, "children" | "label"> & {
  variant: "sidebar" | "menu";
}) {
  return (
    <>
      {identity && variant === "menu" ? <IdentityCard identity={identity} /> : null}
      <AdminNav groups={groups} label={labels.nav} variant={variant} />
      {identity && variant === "sidebar" ? <IdentityCard identity={identity} /> : null}
      <div className="admin-panel-actions" data-variant={variant}>
        {store ? (
          <Link href={store.href} className="btn btn-secondary">
            <Icon name="store" size={18} />
            {store.label}
          </Link>
        ) : null}
        <form action={signOutAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="btn btn-secondary admin-signout">
            <Icon name="logout" size={18} />
            {labels.signOut}
          </button>
        </form>
      </div>
    </>
  );
}

function IdentityCard({ identity }: { identity: AdminShellIdentity }) {
  return (
    <div className="admin-identity" data-testid="admin-identity">
      <span className="admin-avatar" aria-hidden="true">
        {initials(identity.name)}
      </span>
      <span className="admin-identity-text">
        <span className="admin-identity-name">{identity.name}</span>
        <span className="admin-identity-role">
          {identity.role} · {identity.twoFactor}
        </span>
      </span>
    </div>
  );
}

export function AdminShell({ label, groups, identity, store, labels, locale, children }: AdminShellProps) {
  const hasNav = groups.length > 0;
  const titles = [{ href: "/admin", label: labels.home }, ...groups.flatMap((g) => g.links.map((l) => ({ href: l.href, label: l.label })))];
  return (
    <div className="admin-frame" data-nav={hasNav ? "" : undefined}>
      {hasNav ? (
        <aside className="admin-sidebar" data-testid="admin-sidebar">
          <div className="admin-sidebar-brand">
            <Link href="/admin" className="wordmark font-display" lang="en">
              HorekBazar
            </Link>
            <span className="admin-chip">{label}</span>
          </div>
          <Panel variant="sidebar" groups={groups} identity={identity} store={store} labels={labels} locale={locale} />
        </aside>
      ) : null}
      <AdminTopBar
        titles={titles}
        fallbackTitle={label}
        openLabel={labels.openMenu}
        closeLabel={labels.closeMenu}
        menuLabel={labels.menu}
        menu={hasNav ? <Panel variant="menu" groups={groups} identity={identity} store={store} labels={labels} locale={locale} /> : null}
      />
      <main id="main" tabIndex={-1} className="admin-main">
        {children}
      </main>
    </div>
  );
}
