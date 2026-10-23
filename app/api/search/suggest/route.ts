// Header search suggestions (docs/REDESIGN-BUILD-PLAN.md §6; Checkpoint 2 Q3). Public catalogue data
// only: matching words, categories and products (name, link, price from, photo, option count, in
// stock). Nothing about customers, carts, sessions or staff. Cached publicly for a minute, rate
// limited per address. This is a suggestion list, not a recommendation system.
import { headers } from "next/headers";
import { cloudinaryConfig, deliveryUrl } from "@/lib/adapters/media/cloudinary";
import { formatCount, formatMoney } from "@/lib/format/money";
import { localeHref } from "@/lib/i18n/href";
import { isLocale, type Locale } from "@/lib/i18n/locales";
import { checkLimits, clientIp, LIMITS } from "@/lib/modules/identity/limits";
import { categoryPath, listPublishedProducts, normaliseQuery, type StoreCategory } from "@/lib/modules/storefront/catalogue";
import { catalogueIndex, fold, matchIndex, tokens } from "@/lib/modules/storefront/search-index";
import { loadStore, moneyFormat, shown } from "@/lib/storefront/context";

export const dynamic = "force-dynamic";

export interface Suggestions {
  q: string;
  terms: string[];
  categories: { name: string; href: string }[];
  products: { slug: string; name: string; href: string; price: string; from: boolean; image: string | null; options: string | null; variantCount: number; inStock: boolean }[];
}

const empty = (q: string): Suggestions => ({ q, terms: [], categories: [], products: [] });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = normaliseQuery(url.searchParams.get("q") ?? "");
  const lp = url.searchParams.get("l") ?? "bn";
  const locale: Locale = isLocale(lp) ? lp : "bn";
  const noStore = { "Cache-Control": "no-store" };
  if (!q) return Response.json(empty(q), { headers: noStore });

  const [limit, store] = await Promise.all([checkLimits([{ rule: LIMITS.searchSuggestIp, key: clientIp(await headers()) }]), loadStore()]);
  if (limit === "limited") return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...noStore, "Retry-After": "10" } });
  if (!store.ready) return Response.json(empty(q), { headers: noStore });

  // Matching runs on the in-memory index (search-index.ts, rebuilt once a minute); one query then
  // loads the current price and stock of the top four.
  const ids = matchIndex(await catalogueIndex(store.db), q, 4);
  const found = ids.length ? await listPublishedProducts(store.db, { productIds: ids, pageSize: 4 }) : null;
  const rank = new Map(ids.map((id, i) => [id, i]));
  const listing = { items: [...(found?.items ?? [])].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)) };
  const format = moneyFormat(store, locale);
  const cloud = cloudinaryConfig();

  const keys = tokens(q).map(fold).filter(Boolean);
  const last = keys[keys.length - 1] ?? "";
  // Categories whose name has a word starting with the last query word (Banglish and Bengali alike).
  // A same-word match ("chal" → চাল ও আটা) hides prefix-only ones ("chal" → ছোলা).
  const catScore = (c: StoreCategory) =>
    Math.max(0, ...tokens(`${c.name.bn ?? ""} ${c.name.en ?? ""}`).map((w) => (last.length < 2 ? 0 : fold(w) === last ? 2 : fold(w).startsWith(last) ? 1 : 0)));
  const scoredCats = [...store.tree.byId.values()].map((c) => ({ c, s: catScore(c) })).filter((x) => x.s > 0);
  const bestCat = Math.max(0, ...scoredCats.map((x) => x.s));
  const categories = scoredCats
    .filter((x) => x.s === bestCat)
    .sort((a, b) => a.c.ancestors.length - b.c.ancestors.length)
    .slice(0, 2)
    .map(({ c }) => ({ name: shown(c.name, locale), href: localeHref(locale, categoryPath(c)) }));

  // Words: the shown-language words of matching product names that start like the query's last word.
  const terms: string[] = [];
  for (const item of listing.items) {
    for (const w of tokens(shown(item.name, locale))) {
      if (terms.length >= 3) break;
      if (last.length >= 2 && fold(w).startsWith(last) && !terms.includes(w)) terms.push(w);
    }
  }

  const body: Suggestions = {
    q,
    terms,
    categories,
    products: listing.items.map((p) => ({
      slug: p.slug,
      name: shown(p.name, locale),
      href: localeHref(locale, `/p/${p.slug}`),
      price: formatMoney(p.price, format),
      from: p.variantCount > 1,
      image: p.image && cloud ? deliveryUrl(cloud.cloudName, p.image.publicId, 160) : null,
      options: p.variantCount > 1 ? formatCount(p.variantCount, format) : null,
      variantCount: p.variantCount,
      inStock: p.available > 0,
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300", Vary: "Accept-Encoding" } });
}
