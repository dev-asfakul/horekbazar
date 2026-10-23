// Storefront routes from docs/BUILD-PLAN.md §1 and DESIGN.md → Scope. Until each route is built
// (B3–B10) and the database is connected, a known storefront path shows the setup-required state
// (no fallback data, D2); any other path is a 404. Built routes take precedence over this table.

// Route shapes from docs/BUILD-PLAN.md §1 (storefront, authentication and account). `rest` is the
// path after the first segment; every segment is a shared lowercase Latin slug (D10).
type Rule = (rest: readonly string[]) => boolean;
const exactly = (n: number): Rule => (rest) => rest.length === n;
const between = (min: number, max: number): Rule => (rest) => rest.length >= min && rest.length <= max;
const ACCOUNT_SECTIONS = new Set(["security", "profile", "addresses", "orders", "rewards", "reviews", "messages", "notifications", "privacy"]);

const storefrontRoutes: Record<string, Rule> = {
  categories: exactly(0),
  c: between(1, 3), // category path, 1 to 3 levels; more is a 404 (contract)
  p: exactly(1),
  collections: between(0, 1),
  search: exactly(0),
  deals: exactly(0),
  new: exactly(0),
  preorder: exactly(0),
  cart: exactly(0),
  checkout: (rest) => rest.length === 0 || (rest.length === 2 && rest[0] === "success"),
  login: exactly(0),
  register: exactly(0),
  "forgot-password": exactly(0),
  "reset-password": exactly(0),
  "verify-email": exactly(0),
  account: (rest) => {
    if (rest.length === 0) return true;
    const [section = "", ...more] = rest;
    if (!ACCOUNT_SECTIONS.has(section)) return false;
    if (section !== "orders") return more.length === 0;
    return more.length === 0 || more.length === 1 || (more.length === 2 && more[1] === "invoice");
  },
  about: exactly(0),
  contact: exactly(0),
  faq: exactly(0),
  terms: exactly(0),
  "privacy-policy": exactly(0),
  "delivery-policy": exactly(0),
  "return-policy": exactly(0),
};

/** True when `segments` (the path after the locale) is a storefront route that needs the database. */
export function isPendingStorefrontPath(segments: readonly string[]): boolean {
  const [first, ...rest] = segments;
  if (first === undefined) return false;
  const rule = Object.hasOwn(storefrontRoutes, first) ? storefrontRoutes[first] : undefined;
  if (!rule) return false;
  if (rest.some((s) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) return false; // shared lowercase Latin slugs
  return rule(rest);
}

/** Public, locale-neutral paths used by the shell. */
export const shellPaths = {
  home: "/",
  categories: "/categories",
  search: "/search",
  cart: "/cart",
  account: "/account",
  about: "/about",
  contact: "/contact",
  faq: "/faq",
  terms: "/terms",
  privacy: "/privacy-policy",
  delivery: "/delivery-policy",
  returns: "/return-policy",
} as const;
