// robots.txt (B5). This is a development and showcase deployment, not a launch: crawling is disallowed
// everywhere unless the owner sets SITE_INDEXING=on. Private areas are always disallowed.
import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { indexingAllowed, siteOrigin } from "@/lib/storefront/context";

export default async function robots(): Promise<MetadataRoute.Robots> {
  await connection();
  const origin = await siteOrigin();
  if (!indexingAllowed()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/account", "/cart", "/checkout", "/api/", "/search", "/en/account", "/en/cart", "/en/checkout", "/en/search"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
