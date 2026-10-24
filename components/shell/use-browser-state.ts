"use client";
// Browser-only values without setState-in-effect: `useHydrated` is false on the server and during
// hydration, true after; `useStoredString` follows one localStorage key (null when unset or when
// storage is blocked) and updates on writes from this tab (notifyStored) and from other tabs.
import { useSyncExternalStore } from "react";

const EVENT = "hb-storage";
const noop = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function notifyStored() {
  window.dispatchEvent(new Event(EVENT));
}

export function useStoredString(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
}
