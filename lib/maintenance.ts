// Maintenance switch (proposed in B1): an environment variable, because the settings document
// does not exist until B4 and maintenance must work even when the database is down.
// The proxy answers every storefront page itself with 503 and Retry-After. A Next.js rewrite
// cannot carry a 503 status (measured: the rendered page came back 200), so the page is a small
// self-contained document styled through the request's CSP nonce, with no inline style attributes.
import bn from "@/messages/bn.json";
import en from "@/messages/en.json";
import type { Locale } from "@/lib/i18n/locales";

export function isMaintenanceMode(env: Record<string, string | undefined>): boolean {
  return env.MAINTENANCE_MODE?.trim().toLowerCase() === "on";
}

/** Seconds a client should wait before retrying during maintenance (Retry-After). */
export const MAINTENANCE_RETRY_AFTER_SECONDS = 600;

const copy = { bn: bn.maintenance, en: en.maintenance } as const;

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export function maintenanceHtml(locale: Locale, nonce: string): string {
  const t = copy[locale];
  const font = locale === "bn" ? "noto-sans-bengali-bengali" : "noto-sans-bengali-latin";
  const range = locale === "bn" ? "U+0951-0952,U+0964-0965,U+0980-09FE,U+1CD0,U+1CD2,U+1CD5-1CD6,U+1CD8,U+1CE1,U+1CEA,U+1CED,U+1CF2,U+1CF5-1CF7,U+200C-200D,U+20B9,U+25CC,U+A8F1,U+11DF0-11DF1" : "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
  return `<!doctype html>
<html lang="${locale}" data-state="maintenance">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapeHtml(t.title)}</title>
<style nonce="${escapeHtml(nonce)}">
@font-face{font-family:"HB Noto Sans Bengali";src:url("/fonts/v1/${font}.woff2") format("woff2");font-weight:400 600;font-display:swap;unicode-range:${range}}
html{background:#faf7f0;color:#1b1a17;font-family:"HB Noto Sans Bengali","Noto Sans Bengali",system-ui,sans-serif}
body{margin:0;line-height:${locale === "bn" ? "1.6" : "1.5"}}
main{max-width:68ch;margin:0 auto;padding:72px max(16px,env(safe-area-inset-left,0px)) 24px}
h1{font-size:2.0625rem;font-weight:600;line-height:1.3;margin:0}
p{margin:12px 0 0}
</style>
</head>
<body>
<main id="main">
<h1>${escapeHtml(t.title)}</h1>
<p>${escapeHtml(t.body)}</p>
</main>
</body>
</html>
`;
}
