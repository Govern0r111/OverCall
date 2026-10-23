import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("demo app shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
    });
  });

  test("loads the demo without contacting the backend", async ({ page }) => {
    const backendRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).origin === "http://localhost:8000") backendRequests.push(request.url());
    });

    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByTestId("topbar-proxy-status")).toContainText("Demo data only");
    expect(backendRequests).toEqual([]);
  });

  test("currency changes update shared dashboard formatting", async ({ page }) => {
    await page.goto("/app");
    const savings = page.getByTestId("hero-projected-savings");

    await page.getByTestId("topbar-currency-usd").click();
    await expect(savings).toContainText("$");
    await page.getByTestId("topbar-currency-inr").click();
    await expect(savings).toContainText("₹");
  });

  test("shows a mobile navigation drawer that closes after selecting a page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const issuesLink = page.getByTestId("nav-issues-link");
    await expect(issuesLink).toBeVisible();
    await issuesLink.click();
    await expect(page).toHaveURL(/\/app\/issues/);
    await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toHaveAttribute("aria-expanded", "false");
  });

  test("renders provider setup snippets and states that ingest-key management is unavailable", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/app/providers");
    await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
    await expect(page.getByText(/does not provide ingest-key creation/i).first()).toBeVisible();
    await expect(page.getByText(/YOUR_OPENAI_API_KEY/)).toHaveCount(0);
    await expect(page.locator("pre code").first()).toContainText("$OPENAI_API_KEY");
    await expect(page.getByTestId("provider-status-aws")).toContainText("Coming soon");

    const proxyUrl = await page.getByTestId("provider-openai-copy-url-button-value").textContent();
    const copyButton = page.getByTestId("provider-openai-copy-url-button");
    await copyButton.click();
    await expect(copyButton).toContainText("Copied");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(proxyUrl);
  });
});

test("returns to the requested deep link after demo sign-in", async ({ page }) => {
  await page.goto("/app/logs?status=5xx");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByRole("button", { name: "Continue as demo" }).click();
  await expect(page).toHaveURL(/\/app\/logs\?status=5xx/);
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await expect(page.getByText("No sample data is being shown.")).toHaveCount(0);
});

test("auth flow supports demo signup and log out", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("new@example.com");
  await page.locator("#auth-password").fill("secure-demo-password");
  await page.locator("#auth-confirm").fill("secure-demo-password");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.getByLabel("Email").fill("new@example.com");
  await page.locator("#auth-password").fill("secure-demo-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("logs show an error instead of fabricated rows when the API fails", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
  });
  await page.goto("/app/logs?scenario=error");
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("No sample data is being shown");
  await expect(page.getByText("/v1/chat/completions")).toHaveCount(0);
});

test("issue filters and expanded rows are shareable and sample metadata is allowlisted", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
  });
  await page.goto("/app/issues?provider=openai&severity=warning&tier=1");
  const row = page.getByTestId("issue-row-expand-button-0");
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page).toHaveURL(/provider=openai.*severity=warning.*tier=1.*open=issue-duplicate-requests/);
  await page.keyboard.press("Space");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Space");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const sampleTable = page.getByTestId("issue-detail-0").locator("table");
  await expect(sampleTable.getByRole("columnheader")).toHaveText(["Time", "Status", "Size", "Payload hash", "Cost"]);
  await expect(sampleTable.getByText("POST")).toHaveCount(0);
  await expect(sampleTable.getByText(/content|body/i)).toHaveCount(0);
  await page.getByRole("link", { name: "View matching requests in logs" }).click();
  await expect(page).toHaveURL(/\/app\/logs\?issue=issue-duplicate-requests/);
});

test("log search syncs to the URL and the metadata panel restores focus on Escape", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
  });
  await page.goto("/app/logs");
  const search = page.getByRole("textbox", { name: "Search logs" });
  await search.fill("/chat");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("/chat");

  const openDetails = page.getByRole("button", { name: /Open metadata for openai/ }).first();
  await openDetails.click();
  await expect(page.getByRole("dialog", { name: "Request metadata" })).toBeVisible();
  await expect(page.getByRole("link", { name: "issue-duplicate-requests" })).toBeVisible();
  const accessibilityResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityResults.violations, "Accessibility violations with the metadata panel open").toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Request metadata" })).toBeHidden();
  await expect(openDetails).toBeFocused();
});

test("settings validate thresholds and confirm real upstream and data deletion", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
  });
  await page.goto("/app/settings");
  const shortWindow = page.getByTestId("window-input-short_window_s");
  const longWindow = page.getByTestId("window-input-long_window_s");
  await shortWindow.fill("0");
  await expect(page.getByRole("button", { name: "Save thresholds" })).toBeDisabled();
  await expect(page.getByText("Enter a positive whole number.").first()).toBeVisible();
  await shortWindow.fill("10");
  await longWindow.fill("5");
  await expect(page.getByText(/long window must be greater/i)).toBeVisible();
  await longWindow.fill("300");

  await page.getByTestId("openai-upstream-real").click();
  const upstreamDialog = page.getByRole("dialog", { name: "Use the real OpenAI API?" });
  await expect(upstreamDialog).toBeVisible();
  const enableUpstream = upstreamDialog.getByRole("button", { name: "Enable real upstream" });
  await expect(enableUpstream).toBeDisabled();
  await upstreamDialog.getByRole("checkbox").check();
  await enableUpstream.click();
  await expect(upstreamDialog).toBeHidden();
  await expect(page.getByTestId("openai-upstream-real")).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByTestId("openai-upstream-real")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("clear-data-button").click();
  const clearDialog = page.getByRole("dialog", { name: "Clear all request data?" });
  await clearDialog.getByLabel(/Type delete my data to confirm/).fill("delete my data");
  await clearDialog.getByRole("button", { name: "Delete data" }).click();
  await expect(clearDialog).toBeHidden();
  await expect(page.getByRole("heading", { name: /Synthetic data/ })).toBeVisible();
  await expect(page.getByText("Real-traffic fixtures")).toBeVisible();
  await expect(page.getByText(/Not measured yet/)).toBeVisible();

  await page.getByTestId("nav-overview-link").click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await page.getByTestId("load-synthetic-data-button").click();
  await expect(page.getByTestId("hero-savings-card")).toBeVisible();
});

test("dashboard pages pass axe accessibility checks in the demo", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@overcall.local" }));
  });
  for (const path of ["/app", "/app/issues", "/app/logs", "/app/providers", "/app/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `Accessibility violations on ${path}`).toEqual([]);
  }
});
