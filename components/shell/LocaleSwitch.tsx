"use client";
// Tier: build. Use-when: the header language switch. Avoid-when: in-page translations of a single string.
// Reduced-motion: no motion. Touch: 44 x 44 px minimum.
// Language switch (BUILD-PLAN §8: keeps path and query; sets a preference cookie; no
// Accept-Language redirect on "/"). The cookie is only remembered for later use; nothing
// redirects on it in v1.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { localeHref, stripLocalePrefix } from "@/lib/i18n/href";
import { htmlLang, type Locale } from "@/lib/i18n/locales";

interface Props {
  target: Locale;
  label: string;
  ariaLabel: string;
}

export function LocaleSwitch({ target, label, ariaLabel }: Props) {
  const pathname = usePathname() ?? "/";
  const search = useSearchParams()?.toString() ?? "";
  const href = `${localeHref(target, stripLocalePrefix(pathname))}${search ? `?${search}` : ""}`;
  return (
    <Link
      href={href}
      hrefLang={htmlLang[target]}
      lang={htmlLang[target]}
      aria-label={ariaLabel}
      className="nav-link header-action"
      prefetch={false}
      onClick={() => {
        document.cookie = `hb-locale=${target}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      }}
    >
      {label}
    </Link>
  );
}

/** Server-rendered fallback (same link without the query) used while search params resolve. */
export function LocaleSwitchFallback({ target, label, ariaLabel, currentPath }: Props & { currentPath: string }) {
  return (
    <a href={localeHref(target, currentPath)} hrefLang={htmlLang[target]} lang={htmlLang[target]} aria-label={ariaLabel} className="nav-link header-action">
      {label}
    </a>
  );
}
