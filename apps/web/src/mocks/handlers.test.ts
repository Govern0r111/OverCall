import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import proxyRoutes from "../../../../contract/fixtures/proxy/routes.json";
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

  it("serves setup snippets for each route in the shared proxy fixture", async () => {
    const providers = await fetch(`${api}/providers`).then((response) => response.json());

    for (const [provider, routes] of Object.entries(proxyRoutes)) {
      const snippets = providers.find((item: { id: string }) => item.id === provider)?.snippets ?? [];
      expect(snippets.length).toBeGreaterThan(0);
      expect(snippets.every((snippet: { code: string }) => snippet.code.includes("YOUR_OVERCALL_KEY"))).toBe(true);
      for (const route of routes) {
        expect(snippets.some((snippet: { code: string }) =>
          snippet.code.includes(`/proxy/${provider}/v1${route.path}`),
        )).toBe(true);
      }
    }
  });

  it("returns an ingest key once and never includes its plaintext in the key list", async () => {
    const created = await fetch(`${api}/ingest-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test key" }),
    });
    const secret = await created.json();

    expect(created.status).toBe(201);
    expect(secret.key).toMatch(/^oc_demo_/);

    const list = await fetch(`${api}/ingest-keys`).then((response) => response.json());
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("key");
    expect(JSON.stringify(list)).not.toContain(secret.key);

    const revoked = await fetch(`${api}/ingest-keys/${secret.id}`, { method: "DELETE" });
    expect(revoked.status).toBe(204);
    const listedAfterRevoke = await fetch(`${api}/ingest-keys`).then((response) => response.json());
    expect(listedAfterRevoke[0].revoked_at).toBeTruthy();
  });

  it("filters and paginates request logs with a stable cursor", async () => {
    const first = await fetch(`${api}/logs?limit=1`).then((response) => response.json());
    expect(first.items).toHaveLength(1);
    expect(first.next_cursor).toBeTruthy();

    const second = await fetch(`${api}/logs?limit=1&cursor=${encodeURIComponent(first.next_cursor)}`)
      .then((response) => response.json());
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);

    const matching = await fetch(`${api}/logs?q=embeddings`).then((response) => response.json());
    expect(matching.items.map((log: { endpoint: string }) => log.endpoint)).toEqual(["/v1/embeddings"]);
  });

  it("serves caller, model, provider, and endpoint facets for log filters", async () => {
    const response = await fetch(`${api}/logs/facets`);
    const facets = await response.json();

    expect(response.status).toBe(200);
    expect(facets.providers).toEqual(["openai", "stripe"]);
    expect(facets.endpoints).toContainEqual({ value: "/v1/chat/completions", count: 1 });
    expect(facets.callers).toEqual(["demo-app"]);
    expect(facets.models).toEqual(["gpt-4o-mini"]);
  });

  it("finds a request quickly in the 5,000-row demo scenario", async () => {
    window.history.replaceState({}, "", "?scenario=large");
    const started = performance.now();
    try {
      const response = await fetch(`${api}/logs?q=target-04999&limit=1`);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].endpoint).toBe("/v1/demo/requests/target-04999");
      expect(performance.now() - started).toBeLessThan(3_000);
    } finally {
      window.history.replaceState({}, "", "/");
    }
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
