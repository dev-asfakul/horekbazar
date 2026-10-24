// Typo- and Banglish-tolerant product matching (docs/REDESIGN-BUILD-PLAN.md §5, Checkpoint 2 Q4).
// Used only after the text index and the word-prefix search find nothing, so their results never
// change; it also feeds search suggestions. Bengali script is romanised, then both the query and
// every indexed word are folded to a rough phonetic key (ch/chh → c, sh/s → s, o/a → a, doubled
// letters collapsed…). A word matches by prefix, or within edit distance 1 (2 for 7+ letters).
// The index holds public catalogue data only (published names, slugs, category names).
import type { Db, ObjectId } from "mongodb";
import { CATEGORIES, PRODUCTS } from "@/lib/modules/catalogue/schema";

const INDEPENDENT: Record<string, string> = { অ: "o", আ: "a", ই: "i", ঈ: "i", উ: "u", ঊ: "u", ঋ: "ri", এ: "e", ঐ: "oi", ও: "o", ঔ: "ou" };
const SIGNS: Record<string, string> = { "া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou" };
const CONSONANTS: Record<string, string> = {
  ক: "k", খ: "kh", গ: "g", ঘ: "gh", ঙ: "ng", চ: "ch", ছ: "chh", জ: "j", ঝ: "jh", ঞ: "n", ট: "t", ঠ: "th", ড: "d", ঢ: "dh", ণ: "n",
  ত: "t", থ: "th", দ: "d", ধ: "dh", ন: "n", প: "p", ফ: "ph", ব: "b", ভ: "bh", ম: "m", য: "j", র: "r", ল: "l", শ: "sh", ষ: "sh",
  স: "s", হ: "h", ড়: "r", ঢ়: "rh", য়: "y", ৎ: "t",
};
const HASANTA = "্";
const NUKTA = "়";
const BENGALI = /[\u0980-\u09FF]/;

/** Bengali script to a plain Latin spelling (inherent vowel kept between consonants, dropped at word end). */
export function romanise(word: string): string {
  // Compose ড + ় → ড় etc. so both spellings of the same letter romanise alike.
  const w = word.normalize("NFC").replace(/ড়/g, "ড়").replace(/ঢ়/g, "ঢ়").replace(/য়/g, "য়");
  let out = "";
  for (let i = 0; i < w.length; i++) {
    const c = w[i]!;
    const next = w[i + 1] ?? "";
    if (c in CONSONANTS) {
      out += CONSONANTS[c];
      if (next in SIGNS) {
        out += SIGNS[next];
        i++;
      } else if (next === HASANTA) {
        i++;
      } else if (next === NUKTA) {
        i++;
      } else if (next && next in CONSONANTS) {
        out += "o";
      }
    } else if (c in INDEPENDENT) out += INDEPENDENT[c];
    else if (c === "ং") out += "ng";
    else if (c === "ঃ") out += "h";
    else if (c === "ঁ") continue;
    else if (c.charCodeAt(0) < 128) out += c;
  }
  return out;
}

const FOLDS: [RegExp, string][] = [
  [/chh/g, "c"], [/ch/g, "c"], [/sh/g, "s"], [/ph/g, "f"], [/bh/g, "b"], [/kh/g, "k"], [/gh/g, "g"], [/th/g, "t"], [/dh/g, "d"],
  [/jh/g, "j"], [/rh/g, "r"], [/v/g, "b"], [/z/g, "j"], [/q/g, "k"], [/w/g, "o"], [/ee/g, "i"], [/oo/g, "u"], [/ou/g, "o"], [/y/g, "i"], [/x/g, "ks"],
];

/** A rough phonetic key shared by Bengali, Banglish and English spellings. */
export function fold(token: string): string {
  let t = token.toLowerCase();
  if (BENGALI.test(t)) t = romanise(t);
  for (const [re, to] of FOLDS) t = t.replace(re, to);
  return t.replace(/o/g, "a").replace(/h/g, "").replace(/(.)\1+/g, "$1");
}

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-(),/.;:।'’"]+/u)
    .filter(Boolean);
}

/** Levenshtein distance, giving up (returning cap + 1) once it cannot stay within cap. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      row.push(v);
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/** 5 = same word, 3 = prefix, 2 = whole word within the typo budget, 1 = start of a longer word within it, 0 = none. */
function wordScore(q: string, w: string): number {
  if (q === w) return 5;
  if (q.length >= 2 && w.startsWith(q)) return 3;
  const L = q.length;
  if (L < 4) return 0;
  const budget = L < 7 ? 1 : 2;
  if (editDistance(q, w, budget) <= budget) return 2;
  if (w.length > L && editDistance(q, w.slice(0, L), 1) <= 1) return 1;
  return 0;
}

const KEEP_RATIO = 0.6;

export interface IndexEntry {
  id: string;
  slug: string;
  /** Folded words from names and slug (weight 3) and from category names and the short description (weight 1). */
  strong: string[];
  weak: string[];
}

export interface SearchIndex {
  entries: IndexEntry[];
  builtAt: number;
}

export interface IndexSource {
  id: string;
  slug: string;
  names: string[];
  /** Lower-weight text: category names and the short description. */
  categoryNames: string[];
}

export function buildIndex(sources: IndexSource[], now = Date.now()): SearchIndex {
  const uniq = (xs: string[]) => [...new Set(xs.filter((x) => x.length > 0))];
  return {
    builtAt: now,
    entries: sources.map((s) => ({
      id: s.id,
      slug: s.slug,
      strong: uniq([...s.names.flatMap(tokens), ...s.slug.split("-")].map(fold)),
      weak: uniq(s.categoryNames.flatMap(tokens).map(fold)),
    })),
  };
}

/** Product ids, best match first. Every query word has to match something in the product. */
export function matchIndex(index: SearchIndex, query: string, limit = 60): string[] {
  const words = tokens(query).slice(0, 6).map(fold).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { id: string; score: number }[] = [];
  for (const e of index.entries) {
    let total = 0;
    for (const q of words) {
      let best = 0;
      for (const w of e.strong) best = Math.max(best, wordScore(q, w) * 3);
      if (best < 15) for (const w of e.weak) best = Math.max(best, wordScore(q, w));
      if (best === 0) {
        total = -1;
        break;
      }
      total += best;
    }
    if (total > 0) scored.push({ id: e.id, score: total });
  }
  scored.sort((a, b) => b.score - a.score);
  // Keep matches close to the best one: "chal" finds চাল, and no longer "colour" pencils (a prefix
  // of a folded English word) once real whole-word matches exist.
  const floor = (scored[0]?.score ?? 0) * KEEP_RATIO;
  return scored
    .filter((s) => s.score > floor)
    .slice(0, limit)
    .map((s) => s.id);
}

// ── Cached index over the published catalogue (rebuilt at most once a minute per server instance) ──
const TTL_MS = 60_000;
let cached: { db: Db; index: SearchIndex } | null = null;
let building: Promise<SearchIndex> | null = null;
/** Bumped by `invalidateSearchIndex`: a build that started before a catalogue write is not kept. */
let generation = 0;

interface RawProduct {
  _id: ObjectId;
  slug: string;
  name: { bn?: string; en?: string };
  categoryIds?: ObjectId[];
  shortDescription?: { bn?: string; en?: string };
}

export async function catalogueIndex(db: Db, now = Date.now()): Promise<SearchIndex> {
  if (cached && cached.db === db && now - cached.index.builtAt < TTL_MS) return cached.index;
  if (building) return building;
  const started = generation;
  const thisBuild = (async () => {
    const cats = await db
      .collection<{ _id: ObjectId; name: { bn?: string; en?: string } }>(CATEGORIES)
      .find({ status: "published" }, { projection: { name: 1 } })
      .limit(5_000)
      .toArray();
    const categoryNamesById = new Map(cats.map((c) => [String(c._id), [c.name.bn ?? "", c.name.en ?? ""]]));
    const rows = await db
      .collection<RawProduct>(PRODUCTS)
      .find({ status: "published" }, { projection: { slug: 1, name: 1, categoryIds: 1, shortDescription: 1 } })
      .limit(20_000)
      .toArray();
    const index = buildIndex(
      rows.map((r) => ({
        id: String(r._id),
        slug: r.slug,
        names: [r.name.bn ?? "", r.name.en ?? ""],
        categoryNames: [...(r.categoryIds ?? []).flatMap((c) => categoryNamesById.get(String(c)) ?? []), r.shortDescription?.bn ?? "", r.shortDescription?.en ?? ""],
      })),
      now,
    );
    if (started === generation) cached = { db, index };
    return index;
  })();
  building = thisBuild;
  try {
    return await thisBuild;
  } finally {
    if (building === thisBuild) building = null;
  }
}

/**
 * Forgets this process's index after a catalogue write (Phase A, docs/CACHE-INVENTORY.md §3), so the
 * next search rebuilds from MongoDB. Other server instances catch up within TTL_MS.
 */
export function invalidateSearchIndex(): void {
  generation++;
  cached = null;
  building = null;
}

/** Test hook: forget the cached index. */
export function resetSearchIndex(): void {
  cached = null;
}
