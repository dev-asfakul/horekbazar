"use client";
// Tier: build (contract). Use-when: inside BottomDock only. Avoid-when: header navigation from 768 px.
// Reduced-motion: no motion. Touch: five targets, each at least 44 x 56 px.
// BottomNav (DESIGN.md → Layout → Nav, band S): Home, Categories, Search, Cart, Account, with text
// labels and aria-current. Search moves focus to the header search field (#site-search) and scrolls
// it into view; it is a real link to /search so it also works before hydration.
// Categories goes to /categories until the department sheet arrives (B5).
import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localeHref, stripLocalePrefix } from "@/lib/i18n/href";
import type { Locale } from "@/lib/i18n/locales";
import { shellPaths } from "@/lib/routes";

type Key = "home" | "categories" | "search" | "cart" | "account";
const items: { key: Key; path: string; icon: string }[] = [
  { key: "home", path: shellPaths.home, icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { key: "categories", path: shellPaths.categories, icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { key: "search", path: shellPaths.search, icon: "M10.5 4a6.5 6.5 0 1 0 4.03 11.6L20 21l1-1-5.4-5.47A6.5 6.5 0 0 0 10.5 4z" },
  { key: "cart", path: shellPaths.cart, icon: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.76L21 8H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" },
  { key: "account", path: shellPaths.account, icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0z" },
];

function isCurrent(key: Key, path: string, current: string) {
  if (key === "home") return current === "/";
  if (key === "categories") return current === path || current.startsWith("/c/");
  return current === path || current.startsWith(`${path}/`);
}

export function BottomNav({ locale, label, labels }: { locale: Locale; label: string; labels: Record<Key, string> }) {
  const current = stripLocalePrefix(usePathname() ?? "/");
  return (
    <nav aria-label={label} className="bottom-nav">
      <ul>
        {items.map(({ key, path, icon }) => {
          const active = isCurrent(key, path, current);
          return (
            <li key={key}>
              <Link
                href={localeHref(locale, path)}
                aria-current={active ? "page" : undefined}
                data-nav={key}
                className="bottom-nav-item"
                prefetch={false}
                {...(key === "search" && {
                  onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
                    const field = document.getElementById("site-search");
                    if (!(field instanceof HTMLInputElement)) return;
                    event.preventDefault();
                    field.scrollIntoView({ block: "nearest" });
                    field.focus({ preventScroll: true });
                  },
                })}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
                  <path d={icon} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                </svg>
                <span>{labels[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
