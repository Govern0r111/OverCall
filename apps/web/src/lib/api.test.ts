import { describe, expect, it } from "vitest";
import {
  API_BASE_PATH,
  fromApiLog,
  fromApiOverview,
  fromApiSettings,
  PROXY_URLS,
  toApiSettingsUpdate,
  api,
} from "./api";
import type { ApiIssue, ApiLogEntry, ApiOverview, ApiSettings } from "./api";
import { env } from "./env";
import overviewDemo from "../../../../contract/fixtures/api/overview.demo.json";
import overviewLive from "../../../../contract/fixtures/api/overview.live.json";

describe("backend URL contract", () => {
  it("uses the versioned API base path", () => {
    expect(API_BASE_PATH).toBe("/v1");
    expect(api.defaults.baseURL?.replace(/\/+$/, "").endsWith(API_BASE_PATH)).toBe(true);
  });

  it("builds proxy URLs from the mounted backend routes", () => {
    const backendBase = env.backendUrl.replace(/\/+$/, "");
    expect(PROXY_URLS.openai).toBe(`${backendBase}/proxy/openai/v1`);
    expect(PROXY_URLS.stripe).toBe(`${backendBase}/proxy/stripe`);
    expect(Object.values(PROXY_URLS).every((url) => !url.includes("/api/"))).toBe(true);
  });

  it("maps versioned overview and issue DTOs into the dashboard view model", () => {
    const issue: ApiIssue = {
      id: "11111111-1111-4111-8111-111111111111",
      rule_id: "duplicate_calls",
      rule_name: "Duplicate calls",
      tier: 1,
      experimental: false,
      provider: "openai",
      endpoint: "/v1/chat/completions",
      severity: "warning",
      impact_kind: "spend",
      title: "Repeated call",
      summary: "Repeated request.",
      explanation: "Matching request metadata was seen.",
      suggested_fix: "Cache the result.",
      affected_count: 2,
      window_savings_usd: "0.12",
      projected_monthly_usd: "0.48",
      confidence: null,
      is_demo_data: true,
      detected_at: "2026-11-06T12:00:00Z",
      sample_requests: [{
        request_id: "22222222-2222-4222-8222-222222222222",
        occurred_at: "2026-11-06T11:00:00Z",
        req_hash: "sha256:abc",
        req_size: 100,
        resp_size: 200,
        status: 200,
        cost_usd: "0.02",
      }],
    };
    const overview: ApiOverview = {
      has_data: true,
      is_demo_data: true,
      generated_at: "2026-11-06T12:00:00Z",
      run_id: "33333333-3333-4333-8333-333333333333",
      window: { start: null, end: null, days: 7, low_confidence_projection: false },
      request_count: 2,
      flagged_request_count: 1,
      total_spend_usd: "1.4",
      spend_savings: { window_usd: "0.12", projected_monthly_usd: "0.48", percent_of_spend: 12.5 },
      experimental_spend_savings: { projected_monthly_usd: "0.1" },
      reliability_findings: { count: 0, modelled_overhead_monthly_usd: "0" },
      severity_breakdown: { critical: 0, warning: 1, info: 0 },
      by_provider: [{ provider: "openai", spend_usd: "1.4", issue_count: 1 }],
      trend: [{ date: "2026-11-06", spend_usd: "1.4", waste_usd: "0.12" }],
      top_issues: [issue],
    };

    const mapped = fromApiOverview(overview);
    expect(mapped.projected_monthly_cost_usd).toBe(6);
    expect(mapped.waste_pct).toBe(0.125);
    expect(mapped.trend[0]).toEqual({ date: "2026-11-06", cost_usd: 1.4, waste_usd: 0.12 });
    expect(mapped.top_issues[0]).toMatchObject({
      estimated_savings_usd: 0.12,
      is_demo_data: true,
      sample_requests: [{ id: issue.sample_requests[0].request_id, cost_usd: 0.02 }],
    });

  });

  it.each([
    ["demo", overviewDemo, 13.9, 5, 0.92],
    ["live", overviewLive, 32.14, 3, 0.42],
  ] as const)(
    "keeps %s spend savings and reliability figures separate",
    (_label, fixture, spendSavings, reliabilityCount, modelledOverhead) => {
      const mapped = fromApiOverview(fixture);

      expect(mapped.projected_monthly_usd).toBe(spendSavings);
      expect(mapped.reliability_count).toBe(reliabilityCount);
      expect(mapped.reliability_overhead_monthly_usd).toBe(modelledOverhead);
      expect(mapped.low_confidence_projection).toBe(fixture.window.low_confidence_projection);
    },
  );

  it("normalizes invalid overview amounts before they reach the dashboard", () => {
    const malformed = JSON.parse(JSON.stringify(overviewDemo)) as ApiOverview;
    malformed.total_spend_usd = "NaN";
    malformed.spend_savings.projected_monthly_usd = "NaN";
    malformed.spend_savings.percent_of_spend = Number.NaN;
    Reflect.set(malformed.reliability_findings, "count", Number.NaN);
    Reflect.set(malformed.reliability_findings, "modelled_overhead_monthly_usd", null);

    const mapped = fromApiOverview(malformed);

    expect(mapped.total_cost_usd).toBe(0);
    expect(mapped.projected_monthly_cost_usd).toBe(0);
    expect(mapped.projected_monthly_usd).toBe(0);
    expect(mapped.waste_pct).toBe(0);
    expect(mapped.reliability_count).toBe(0);
    expect(mapped.reliability_overhead_monthly_usd).toBe(0);
  });

  it("maps versioned log and settings DTOs without dropping backend settings", () => {
    const log: ApiLogEntry = {
      id: "44444444-4444-4444-8444-444444444444",
      occurred_at: "2026-11-06T11:00:00Z",
      provider: "openai",
      method: "POST",
      endpoint: "/v1/chat/completions",
      status: 200,
      latency_ms: 20,
      ttfb_ms: null,
      req_size: 10,
      resp_size: 20,
      req_hash: "sha256:def",
      model: "gpt-4o-mini",
      prompt_tokens: 2,
      completion_tokens: 3,
      tokens_estimated: false,
      stream: false,
      cost_usd: "0.03",
      cost_basis: "estimated",
      pricing_version: "2026-01-15",
      caller: null,
      has_idempotency_key: false,
      error_code: null,
      origin: "demo",
      is_demo: true,
      flagged_by: [{
        issue_id: "11111111-1111-4111-8111-111111111111",
        rule_id: "duplicate_calls",
        title: "Repeated call",
        severity: "warning",
      }],
    };
    const thresholds = {
      short_window_s: 10,
      long_window_s: 600,
      retry_min_backoff_ms: 1000,
      retry_min_attempts: 3,
      oversized_bytes: 200000,
      unbatched_min_calls: 5,
      unbatched_window_s: 5,
      token_bloat_min_repeats: 3,
      token_bloat_min_context_tokens: 1024,
      model_overuse_max_prompt_tokens: 800,
      model_overuse_max_completion_tokens: 300,
      model_overuse_min_calls: 10,
    };
    const settings: ApiSettings = {
      currency: "USD",
      usd_inr_rate: 83.5,
      rules_enabled: { duplicate_calls: true },
      tier3_enabled: true,
      thresholds,
      upstream_mode: "mock",
      confirm_real_upstream: false,
      retention_days: 14,
      updated_at: "2026-11-06T12:00:00Z",
    };

    expect(fromApiLog(log)).toMatchObject({
      timestamp: log.occurred_at,
      cost_usd: 0.03,
      flagged_by: ["duplicate_calls"],
      issue_ids: [log.flagged_by[0].issue_id],
    });
    const mappedSettings = fromApiSettings(settings);
    expect(mappedSettings.windows).toEqual(thresholds);
    expect(toApiSettingsUpdate(mappedSettings)).toEqual({
      currency: "USD",
      usd_inr_rate: 83.5,
      rules_enabled: settings.rules_enabled,
      tier3_enabled: true,
      thresholds,
      upstream_mode: "mock",
      confirm_real_upstream: false,
      retention_days: 14,
    });
  });
});
