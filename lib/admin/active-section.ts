// Which navigation entry is the current page: the longest href that equals the path or is a
// path-segment prefix of it, so /admin/settings/delivery marks Delivery (not Settings) and
// /admin/products/abc marks Products. "/admin" itself only matches exactly. Pure; unit-tested.
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  let best: string | null = null;
  for (const href of hrefs) {
    const match = href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`);
    if (match && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
