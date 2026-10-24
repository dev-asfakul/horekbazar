// Search suggestion cache in this browser tab (Phase D, decision D27). A suggestion answer is kept
// for 30 s, keyed by locale and the typed term, so retyping or backspacing does not ask the server
// again. It holds public catalogue data only (the server route sends nothing private) and lives in
// memory: nothing is written to storage. It is cleared on every navigation, so a new page never
// shows suggestions older than the page; within 30 s it cannot notice catalogue changes (D27).
import type { Suggestions } from "@/app/api/search/suggest/route";

export const SUGGEST_TTL_MS = 30_000;
export const SUGGEST_MAX_ENTRIES = 40;

const entries = new Map<string, { at: number; body: Suggestions }>();
const key = (locale: string, term: string) => `${locale}\u0000${term}`;

export function readSuggestions(locale: string, term: string, now = Date.now()): Suggestions | null {
  const k = key(locale, term);
  const hit = entries.get(k);
  if (!hit) return null;
  if (now - hit.at >= SUGGEST_TTL_MS) {
    entries.delete(k);
    return null;
  }
  return hit.body;
}

export function storeSuggestions(locale: string, term: string, body: Suggestions, now = Date.now()) {
  const k = key(locale, term);
  entries.delete(k); // re-insert so the Map order stays oldest-first
  entries.set(k, { at: now, body });
  while (entries.size > SUGGEST_MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

export function clearSuggestions() {
  entries.clear();
}

export function cachedSuggestionCount() {
  return entries.size;
}
