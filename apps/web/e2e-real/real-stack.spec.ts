import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const userId = process.env.E2E_USER_ID!;
const email = "real-e2e@overcall.local";
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const jwtSecret = process.env.E2E_TEST_JWT_SECRET!;
const apiOrigin = `http://127.0.0.1:${process.env.E2E_API_PORT}`;

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createAccessToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = [
    base64Url({ alg: "HS256", typ: "JWT" }),
    base64Url({
      aud: "authenticated",
      email,
      exp: now + 3600,
      iat: now,
      iss: `${supabaseUrl}/auth/v1`,
      role: "authenticated",
      sub: userId,
    }),
  ].join(".");
  const signature = createHmac("sha256", jwtSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

test("real account reads and writes persisted API data without demo fixtures", async ({ page }) => {
  const accessToken = createAccessToken();
  const apiResponses: Array<{ pathname: string; status: number }> = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/v1/")) {
      apiResponses.push({ pathname, status: response.status() });
    }
  });
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };

  await page.route(`${supabaseUrl}/auth/v1/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "local-e2e-refresh-token",
          user,
        }),
      });
      return;
    }
    if (pathname.endsWith("/user")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.locator("#auth-password").fill("local-e2e-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect.poll(() =>
    apiResponses.some(
      ({ pathname, status }) => pathname.endsWith("/v1/overview") && status === 200,
    ),
  ).toBe(true);
  await expect(page.getByText("No sample data is being shown.")).toHaveCount(0);
  await expect(page.getByTestId("topbar-proxy-status")).not.toContainText("Demo data only");

  await page.goto("/app/providers");
  await page.getByRole("button", { name: "Create ingest key" }).click();
  await page.getByLabel("Key name").fill("real-e2e");
  const keyResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/ingest-keys" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create key" }).click();
  const created = await (await keyResponse).json();
  const createdKey = typeof created.key === "string" ? created.key : "";
  await expect(page.getByLabel("Your ingest key")).toBeVisible();
  await page.getByRole("button", { name: "I have saved it" }).click();
  await expect(page.getByText("real-e2e", { exact: true })).toBeVisible();
  expect(/^oc_[A-Za-z0-9_-]{43}$/.test(createdKey)).toBe(true);

  for (let request = 0; request < 2; request += 1) {
    const response = await page.request.get(`${apiOrigin}/proxy/openai/v1/models`, {
      headers: {
        "X-Overcall-Key": createdKey,
        "X-Overcall-Caller": "real-e2e",
      },
    });
    expect(response.status()).toBe(200);
  }

  const authorization = { Authorization: `Bearer ${accessToken}` };
  await expect.poll(async () => {
    const response = await page.request.get(`${apiOrigin}/v1/logs?limit=10`, {
      headers: authorization,
    });
    return (await response.json()).items.length;
  }, { timeout: 15_000 }).toBe(2);

  await page.goto("/app/logs");
  await expect(page.getByTestId("desktop-log-results").locator("tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("desktop-log-results")).toContainText("/v1/models");

  await page.goto("/app");
  await expect(page.getByTestId("analyze-traffic-button")).toBeVisible();
  const rerun = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/v1/detection/run") &&
      response.request().method() === "POST",
  );
  await page.getByTestId("analyze-traffic-button").click();
  expect((await rerun).status()).toBe(200);
  await page.goto("/app/issues");
  await expect(page.getByText(/Identical OpenAI calls repeated within seconds/)).toBeVisible();

  for (const [pathname, title] of [
    ["/app", "Overview"],
    ["/app/issues", "Issues"],
    ["/app/logs", "Logs"],
    ["/app/providers", "Providers"],
    ["/app/settings", "Settings"],
    ["/app/profile", "Profile"],
  ]) {
    await page.goto(pathname);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("No sample data is being shown.")).toHaveCount(0);
    await expect(page.getByTestId("topbar-proxy-status")).not.toContainText("Demo data only");
  }

  await page.goto("/app/settings");
  const usdCurrency = page.getByTestId("topbar-currency-usd");
  await usdCurrency.click();
  await expect(usdCurrency).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByTestId("topbar-currency-usd")).toHaveAttribute("aria-pressed", "true");

  await page.goto("/app/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
