// Listing URL parameters (B5): ?sort=&page=&stock=1&min=&max= (taka, whole numbers). Parsed and bounded
// on the server; anything invalid is ignored (sort, page) or reported (prices) and never reaches the query.
import { MAX_PAGE, SORTS, type ListingQuery, type Sort } from "@/lib/modules/storefront/catalogue";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

export interface ParsedListing {
  query: Pick<ListingQuery, "sort" | "page" | "inStock" | "minPrice" | "maxPrice">;
  /** Raw values for the form (kept as typed when invalid, so the shopper can correct them). */
  form: { sort: Sort | ""; stock: boolean; min: string; max: string };
  priceError: boolean;
  filtered: boolean;
}

function taka(raw: string): number | null | undefined {
  if (raw === "") return undefined;
  const digits = raw.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/,/g, "");
  if (!/^\d{1,7}$/.test(digits)) return null;
  return Number(digits) * 100;
}

export function parseListingParams(sp: SearchParams, allowRelevance = false): ParsedListing {
  const sortRaw = one(sp.sort);
  const sort = (SORTS as readonly string[]).includes(sortRaw) && (allowRelevance || sortRaw !== "relevance") ? (sortRaw as Sort) : "";
  const pageNum = Number.parseInt(one(sp.page), 10);
  const page = Number.isFinite(pageNum) ? Math.min(MAX_PAGE, Math.max(1, pageNum)) : 1;
  const stock = one(sp.stock) === "1";
  const minRaw = one(sp.min).slice(0, 12);
  const maxRaw = one(sp.max).slice(0, 12);
  const min = taka(minRaw);
  const max = taka(maxRaw);
  const priceError = min === null || max === null || (typeof min === "number" && typeof max === "number" && min > max);
  const query: ParsedListing["query"] = { page, ...(sort ? { sort } : {}), ...(stock ? { inStock: true } : {}) };
  if (!priceError) {
    if (typeof min === "number") query.minPrice = min;
    if (typeof max === "number") query.maxPrice = max;
  }
  return { query, form: { sort, stock, min: minRaw, max: maxRaw }, priceError, filtered: stock || minRaw !== "" || maxRaw !== "" };
}

/** Builds a listing URL from the current parameters with overrides; page 1 and empty values are left out. */
export function listingHref(base: string, current: ParsedListing["form"] & { q?: string }, override: Partial<{ page: number }> = {}): string {
  const p = new URLSearchParams();
  if (current.q) p.set("q", current.q);
  if (current.sort) p.set("sort", current.sort);
  if (current.stock) p.set("stock", "1");
  if (current.min) p.set("min", current.min);
  if (current.max) p.set("max", current.max);
  if (override.page && override.page > 1) p.set("page", String(override.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
