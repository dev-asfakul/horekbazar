// Tier: build (BUILD-PLAN §2 AdminShell). Use-when: every /admin page. Avoid-when: storefront and account pages (SiteShell).
// Reduced-motion: no motion. Touch: nav links and sign-out are 44 px targets.
// Server shell: store mark, admin label, section navigation for the signed-in staff member (only the
// sections their capabilities allow; the server still checks each page), and sign out. No storefront dock.
import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/lib/actions/identity";

export interface AdminNavItem {
  href: string;
  label: string;
}

export function AdminShell({ label, nav, navLabel, signOutLabel, locale, children }: { label: string; nav: AdminNavItem[]; navLabel: string; signOutLabel: string; locale: "bn" | "en"; children: ReactNode }) {
  return (
    <>
      <header className="admin-header">
        <div className="admin-header-inner">
          <Link href="/admin" className="wordmark font-display" lang="en">
            HorekBazar
          </Link>
          <span className="admin-label">{label}</span>
          {nav.length > 0 ? (
            <nav className="admin-nav" aria-label={navLabel}>
              <ul>
                {nav.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="admin-nav-link">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <form action={signOutAction}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="btn btn-quiet admin-signout">
                  {signOutLabel}
                </button>
              </form>
            </nav>
          ) : null}
        </div>
      </header>
      <main id="main" tabIndex={-1} className="admin-main">
        {children}
      </main>
    </>
  );
}
