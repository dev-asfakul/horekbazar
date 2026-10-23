"use client";
// Tier: build. Use-when: once, in the storefront layout. Registers public/sw.js so a failed page
// navigation shows /offline (B10). Registering asks for no permission; notifications still need the
// customer's opt-in on /account/notifications. Production builds only, so development reloads are not
// served by an old worker.
import { useEffect } from "react";

export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // No offline page in this browser; everything else works without it.
    });
  }, []);
  return null;
}
