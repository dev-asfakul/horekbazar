// Phase D (D27): the 30 s in-memory suggestion cache.
import { beforeEach, describe, expect, it } from "vitest";
import { SUGGEST_MAX_ENTRIES, SUGGEST_TTL_MS, cachedSuggestionCount, clearSuggestions, readSuggestions, storeSuggestions } from "@/components/shell/suggest-cache";

const body = (q: string) => ({ q, terms: [q], categories: [], products: [] });

describe("suggestion cache", () => {
  beforeEach(() => clearSuggestions());

  it("returns a stored answer for the same locale and term within 30 s", () => {
    storeSuggestions("bn", "চাল", body("চাল"), 1_000);
    expect(readSuggestions("bn", "চাল", 1_000 + SUGGEST_TTL_MS - 1)?.q).toBe("চাল");
    expect(readSuggestions("en", "চাল", 1_000)).toBeNull();
    expect(readSuggestions("bn", "চা", 1_000)).toBeNull();
  });

  it("drops an answer at 30 s", () => {
    storeSuggestions("bn", "rice", body("rice"), 0);
    expect(readSuggestions("bn", "rice", SUGGEST_TTL_MS)).toBeNull();
    expect(cachedSuggestionCount()).toBe(0);
  });

  it("is cleared on navigation (clearSuggestions)", () => {
    storeSuggestions("bn", "oil", body("oil"));
    clearSuggestions();
    expect(readSuggestions("bn", "oil")).toBeNull();
  });

  it("keeps at most a bounded number of terms, dropping the oldest", () => {
    for (let i = 0; i <= SUGGEST_MAX_ENTRIES; i++) storeSuggestions("en", `t${i}`, body(`t${i}`), 0);
    expect(cachedSuggestionCount()).toBe(SUGGEST_MAX_ENTRIES);
    expect(readSuggestions("en", "t0", 0)).toBeNull();
    expect(readSuggestions("en", `t${SUGGEST_MAX_ENTRIES}`, 0)).not.toBeNull();
  });
});
