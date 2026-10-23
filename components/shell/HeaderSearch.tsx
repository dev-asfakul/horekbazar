"use client";
// Tier: build. Use-when: the header, once. Avoid-when: admin.
// Reduced-motion: the field appears without its 160 ms fade. Touch: 44 px icon buttons.
// HeaderSearch: below 768 px the search is an icon; tapping it opens the field over the header
// row (store name and bell hidden behind it) and focuses it; × or Escape on an empty field closes
// it again. From 768 px the field is always open. Without JavaScript the icon is a link to
// #hb-search and the CSS :target rule opens the same field, so search still works.
import { useEffect, useRef, useState } from "react";
import { SearchCombobox, type SearchLabels } from "@/components/shell/SearchCombobox";

export function HeaderSearch({ action, locale, labels, openLabel, closeLabel }: { action: string; locale: string; labels: SearchLabels; openLabel: string; closeLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useRef<HTMLAnchorElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (expanded) document.getElementById("site-search")?.focus();
    else toggle.current?.focus();
  }, [expanded]);

  return (
    <div id="hb-search" className="header-search-row" data-expanded={expanded ? "true" : undefined}>
      <a
        ref={toggle}
        href="#hb-search"
        className="header-search-toggle"
        aria-label={openLabel}
        aria-controls="hb-search-form"
        aria-expanded={expanded ? "true" : "false"}
        onClick={(e) => {
          e.preventDefault();
          setExpanded(true);
        }}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M10.5 4a6.5 6.5 0 1 0 4.03 11.6L20 21l1-1-5.4-5.47A6.5 6.5 0 0 0 10.5 4z" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </a>
      <form id="hb-search-form" role="search" action={action} method="get" className="header-search">
        <SearchCombobox action={action} locale={locale} labels={labels} onEscapeEmpty={() => setExpanded(false)} />
      </form>
      <button type="button" className="header-search-close" aria-label={closeLabel} onClick={() => setExpanded(false)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
