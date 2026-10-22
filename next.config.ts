// Next.js configuration for the HorekBazar template.
// Host-portable by design (DESIGN.md §1): standalone output, no host-specific APIs.
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Never ship public source maps to production (skill rule sec-17).
  productionBrowserSourceMaps: false,
  // forbidden() for capability-checked admin pages (403 with app/admin/forbidden.tsx). Experimental in
  // Next.js 16; the documented way to answer 403 from a server component (B2, recorded in PROGRESS).
  experimental: { authInterrupts: true },
  async headers() {
    // Font files are versioned by directory (/fonts/v1), so they can be cached for a year.
    return [
      { source: "/fonts/v1/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // B9: the push service worker is checked for updates on every visit and runs with its own CSP.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "text/javascript; charset=utf-8" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self'; connect-src 'self'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
