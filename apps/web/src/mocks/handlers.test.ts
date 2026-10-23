import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const api = `${window.location.origin}/api`;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("demo API handlers", () => {
  it("persists settings updates between requests", async () => {
    const original = await fetch(`${api}/settings`).then((response) => response.json());
    const changed = { ...original, currency: "USD" };
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
      body: JSON.stringify(original),
    });
  });

  it("loads demo data and returns real empty state after clearing", async () => {
    const loaded = await fetch(`${api}/synthetic/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 42, days: 7 }),
    });
    expect(loaded.status).toBe(200);
    const overview = await fetch(`${api}/overview`).then((response) => response.json());
    expect(overview.has_data).toBe(true);

    await fetch(`${api}/data`, { method: "DELETE" });
    const emptyOverview = await fetch(`${api}/overview`).then((response) => response.json());
    expect(emptyOverview.has_data).toBe(false);

    await fetch(`${api}/synthetic/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: 42, days: 7 }),
    });
  });
});
