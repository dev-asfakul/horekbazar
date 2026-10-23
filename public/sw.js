// Storefront service worker (B9 part 2: browser notifications only). Registered from
// /account/notifications when the customer turns notifications on. It shows a push message and opens
// its link when tapped. It caches nothing (the offline page arrives in B10) and opens only paths on
// this site, whatever a message says.
"use strict";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
