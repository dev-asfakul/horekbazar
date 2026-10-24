// Proposal A1 shell (docs/ADMIN-REDESIGN-A1.md) against the disposable database: the full-screen menu
// follows the modal dialog pattern, navigation shows only the role's sections while the server still
// refuses the rest, a role that needs 2FA sees only Security until it is set up, and Sign out works.
// Sign-in uses the app's own auth service with the harness's throwaway secret (see catalogue-admin).
import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { createAuth } from "@/lib/modules/identity/auth";

const PASSWORD = "e2e-only-password-9";
const EDITOR = "e2e.shell.editor@example.test";
const MANAGER = "e2e.shell.manager@example.test";

let client: MongoClient;
let db: Db;
let auth: ReturnType<typeof createAuth>;
let baseURL: string;

test.beforeAll(async () => {
  const info = JSON.parse(readFileSync("test-results/e2e-db.json", "utf8")) as { uri: string; dbName: string; authSecret: string; baseURL: string };
  if (!info.dbName.endsWith("_dev") || !/^mongodb:\/\/127\.0\.0\.1:/.test(info.uri)) throw new Error("refusing: not the disposable e2e database");
  client = await MongoClient.connect(info.uri);
  db = client.db(info.dbName);
  baseURL = info.baseURL;
  auth = createAuth({ db, client, secret: info.authSecret, baseURL, production: true });
  for (const [email, name, role] of [
    [EDITOR, "Shell Editor", "catalogue_editor"],
    // store_manager requires 2FA (D7); this fixture user has not enrolled.
    [MANAGER, "Shell Manager", "store_manager"],
  ] as const) {
    if (!(await db.collection("user").findOne({ email }))) await auth.api.signUpEmail({ body: { name, email, password: PASSWORD } });
    const updated = await db.collection("user").updateOne({ email }, { $set: { emailVerified: true, staffRoleKey: role } });
    expect(updated.matchedCount).toBe(1);
  }
});

test.afterAll(async () => {
  await client?.close();
});

async function signIn(context: BrowserContext, email: string) {
  const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const cookies = res.headers.getSetCookie().map((c) => {
    const [pair] = c.split(";");
    const eq = pair!.indexOf("=");
    return { name: pair!.slice(0, eq), value: pair!.slice(eq + 1), domain: new URL(baseURL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "Lax" as const };
  });
  await context.addCookies(cookies);
}

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("menu: focus moves to Close, Escape closes and returns focus, links close it", async ({ page }) => {
    await signIn(page.context(), EDITOR);
    await page.goto("/admin/products");
    await expect(page.getByTestId("admin-products")).toBeVisible();
    await expect(page.getByTestId("admin-sidebar")).toBeHidden();
    const open = page.getByTestId("admin-menu-open");
    await open.click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    await expect(menu).toBeVisible();
    await expect(page.getByTestId("admin-menu-close")).toBeFocused();
    // Identity card: name, role and two-step state.
    await expect(menu.getByTestId("admin-identity")).toContainText("Shell Editor");
    await expect(menu.getByTestId("admin-identity")).toContainText("Catalogue editor");
    // Current page is marked.
    await expect(menu.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(open).toBeFocused();
    // Following a link closes the menu and lands on the page.
    await open.click();
    await menu.getByRole("link", { name: "Categories" }).click();
    await expect(page).toHaveURL(/\/admin\/categories$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator(".admin-topbar > .admin-topbar-title")).toHaveText("Categories");
  });

  test("a catalogue-only role sees Catalogue and Security only; the server still refuses the rest", async ({ page }) => {
    await signIn(page.context(), EDITOR);
    await page.goto("/admin/products");
    await page.getByTestId("admin-menu-open").click();
    const menu = page.getByRole("dialog", { name: "Menu" });
    const hrefs = await menu.locator("nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toContain("/admin/products");
    expect(hrefs).toContain("/admin/security");
    for (const h of ["/admin/orders", "/admin/customers", "/admin/settings", "/admin/staff", "/admin/health", "/admin/inventory"]) expect(hrefs).not.toContain(h);
    // Typing the address does not help: the page checks the capability itself.
    for (const path of ["/admin/orders", "/admin/customers", "/admin/settings"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(403);
    }
  });

  test("Sign out ends the session", async ({ page }) => {
    await signIn(page.context(), EDITOR);
    await page.goto("/admin/products");
    await page.getByTestId("admin-menu-open").click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.goto("/admin/products");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("desktop width", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar replaces the top bar and marks the nested current page", async ({ page }) => {
    await signIn(page.context(), EDITOR);
    await page.goto("/admin/products/new");
    await expect(page.getByTestId("admin-sidebar")).toBeVisible();
    await expect(page.getByTestId("admin-menu-open")).toBeHidden();
    await expect(page.getByTestId("admin-sidebar").getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("admin-sidebar").getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("a role that needs two-step verification sees only Security until it is set up", async ({ page }) => {
    await signIn(page.context(), MANAGER);
    await page.goto("/admin/security");
    const hrefs = await page.getByTestId("admin-sidebar").locator("nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(["/admin/security"]);
    // Other sections still send the user back to Security on the server.
    await page.goto("/admin/orders");
    await expect(page).toHaveURL(/\/admin\/security/);
  });
});
