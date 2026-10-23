// Storefront service worker. B9: browser notifications (shows a push message and opens its link,
// only paths on this site, whatever a message says). B10: offline fallback. On install it stores the
// /offline page (both locales, fetched without cookies so no personal data is kept) and the static
// files that page links to; when a page navigation fails because the network is down it shows that
// page. Nothing else is cached: other pages, the API, server actions and the admin always use the
// network, so no stale prices, stock or carts are ever shown.
"use strict";

const OFFLINE_CACHE = "offline-v1";
const OFFLINE_PAGES = ["/offline", "/en/offline"];
// Query strings are kept (deployment ids such as ?dpl=… are part of the asset URL the page requests).
const STATIC_REF = /\/(?:_next\/static|fonts)\/[^"'\s)<>#]+/g;

async function storeOfflinePages() {
  await caches.delete(OFFLINE_CACHE);
  const cache = await caches.open(OFFLINE_CACHE);
  const assets = new Set();
  for (const path of OFFLINE_PAGES) {
    const response = await fetch(new Request(path, { credentials: "omit", cache: "reload" }));
    if (!response.ok) throw new Error(`offline page ${path}: ${response.status}`);
    const html = await response.clone().text();
    for (const ref of html.match(STATIC_REF) || []) assets.add(ref.replace(/&amp;/g, "&"));
    await cache.put(path, response);
  }
  await cache.addAll([...assets].map((ref) => new Request(ref, { credentials: "omit" })));
}

self.addEventListener("install", (event) => {
  // A failed download leaves the worker usable for notifications; it simply has no offline page.
  event.waitUntil(storeOfflinePages().catch(() => caches.delete(OFFLINE_CACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function offlinePageFor(pathname) {
  return pathname === "/en" || pathname.startsWith("/en/") ? "/en/offline" : "/offline";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (/^\/(?:admin|api)(?:\/|$)/.test(url.pathname)) return;
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(offlinePageFor(url.pathname), { cacheName: OFFLINE_CACHE })) || Response.error()),
    );
    return;
  }
  // The offline page's own styles, scripts and fonts, only when the network is down.
  if (/^\/(?:_next\/static|fonts)\//.test(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request, { cacheName: OFFLINE_CACHE })) || Response.error()));
  }
});

function sameSitePath(value) {
  if (typeof value !== "string" || !/^\/(?!\/)/.test(value)) return "/";
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 80) : self.location.hostname;
  const options = {
    body: typeof data.body === "string" ? data.body.slice(0, 200) : "",
    tag: typeof data.tag === "string" ? data.tag.slice(0, 64) : undefined,
    data: { url: sameSitePath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(sameSitePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url === target && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
