// Shared Playwright helpers.
import type { Page } from "@playwright/test";

/** Records CSP violations (DOM event and console) from before the first script runs. */
export async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  const consoleViolations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content[- ]Security[- ]Policy/i.test(m.text())) consoleViolations.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = window as unknown as { __csp?: string[] };
      (w.__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  return async () => {
    const domViolations = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
    return [...consoleViolations, ...domViolations];
  };
}

/** True once the page is hydrated (a client component attached its effects). */
export async function waitForHydration(page: Page) {
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--dock-h") !== "" || window.innerWidth >= 768);
  await page.waitForLoadState("networkidle");
}

export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
