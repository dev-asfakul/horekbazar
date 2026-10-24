// Test double for `next/cache` as the Phase A public-data cache uses it (BUILD-PLAN D25). It follows
// the documented `unstable_cache` behaviour: results are stored as JSON under the key parts; a fresh
// entry is served; an entry past `revalidate` seconds is served while it refreshes in the background,
// on every read until a refresh is stored (a failed refresh keeps the old entry, as
// next/dist/server/web/spec-extension/unstable-cache.js does); an entry whose tag was cleared with
// `updateTag`/`revalidateTag` is not served; a loader that throws stores nothing. Time comes from
// `Date.now()`, so tests can move the clock.
interface Stored {
  json: string;
  at: number;
  revalidate: number | false;
  tags: string[];
}

export const store = new Map<string, Stored>();
export const background: Promise<unknown>[] = [];
export const cleared: string[] = [];

export function resetFakeCache() {
  store.clear();
  background.length = 0;
  cleared.length = 0;
}

/** Waits for background refreshes started by stale reads. */
export async function settle() {
  while (background.length) await Promise.allSettled(background.splice(0));
}

export function unstable_cache<A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[] = [], opts: { revalidate?: number | false; tags?: string[] } = {}) {
  return async (...args: A): Promise<R> => {
    const key = JSON.stringify([keyParts, args]);
    const put = async () => {
      const value = await fn(...args);
      store.set(key, { json: JSON.stringify(value), at: Date.now(), revalidate: opts.revalidate ?? false, tags: opts.tags ?? [] });
      return value;
    };
    const hit = store.get(key);
    if (!hit) return put();
    if (hit.revalidate !== false && Date.now() - hit.at > hit.revalidate * 1000) background.push(put().catch(() => undefined));
    return JSON.parse(hit.json) as R;
  };
}

function clear(tag: string) {
  cleared.push(tag);
  for (const [k, v] of store) if (v.tags.includes(tag)) store.delete(k);
}

export const updateTag = (tag: string) => clear(tag);
export const revalidateTag = (tag: string) => clear(tag);
export const revalidatePath = () => undefined;
export const refresh = () => undefined;
