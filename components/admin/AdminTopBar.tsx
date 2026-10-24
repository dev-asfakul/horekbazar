"use client";
// Tier: build (Proposal A1). Use-when: the admin top bar below 1024 px (hidden by CSS from 1024 px,
// where the sidebar takes over). Avoid-when: storefront.
// Reduced-motion: the menu appears without the fade. Touch: menu and close buttons are 44 px.
// The menu is a native modal <dialog> (WAI-ARIA APG dialog pattern): focus moves to Close, Tab stays
// inside, Escape closes, the page behind is inert, and focus returns to the menu button. It closes when
// a link inside is followed. Without JavaScript the button does nothing; the wordmark still leads to
// /admin, whose tiles reach every permitted section. The menu's links are rendered only while it is
// open, so the page holds one navigation landmark (the sidebar's) at a time.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { activeHref } from "@/lib/admin/active-section";

export function AdminTopBar({
  titles,
  fallbackTitle,
  openLabel,
  closeLabel,
  menuLabel,
  menu,
}: {
  titles: { href: string; label: string }[];
  fallbackTitle: string;
  openLabel: string;
  closeLabel: string;
  menuLabel: string;
  menu: ReactNode | null;
}) {
  const pathname = usePathname() ?? "";
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const current = activeHref(
    pathname,
    titles.map((t) => t.href),
  );
  const title = titles.find((t) => t.href === current)?.label ?? fallbackTitle;

  // A followed link changes the path: close the menu.
  useEffect(() => {
    const d = dialog.current;
    if (d?.open) d.close();
  }, [pathname]);

  useEffect(() => {
    const d = dialog.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const onClose = () => {
      setOpen(false);
      opener.current?.focus();
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  return (
    <header className="admin-topbar">
      {menu ? (
        <button
          ref={opener}
          type="button"
          className="admin-circle"
          aria-label={openLabel}
          aria-haspopup="dialog"
          aria-controls="admin-menu"
          onClick={() => setOpen(true)}
          data-testid="admin-menu-open"
        >
          <Icon name="menu" size={22} />
        </button>
      ) : null}
      <p className="admin-topbar-title">{title}</p>
      <Link href="/admin" className="wordmark font-display admin-topbar-mark" lang="en">
        HorekBazar
      </Link>
      {menu ? (
        <dialog
          ref={dialog}
          id="admin-menu"
          className="admin-menu"
          aria-labelledby="admin-menu-title"
          data-testid="admin-menu"
          onClick={(e) => {
            // Same-page links do not change the path; close on any followed link.
            if ((e.target as HTMLElement).closest("a")) dialog.current?.close();
          }}
        >
          <div className="admin-menu-head">
            <button type="button" className="admin-circle" aria-label={closeLabel} onClick={() => dialog.current?.close()} autoFocus data-testid="admin-menu-close">
              <Icon name="close" size={22} />
            </button>
            <h2 id="admin-menu-title" className="admin-topbar-title">
              {menuLabel}
            </h2>
            <span className="wordmark font-display admin-topbar-mark" lang="en" aria-hidden="true">
              HorekBazar
            </span>
          </div>
          <div className="admin-menu-body">{open ? menu : null}</div>
        </dialog>
      ) : null}
    </header>
  );
}
