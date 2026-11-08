import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing loads without requests to another origin", async ({ page }) => {
  await page.goto("/");
  const appOrigin = new URL(page.url()).origin;
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== appOrigin ||
      url.pathname.startsWith("/v1/") ||
      url.pathname.startsWith("/proxy/")
    ) {
      externalRequests.push(request.url());
    }
  });

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your API spend, made clear.");
  expect(externalRequests).toEqual([]);
});

test("the primary links point to signup and the demo routes", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
  });
  await page.goto("/");

  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.goto("/");
  await page.getByRole("link", { name: /try the demo/i }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("the skip link moves focus to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("login is keyboard navigable and accessible across themes and narrow screens", async ({ page }) => {
  await page.goto("/login");

  for (const theme of ["light", "dark"]) {
    await page.evaluate((preference) => localStorage.setItem("overcall-theme", preference), theme);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

    if (theme === "light") {
      await page.keyboard.press("Tab");
      const skipLink = page.getByRole("link", { name: "Skip to content" });
      await expect(skipLink).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#main-content")).toBeFocused();
    }

    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow, `Login overflows at ${width}px in ${theme} theme`).toBe(false);
    }

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `Login accessibility violations in ${theme} theme`).toEqual([]);
  }
});

test("FAQ can be opened with the keyboard and the page fits common widths", async ({ page }) => {
  await page.goto("/");
  const summary = page.locator("details summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details").first()).toHaveJSProperty("open", true);

  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
    if (width === 320) {
      const signup = await page.getByRole("link", { name: "Sign up" }).boundingBox();
      expect(signup?.height).toBeGreaterThanOrEqual(40);
    }
  }
});

for (const theme of ["light", "dark"]) {
  test(`landing has no axe violations in ${theme} theme`, async ({ page }) => {
    await page.addInitScript((preference) => {
      localStorage.setItem("overcall-theme", preference);
    }, theme);
    await page.goto("/");

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasHorizontalOverflow, `${theme} theme at ${width}px`).toBe(false);
    }
    await page.screenshot({ path: `test-results/landing-${theme}.png`, fullPage: true });
  });
}
