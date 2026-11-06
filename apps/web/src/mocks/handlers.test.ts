import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const api = `${window.location.origin}/v1`;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("demo API handlers", () => {
  it("persists settings updates between requests", async () => {
    const original = await fetch(`${api}/settings`).then((response) => response.json());
    const originalUpdate = { ...original };
    delete originalUpdate.updated_at;
    const changed = { ...originalUpdate, currency: "USD" };
    const put = await fetch(`${api}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changed),
    });
    expect(put.status).toBe(200);

    const saved = await fetch(`${api}/settings`).then((response) => response.json());
    expect(saved.currency).toBe("USD");
    await fetch(`${api}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(originalUpdate),
    });
  });

  it("serves versioned response DTOs for the signed-in dashboard requests", async () => {
    const [overview, issues, logs, settings, providers, accuracy] = await Promise.all([
      fetch(`${api}/overview`).then((response) => response.json()),
      fetch(`${api}/issues`).then((response) => response.json()),
      fetch(`${api}/logs`).then((response) => response.json()),
      fetch(`${api}/settings`).then((response) => response.json()),
      fetch(`${api}/providers`).then((response) => response.json()),
      fetch(`${api}/accuracy`).then((response) => response.json()),
    ]);

    expect(overview).toHaveProperty("spend_savings.projected_monthly_usd");
    expect(overview).not.toHaveProperty("projected_monthly_usd");
    expect(issues).toHaveProperty("items");
    expect(issues.items[0]).toHaveProperty("window_savings_usd");
    expect(issues.items[0]).not.toHaveProperty("estimated_savings_usd");
    expect(logs).toHaveProperty("next_cursor", null);
    expect(logs.items[0]).toHaveProperty("occurred_at");
    expect(settings).toHaveProperty("rules_enabled");
    expect(settings).toHaveProperty("thresholds.token_bloat_min_context_tokens");
    expect(settings).not.toHaveProperty("rules");
    expect(providers[0]).toHaveProperty("traffic.last_request_at");
    expect(providers[0]).toHaveProperty("pricing.source_url");
    expect(accuracy.datasets.map((dataset: { id: string }) => dataset.id)).toEqual(["synthetic", "real"]);
  });

  it("loads demo data and returns real empty state after clearing", async () => {
    const loaded = await fetch(`${api}/demo/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 42, days: 7 }),
    });
    expect(loaded.status).toBe(200);
    const overview = await fetch(`${api}/overview`).then((response) => response.json());
    expect(overview.has_data).toBe(true);

    await fetch(`${api}/data`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "delete my data" }),
    });
    const emptyOverview = await fetch(`${api}/overview`).then((response) => response.json());
    expect(emptyOverview.has_data).toBe(false);

    await fetch(`${api}/demo/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 42, days: 7 }),
    });
  });
});
