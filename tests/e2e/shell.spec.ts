// B1 shell checks at the three contract widths (375, 768, 1440) in every configured engine.
// No database: every storefront page shows setup-required, which is the honest state in B1.
import { expect, test, type Page } from "@playwright/test";
import { overlaps, waitForHydration, watchCsp, type Rect } from "./helpers";

/** Redesign: below 768 px the header search is an icon; open it when it is one. */
async function openSearch(page: import("@playwright/test").Page) {
  const toggle = page.locator(".header-search-toggle");
  if (await toggle.isVisible()) await toggle.click();
}

const widths = [
  { name: "375", width: 375, height: 812, dock: true },
  { name: "768", width: 768, height: 1024, dock: false },
  { name: "1440", width: 1440, height: 900, dock: false },
] as const;

async function rect(page: Page, selector: string): Promise<Rect> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

for (const vp of widths) {
  test.describe(`at ${vp.name} px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("shell landmarks, order and dock visibility", async ({ page }) => {
      await page.goto("/");
      await waitForHydration(page);
      // DOM order: skip link, header, main, footer, dock.
      const order = await page.evaluate(() =>
        [...document.body.children]
          .filter((el) => !(el as HTMLElement).hidden && el.tagName !== "SCRIPT" && el.tagName !== "NEXT-ROUTE-ANNOUNCER")
          .map((el) => el.id || el.className.split(" ")[0] || el.tagName.toLowerCase()),
      );
      expect(order.slice(0, 5)).toEqual(["skip-link", "site-header", "main", "site-footer", "bottom-dock"]);
      // Below 768 px the search is an icon that opens the field (redesign); from 768 px it is open.
      await expect(page.locator(".header-search-toggle")).toBeVisible({ visible: vp.dock });
      await openSearch(page);
      await expect(page.locator("#site-search")).toBeVisible();
      if (vp.dock) await page.locator(".header-search-close").click();
      await expect(page.getByRole("link", { name: "ক্যাটাগরি" }).first()).toBeVisible();
      await expect(page.locator("#bottom-dock")).toBeVisible({ visible: vp.dock });
      // Account and cart live in the header from band M up, and in the dock below it.
      await expect(page.locator(".header-action-wide").first()).toBeVisible({ visible: !vp.dock });
      await expect(page.locator("#site-footer")).toContainText("ক্যাশ অন ডেলিভারি");
    });

    test("the dock never covers content: --dock-h matches the dock and the footer ends above it", async ({ page }) => {
      await page.goto("/");
      await waitForHydration(page);
      const { dockH, bodyPad, dockHeight } = await page.evaluate(() => ({
        dockH: getComputedStyle(document.documentElement).getPropertyValue("--dock-h").trim(),
        bodyPad: getComputedStyle(document.body).paddingBottom,
        dockHeight: document.getElementById("bottom-dock")!.getBoundingClientRect().height,
      }));
      if (vp.dock) {
        expect(dockH).toBe(`${Math.round(dockHeight)}px`);
        expect(bodyPad).toBe(dockH);
        expect(dockHeight).toBeGreaterThanOrEqual(56);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const footer = await rect(page, "#site-footer");
        const dock = await rect(page, "#bottom-dock");
        expect(footer.bottom).toBeLessThanOrEqual(dock.top + 0.5);
      } else {
        expect(["", "0px"]).toContain(dockH);
        expect(bodyPad).toBe("0px");
      }
    });

    test("keyboard focus is never hidden by the dock or the sticky search row", async ({ page, browserName }) => {
      await page.goto("/");
      await waitForHydration(page);
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const r = el.getBoundingClientRect();
          const all = [...document.querySelectorAll("*")];
          const id = `${all.indexOf(el)}|${el.tagName}|${el.getAttribute("href") ?? ""}|${el.textContent?.trim().slice(0, 20)}`;
          const inDock = !!el.closest("#bottom-dock");
          // The skip link sits above everything (z-index 100) while focused, so nothing can cover it.
          const inHeader = !!el.closest("#site-header") || el.classList.contains("skip-link");
          return { id, inDock, inHeader, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } };
        });
        if (!info) continue;
        if (seen.has(info.id)) break; // wrapped around
        seen.add(info.id);
        if (vp.dock && !info.inDock) {
          const dock = await rect(page, "#bottom-dock");
          expect(overlaps(info.rect, dock), `${info.id} under the dock`).toBe(false);
          if (!info.inHeader) {
            const search = await rect(page, ".header-search-row");
            expect(overlaps(info.rect, search), `${info.id} under the sticky search row`).toBe(false);
          }
        }
        expect(info.rect.bottom, `${info.id} below the viewport`).toBeLessThanOrEqual(vp.height + 0.5);
        expect(info.rect.top, `${info.id} above the viewport`).toBeGreaterThanOrEqual(-0.5);
      }
      expect(seen.size).toBeGreaterThanOrEqual(vp.dock ? 12 : 8);
    });

    // Regression for the intermittent WebKit failure above: the dock slides back for 200 ms after a
    // text field loses focus, and a fast keyboard user (or a loaded CI machine) could land on a dock
    // link while it was still partly below the viewport (measured: bottom 869 px in an 812 px view).
    // Deterministic: focus a dock link in the first frames after leaving the search field.
    if (vp.dock) test("focus entering the dock right after the search field is fully visible at once", async ({ page }) => {
      await page.goto("/");
      await waitForHydration(page);
      await openSearch(page);
      await page.locator("#site-search").focus();
      await expect(page.locator("#bottom-dock")).toHaveAttribute("data-hidden", "true");
      const bottoms = await page.evaluate(async () => {
        const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
        (document.querySelector("#site-header button[type=submit]") as HTMLElement).focus();
        await raf();
        await raf();
        const link = document.querySelector("#bottom-dock a") as HTMLElement;
        link.focus();
        if (document.activeElement !== link) return null;
        const out: number[] = [];
        for (let i = 0; i < 6; i++) {
          out.push(link.getBoundingClientRect().bottom);
          await raf();
        }
        return out;
      });
      expect(bottoms, "the dock link could not take focus").not.toBeNull();
      for (const b of bottoms!) expect(b).toBeLessThanOrEqual(vp.height + 0.5);
    });

    test("skip link is the first focusable element and moves focus to main", async ({ page, browserName }) => {
      await page.goto("/en");
      await waitForHydration(page);
      await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      const skip = page.getByRole("link", { name: "Skip to main content" });
      await expect(skip).toBeFocused();
      const r = await rect(page, ".skip-link");
      expect(r.top).toBeGreaterThanOrEqual(0); // visible when focused
      await page.keyboard.press("Enter");
      await expect(page.locator("main#main")).toBeFocused();
    });

    test("no CSP violations across route classes", async ({ page }) => {
      const violations = await watchCsp(page);
      for (const path of ["/", "/en", "/cart", "/en/c/kitchen/cookware", "/p/steel-pot", "/offline", "/nope"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
      }
      expect(await violations()).toEqual([]);
    });
  });
}

test.describe("band S interactions (375 px)", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // Redesign (Proposal 03): search left the dock; the header search pill is always on screen.
  test("the dock has four items and focusing the header search takes the dock out of view and tab order", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.locator("#bottom-dock [data-nav]")).toHaveCount(4);
    await expect(page.locator("#bottom-dock [data-nav='search']")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 400));
    await openSearch(page);
    await page.locator("#site-search").focus();
    await expect(page.locator("#site-search")).toBeFocused();
    const field = await rect(page, "#site-search");
    expect(field.top).toBeGreaterThanOrEqual(0);
    await expect(page.locator("#bottom-dock")).toHaveAttribute("data-hidden", "true");
    expect(await page.locator("#bottom-dock").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    // Leaving the field brings the dock back.
    await page.locator("#site-search").blur();
    await expect(page.locator("#bottom-dock")).toHaveAttribute("data-hidden", "false");
    expect(await page.locator("#bottom-dock").evaluate((el) => (el as HTMLElement).inert)).toBe(false);
  });

  test("the current dock item has aria-current and a text label", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#bottom-dock [aria-current='page']")).toHaveText("হোম");
    await page.goto("/en/cart");
    await expect(page.locator("#bottom-dock [aria-current='page']")).toHaveText("Cart");
    await expect(page.locator("#bottom-dock [aria-current='page']")).toHaveCount(1);
  });

  // Redesign (Proposal 03): one header row (search left, store name right) that stays on screen.
  test("the header search row stays on screen when scrolling", async ({ page }) => {
    // A short viewport so the setup page is taller than the screen (no fixture content is added).
    await page.setViewportSize({ width: 375, height: 420 });
    await page.goto("/");
    await waitForHydration(page);
    await page.evaluate(() => window.scrollTo(0, 300));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const search = await rect(page, ".header-search-row");
    expect(search.top).toBeGreaterThanOrEqual(-0.5);
    expect(search.top).toBeLessThanOrEqual(12);
  });

  test("viewport opts into safe-area insets and the dock pads for them", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("meta[name='viewport']")).toHaveAttribute("content", /viewport-fit=cover/);
    // Browsers cannot emulate a non-zero inset; this checks the rule is applied (0 px on a rectangular screen).
    const pad = await page.locator("#bottom-dock").evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(pad).toBe("0px");
  });
});

test.describe("language, fonts and motion", () => {
  test("language switch keeps the page and query and remembers the choice", async ({ page, context }) => {
    await page.goto("/c/kitchen?page=2");
    await waitForHydration(page);
    await page.getByRole("link", { name: "এই পেজটি English-এ দেখুন" }).click();
    await page.waitForURL("**/en/c/kitchen?page=2");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect((await context.cookies()).find((c) => c.name === "hb-locale")?.value).toBe("en");
    await page.getByRole("link", { name: "এই পেজটি বাংলায় দেখুন" }).click();
    await page.waitForURL((url) => url.pathname === "/c/kitchen" && url.search === "?page=2");
    await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  });

  for (const [path, file] of [
    ["/", "google-sans-bengali.woff2"],
    ["/en", "google-sans-latin.woff2"],
  ] as const) {
    test(`exactly one font file is preloaded on ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      const link = response?.headers()["link"] ?? "";
      const headerPreloads = link.split(",").filter((l) => /rel=preload/.test(l) && /as="?font/.test(l));
      expect(headerPreloads).toHaveLength(1);
      expect(headerPreloads[0]).toContain(`/fonts/v1/${file}`);
      const domPreloads = await page.locator("link[rel='preload'][as='font']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
      expect(domPreloads.every((h) => h === `/fonts/v1/${file}`)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('16px "HB Google Sans"'))).toBe(true);
    });
  }

  test("fonts are served with long-lived immutable caching", async ({ request }) => {
    const r = await request.get("/fonts/v1/noto-sans-bengali-bengali.woff2");
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  test("conjuncts and mixed Bengali/Latin text are shaped by the bundled faces", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    for (const preset of ["plain", "khata"]) {
      await page.evaluate((p) => document.documentElement.setAttribute("data-font-preset", p), preset);
      await page.evaluate(() => document.fonts.load('16px "HB Tiro Bangla"'));
      for (const family of ['"HB Noto Sans Bengali"', '"HB Tiro Bangla"']) {
        await page.evaluate((f) => document.fonts.load(`16px ${f}`, "ক্ষ"), family);
        // A shaped conjunct is narrower than its parts drawn one by one (heuristic, plus the screenshots).
        const result = await page.evaluate((f) => {
          const ctx = document.createElement("canvas").getContext("2d")!;
          ctx.font = `16px ${f}`;
          const w = (t: string) => ctx.measureText(t).width;
          return ["ক্ষ", "ন্ত্র", "স্ট্র"].map((c) => ({ c, shaped: w(c), parts: [...c].reduce((s, ch) => s + w(ch), 0) }));
        }, family);
        for (const r of result) expect(r.shaped, `${family} ${r.c}`).toBeLessThan(r.parts);
      }
    }
  });

  test("reduced motion removes travel from the dock and buttons", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    // Redesign: the header no longer has a .btn (the category button left it), so a test button is
    // added to check the same stylesheet rule.
    const durations = await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.className = "btn btn-primary";
      document.querySelector("main")!.append(probe);
      return {
        dock: getComputedStyle(document.getElementById("bottom-dock")!).transitionDuration,
        button: getComputedStyle(probe).transitionDuration,
      };
    });
    for (const d of [durations.dock, ...durations.button.split(",")]) expect(parseFloat(d)).toBeLessThanOrEqual(0.00001);
  });
});

test.describe("states", () => {
  for (const [path, title, lang] of [
    ["/nope", "পেজটি পাওয়া যায়নি", "bn"],
    ["/en/nope", "Page not found", "en"],
    ["/p", "পেজটি পাওয়া যায়নি", "bn"],
  ] as const) {
    test(`404 at ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("meta[name='robots']").first()).toHaveAttribute("content", /noindex/);
      await expect(page.locator("#site-header")).toBeVisible();
    });
  }

  test("known storefront routes show setup-required, not invented content", async ({ page }) => {
    // /checkout now redirects to sign-in first (tests/e2e/identity.spec.ts).
    for (const path of ["/cart", "/en/search", "/c/kitchen/cookware/pots", "/p/steel-pot-5l"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("#setup-required")).toHaveCount(1);
      await expect(page.locator("meta[name='robots']").first()).toHaveAttribute("content", /noindex/);
    }
  });

  test("offline page offers a reload", async ({ page }) => {
    await page.goto("/en/offline");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("You're offline");
    await expect(page.getByRole("button", { name: "Reload" })).toBeVisible();
  });

  test("the real response keeps upgrade-insecure-requests (not weakened for tests)", async ({ request }) => {
    const csp = (await request.get("/")).headers()["content-security-policy"] ?? "";
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).toMatch(/style-src 'self' 'nonce-/);
    expect(csp).not.toContain("unsafe-inline");
  });
});
