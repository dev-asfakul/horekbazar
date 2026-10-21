// Tier: build (BUILD-PLAN §2 AdminShell). Use-when: every /admin page. Avoid-when: storefront and account pages (SiteShell).
// Reduced-motion: no motion. Touch: no controls yet; navigation arrives with the admin sections (B3+).
// Thin server shell: the store mark and the admin label, then the page. No storefront dock (DESIGN.md → Admin).
import type { ReactNode } from "react";

export function AdminShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <header className="admin-header">
        <div className="admin-header-inner">
          <span className="wordmark font-display" lang="en">
            HorekBazar
          </span>
          <span className="admin-label">{label}</span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="admin-main">
        {children}
      </main>
    </>
  );
}
