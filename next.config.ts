// Next.js configuration for the HorekBazar template.
// Host-portable by design (DESIGN.md §1): standalone output, no host-specific APIs.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Never ship public source maps to production (skill rule sec-17).
  productionBrowserSourceMaps: false,
};

export default nextConfig;
