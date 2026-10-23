// B10 offline fallback in public/sw.js, run in a sandbox with stand-ins for the worker globals
// (self, caches, fetch). It checks what is stored on install and which requests the worker answers.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const ORIGIN = "https://shop.example";
const source = readFileSync("public/sw.js", "utf8");

type Handler = (event: Record<string, unknown>) => void;

function load(fetchImpl: (req: Request) => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  const fetched: Request[] = [];
  const keyOf = (r: Request | string) => {
    const u = new URL(typeof r === "string" ? r : r.url, ORIGIN);
    return u.pathname + u.search;
  };
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      put: async (r: Request | string, res: Response) => void m.set(keyOf(r), res),
      addAll: async (reqs: Request[]) => {
        for (const r of reqs) {
          const res = await sandboxFetch(r);
          if (!res.ok) throw new Error("addAll failed");
          m.set(keyOf(r), res);
        }
      },
    };
  };
  const sandboxFetch = async (input: Request | string) => {
    const req = typeof input === "string" ? new Request(new URL(input, ORIGIN)) : input;
    fetched.push(req);
    return fetchImpl(req);
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    delete: async (name: string) => stores.delete(name),
    match: async (r: Request | string, opts?: { cacheName?: string }) => stores.get(opts?.cacheName ?? "")?.get(keyOf(r))?.clone(),
  };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Handler) => handlers.set(type, fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    registration: {},
  };
  // Relative URLs in `new Request("/offline")` resolve against the worker's origin, as in a browser.
  class SwRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN) : input, init);
    }
  }
  runInNewContext(source, { self, caches, fetch: sandboxFetch, Request: SwRequest, Response, URL, Set, Error, Map, Promise });
  return { handlers, stores, fetched };
}

const offlineHtml = (lang: string) =>
  `<html lang="${lang}"><link rel="stylesheet" href="/_next/static/css/app.css"><link rel="preload" href="/fonts/v1/bn.woff2"><script src="/_next/static/chunks/main.js?dpl=1"></script></html>`;

function online(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === "/offline") return Promise.resolve(new Response(offlineHtml("bn"), { status: 200 }));
  if (path === "/en/offline") return Promise.resolve(new Response(offlineHtml("en"), { status: 200 }));
  return Promise.resolve(new Response(`asset ${path}`, { status: 200 }));
}

async function install(sw: ReturnType<typeof load>) {
  let done: Promise<unknown> = Promise.resolve();
  sw.handlers.get("install")!({ waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
}

function dispatchFetch(sw: ReturnType<typeof load>, url: string, init: RequestInit & { mode?: string } = {}) {
  let answer: Promise<Response> | undefined;
  const request = { url: new URL(url, ORIGIN).href, method: init.method ?? "GET", mode: init.mode ?? "no-cors" };
  sw.handlers.get("fetch")!({ request, respondWith: (p: Promise<Response>) => (answer = p) });
  return answer;
}

describe("service worker offline fallback (B10)", () => {
  it("stores both offline pages without cookies, plus the static files they link to", async () => {
    const sw = load(online);
    await install(sw);
    const stored = [...(sw.stores.get("offline-v1")?.keys() ?? [])].sort();
    expect(stored).toEqual(["/_next/static/chunks/main.js?dpl=1", "/_next/static/css/app.css", "/en/offline", "/fonts/v1/bn.woff2", "/offline"]);
    for (const req of sw.fetched) expect(req.credentials).toBe("omit");
  });

  it("shows the offline page of the right language only when a page navigation fails", async () => {
    let up = true;
    const sw = load((req) => (up ? online(req) : Promise.reject(new TypeError("network down"))));
    await install(sw);
    expect(await (await dispatchFetch(sw, "/categories", { mode: "navigate" }))!.text()).toBe("asset /categories");
    up = false;
    expect(await (await dispatchFetch(sw, "/categories", { mode: "navigate" }))!.text()).toContain('lang="bn"');
    expect(await (await dispatchFetch(sw, "/en/p/rice", { mode: "navigate" }))!.text()).toContain('lang="en"');
    expect(await (await dispatchFetch(sw, "/en", { mode: "navigate" }))!.text()).toContain('lang="en"');
    expect(await (await dispatchFetch(sw, "/_next/static/css/app.css"))!.text()).toBe("asset /_next/static/css/app.css");
    const unknownAsset = await dispatchFetch(sw, "/_next/static/chunks/other.js");
    expect((await unknownAsset!).type).toBe("error");
  });

  it("leaves the admin, the API, form posts, other files and other sites to the network", async () => {
    const sw = load(online);
    await install(sw);
    expect(dispatchFetch(sw, "/admin/products", { mode: "navigate" })).toBeUndefined();
    expect(dispatchFetch(sw, "/api/health", { mode: "navigate" })).toBeUndefined();
    expect(dispatchFetch(sw, "/api/cart")).toBeUndefined();
    expect(dispatchFetch(sw, "/checkout", { mode: "navigate", method: "POST" })).toBeUndefined();
    expect(dispatchFetch(sw, "/media/photo.webp")).toBeUndefined();
    expect(dispatchFetch(sw, "https://other.example/x", { mode: "navigate" })).toBeUndefined();
  });

  it("keeps working for notifications when the offline page cannot be downloaded", async () => {
    const sw = load(() => Promise.resolve(new Response("down", { status: 503 })));
    await install(sw);
    expect(sw.stores.has("offline-v1")).toBe(false);
    expect(sw.handlers.has("push")).toBe(true);
  });
});
