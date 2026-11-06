import { delay, http, HttpResponse } from "msw";
import {
  clearData,
  getEvaluation,
  getIssues,
  getLogs,
  getOverview,
  getProviders,
  getRules,
  getSettings,
  loadSynthetic,
  saveSettings,
} from "./state";
import type { ApiSettingsUpdate } from "../lib/api";

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
  http.get("/v1/logs", ({ request }) => {
    const params = new URL(request.url).searchParams;
    const limit = Number(params.get("limit") ?? "25");
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("scenario") === "error") {
      return HttpResponse.json({ error: "Demo logs are unavailable in the error scenario." }, { status: 503 });
    }
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("scenario") === "slow") {
      return delay(500).then(() => HttpResponse.json(getLogs(params.get("provider") ?? undefined, Number.isFinite(limit) ? limit : 25)));
    }
    return HttpResponse.json(getLogs(params.get("provider") ?? undefined, Number.isFinite(limit) ? limit : 25));
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
