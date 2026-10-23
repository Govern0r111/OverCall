import { delay, http, HttpResponse } from "msw";
import { BACKEND_URL } from "../lib/api";
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

export const handlers = [
  http.get("/api/health", () => HttpResponse.json({ status: "ok" })),
  http.get("/api/overview", () => HttpResponse.json(getOverview())),
  http.get("/api/issues", ({ request }) => {
    const params = new URL(request.url).searchParams;
    return HttpResponse.json(getIssues({
      provider: params.get("provider") ?? undefined,
      severity: params.get("severity") ?? undefined,
      tier: params.get("tier") ?? undefined,
    }));
  }),
  http.get("/api/rules", () => HttpResponse.json(getRules())),
  http.get("/api/settings", () => HttpResponse.json(getSettings())),
  http.put("/api/settings", async ({ request }) => {
    const next = await request.json();
    return HttpResponse.json(saveSettings(next as ReturnType<typeof getSettings>));
  }),
  http.get("/api/providers", () => HttpResponse.json(getProviders())),
  http.get("/api/logs/recent", ({ request }) => {
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
  http.get("/api/synthetic/evaluate", () => HttpResponse.json(getEvaluation())),
  http.post("/api/synthetic/load", async ({ request }) => {
    const body = await request.json() as { seed?: number };
    return HttpResponse.json(loadSynthetic(Number.isSafeInteger(body.seed) ? body.seed! : 42));
  }),
  http.post("/api/detect/run", () => HttpResponse.json(getOverview())),
  http.delete("/api/data", () => HttpResponse.json(clearData())),
];
