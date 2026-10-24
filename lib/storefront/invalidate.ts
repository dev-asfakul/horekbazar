import "server-only";
// Tier: build. Phase A (D24): after a successful admin write to public data, clear the affected
// public-data cache tags with `updateTag` (read-your-own-writes; Server Actions only) and, for
// catalogue writes, this process's search index. Call it after the service has returned, never before.
import { updateTag } from "next/cache";
import { invalidateSearchIndex } from "@/lib/modules/storefront/search-index";
import { SEARCH_INDEX_WRITES, tagsFor, type PublicWrite } from "@/lib/storefront/cache-tags";

export function afterPublicWrite(...writes: PublicWrite[]): void {
  for (const tag of tagsFor(writes)) updateTag(tag);
  if (writes.some((w) => SEARCH_INDEX_WRITES.has(w))) invalidateSearchIndex();
}
