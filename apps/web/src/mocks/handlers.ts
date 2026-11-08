import { delay, http, HttpResponse } from "msw";
import {
  clearData,
  createIngestKey,
  getEvaluation,
  getIngestKeys,
  getIssues,
  getLogFacets,
  getLogs,
  getOverview,
  getProviders,
  getRules,
  getSettings,
  loadSynthetic,
  revokeIngestKey,
  saveSettings,
} from "./state";
import type { ApiSettingsUpdate } from "../lib/api";
import type { ApiLogFilters } from "./state";

export const handlers = [
  http.get("/healthz", () => HttpResponse.json({ status: "ok" })),
  http.get("/v1/overview", () => HttpResponse.json(getOverview())),
  http.get("/v1/issues", ({ request }) => {
    const params = new URL(request.url).searchParams;
    return HttpResponse.json(getIssues({
      provider: params.get("provider") ?? undefined,
      severity: params.get("severity") ?? undefined,
      tier: params.get("tier") ?? undefined,
    }));
  }),
  http.get("/v1/rules", () => HttpResponse.json(getRules())),
  http.get("/v1/settings", () => HttpResponse.json(getSettings())),
  http.put("/v1/settings", async ({ request }) => {
    const next = await request.json() as ApiSettingsUpdate;
    return HttpResponse.json(saveSettings(next));
  }),
  http.get("/v1/providers", () => HttpResponse.json(getProviders())),
  http.get("/v1/ingest-keys", () => HttpResponse.json(getIngestKeys())),
  http.post("/v1/ingest-keys", async ({ request }) => {
    const body = await request.json() as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 60) {
      return HttpResponse.json({ error: "invalid_name" }, { status: 422 });
    }
    const created = createIngestKey(name);
    if (!created) return HttpResponse.json({ error: "key_limit_reached" }, { status: 409 });
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete("/v1/ingest-keys/:keyId", ({ params }) => {
    revokeIngestKey(String(params.keyId));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/v1/logs/facets", () => {
    const large = import.meta.env.DEV && new URLSearchParams(window.location.search).get("scenario") === "large";
    return HttpResponse.json(getLogFacets(large));
  }),
  http.get("/v1/logs", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get("limit") ?? "25");
    const scenario = new URLSearchParams(window.location.search).get("scenario");
    const large = import.meta.env.DEV && scenario === "large";
    const filters: ApiLogFilters = {
      q: params.get("q") ?? undefined,
      provider: params.get("provider") ?? undefined,
      status_class: params.get("status_class") ?? undefined,
      endpoint: params.get("endpoint") ?? undefined,
      caller: params.get("caller") ?? undefined,
      model: params.get("model") ?? undefined,
      issue_id: params.get("issue_id") ?? undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    };
    const cursor = params.get("cursor") ?? undefined;
    if (import.meta.env.DEV && scenario === "error") {
      return HttpResponse.json({ error: "Demo logs are unavailable in the error scenario." }, { status: 503 });
    }
    if (import.meta.env.DEV && scenario === "slow") {
      return delay(500).then(() => HttpResponse.json(getLogs(filters, Number.isFinite(limit) ? limit : 25, cursor)));
    }
    return HttpResponse.json(getLogs(filters, Number.isFinite(limit) ? limit : 25, cursor, large));
  }),
  http.get("/v1/accuracy", () => HttpResponse.json(getEvaluation())),
  http.post("/v1/demo/load", async ({ request }) => {
    const body = await request.json() as { seed?: number };
    return HttpResponse.json(loadSynthetic(Number.isSafeInteger(body.seed) ? body.seed! : 42));
  }),
  http.post("/v1/detection/run", () => HttpResponse.json({
    run_id: "66666666-6666-4666-8666-666666666666",
    status: "completed",
  })),
  http.delete("/v1/data", async ({ request }) => {
    const body = await request.json() as { confirm?: string };
    if (body.confirm !== "delete my data") {
      return HttpResponse.json({ error: "confirmation_required" }, { status: 400 });
    }
    clearData();
    return new HttpResponse(null, { status: 204 });
  }),
];
