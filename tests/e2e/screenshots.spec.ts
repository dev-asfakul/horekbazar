// Review evidence only (not assertions): full-page screenshots at 375, 768 and 1440 px for both
// locales and both font presets. Written to test-results/screenshots (git-ignored). Chromium only.
import { test } from "@playwright/test";
import { waitForHydration } from "./helpers";

test.skip(({ browserName }) => browserName !== "chromium" || !process.env.E2E_SCREENSHOTS, "set E2E_SCREENSHOTS=1 to capture");

for (const width of [375, 768, 1440]) {
  for (const path of ["/", "/en", "/nope"]) {
    for (const preset of ["plain", "khata"]) {
      test(`screenshot ${width} ${path} ${preset}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 375 ? 812 : width === 768 ? 1024 : 900 });
        await page.goto(path);
        await waitForHydration(page);
        await page.evaluate((p) => document.documentElement.setAttribute("data-font-preset", p), preset);
        // Swapped faces load only when used; wait for the display face before capturing.
        await page.evaluate(async () => {
          const sample = document.querySelector("h1")?.textContent ?? "";
          await document.fonts.load('400 33px "HB Tiro Bangla"', sample);
          await document.fonts.ready;
        });
        const name = `${width}-${path === "/" ? "bn-home" : path.replaceAll("/", "")}-${preset}.png`;
        await page.screenshot({ path: `test-results/screenshots/${name}`, fullPage: true });
      });
    }
  }
}

test("screenshot conjunct and mixed-script fixture", async ({ page }) => {
  // Test-only fixture text, injected into the page in the test (never shipped, never catalogue data).
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.evaluate(async () => {
    const main = document.getElementById("main")!;
    main.replaceChildren();
    const samples = ["ক্ষ ন্ত্র র্য ঙ্ক স্ট্র", "Brand চানাচুর ৳১,২৫,০০০ ৳1,250", "স্টিলের পাতিল (Model X) ৫ লিটার"];
    for (const family of ['"HB Noto Sans Bengali"', '"HB Tiro Bangla"']) {
      for (const size of [12, 14, 16]) {
        for (const text of samples) {
          const p = document.createElement("p");
          p.textContent = `${size}px ${family.includes("Tiro") ? "Tiro" : "Noto"}: ${text}`;
          p.style.fontFamily = family; // CSSOM, allowed by the CSP
          p.style.fontSize = `${size}px`;
          p.style.padding = "2px 16px";
          main.append(p);
        }
      }
    }
    await document.fonts.load('16px "HB Tiro Bangla"', "ক্ষ");
    await document.fonts.ready;
  });
  await page.locator("#main").screenshot({ path: "test-results/screenshots/375-conjunct-fixture.png" });
});
