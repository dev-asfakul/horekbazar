// Phase C: the navigation bar in a real browser. A slow in-app navigation (the RSC request held for
// 1.2 s) shows one thin progress bar, which is gone once the new page is in; a same-page link shows none;
// reduced motion keeps the bar still. No full-screen loader, CSP clean.
import { expect, test } from "@playwright/test";
import { watchCsp } from "../e2e/helpers";

async function holdRsc(page: import("@playwright/test").Page, ms: number) {
  await page.route(
    (url) => url.pathname.endsWith("/about"),
    async (route) => {
      if (route.request().headers()["rsc"]) await new Promise((r) => setTimeout(r, ms));
      await route.continue();
    },
  );
}

test("a slow in-app navigation shows one progress bar that clears when the page arrives", async ({ page }) => {
  const csp = await watchCsp(page);
  await page.goto("/en");
  await holdRsc(page, 1200);
  const link = page.getByRole("contentinfo").getByRole("link", { name: "About" });
  await link.click();
  const bar = page.locator(".nav-progress");
  await expect(bar).toHaveCount(1);
  await expect(bar).toHaveAttribute("data-state", "active");
  await expect(bar).toHaveAttribute("role", "progressbar");
  const box = await bar.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(3);
  await expect(page).toHaveURL(/\/en\/about$/);
  await expect(bar).toHaveCount(0);
  expect(await csp()).toEqual([]);
});

test("a link to the same page (a hash on it) never starts the bar", async ({ page }) => {
  await page.goto("/en");
  let seen = false;
  await page.exposeFunction("hbSawBar", () => (seen = true));
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector(".nav-progress")) (window as unknown as { hbSawBar: () => void }).hbSawBar();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.evaluate(() => {
    const a = document.createElement("a");
    a.href = location.pathname + "#main";
    a.textContent = "same page";
    a.id = "hb-same";
    document.body.append(a);
  });
  await page.locator("#hb-same").click();
  await page.waitForTimeout(400);
  expect(seen).toBe(false);
});

test("reduced motion: the bar does not animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en");
  await holdRsc(page, 1200);
  await page.getByRole("contentinfo").getByRole("link", { name: "About" }).click();
  const bar = page.locator(".nav-progress");
  await expect(bar).toHaveAttribute("data-state", "active");
  expect(await bar.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await expect(bar).toHaveCount(0);
});
