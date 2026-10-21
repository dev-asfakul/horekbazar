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
  async headers() {
    // Font files are versioned by directory (/fonts/v1), so they can be cached for a year.
    return [{ source: "/fonts/v1/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
};

export default withNextIntl(nextConfig);
