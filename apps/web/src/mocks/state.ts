import type { Issue, LogEntry, Overview, Provider, Rule, Settings } from "../lib/api";

export const demoIssue: Issue = {
  id: "issue-duplicate-requests",
  rule_id: "duplicate_request",
  rule_name: "Repeated identical requests",
  issue_type: "duplicate_request",
  tier: 1,
  experimental: false,
  provider: "openai",
  endpoint: "/v1/chat/completions",
  severity: "warning",
  title: "The same request is sent more than once",
  summary: "Identical requests are repeated within a short window.",
  explanation: "Several requests have the same metadata fingerprint and arrive close together.",
  suggested_fix: "Cache the result for repeated inputs or deduplicate requests before sending them.",
  affected_requests: ["demo-request-1", "demo-request-2"],
  affected_count: 18,
  estimated_savings_usd: 0.42,
  projected_monthly_usd: 1.8,
  confidence: 0.94,
  sample_requests: [{
    id: "demo-request-1",
    timestamp: new Date(Date.now() - 60 * 60_000).toISOString(),
    method: "POST",
    endpoint: "/v1/chat/completions",
    status: 200,
    latency_ms: 842,
    req_size: 1240,
    resp_size: 4380,
    req_hash: "sha256:demo-7f2a",
    cost_usd: 0.014,
    prompt_tokens: 920,
    completion_tokens: 310,
  }],
  detected_at: new Date().toISOString(),
};

const makeLog = (id: string, minutesAgo: number, provider: string, endpoint: string, status: number): LogEntry => ({
  id,
  timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  provider,
  endpoint,
  method: "POST",
  status,
  latency_ms: 240 + minutesAgo * 3,
  req_size: 640,
  resp_size: 910,
  prompt_tokens: provider === "openai" ? 240 : 0,
  completion_tokens: provider === "openai" ? 80 : 0,
  cost_usd: provider === "openai" ? 0.008 : 0.002,
  flagged_by: id === "demo-log-1" ? ["duplicate_request"] : [],
  issue_ids: id === "demo-log-1" ? [demoIssue.id] : [],
  caller: "demo-app",
  model: provider === "openai" ? "gpt-4o-mini" : null,
  req_hash: `sha256:${id}`,
});

const initialLogs = [
  makeLog("demo-log-1", 12, "openai", "/v1/chat/completions", 200),
  makeLog("demo-log-2", 38, "stripe", "/v1/payment_intents", 201),
  makeLog("demo-log-3", 95, "openai", "/v1/embeddings", 429),
];

const initialSettings: Settings = {
  rules: { duplicate_request: true, retry_storm: true, oversized_payload: true },
  experimental_enabled: false,
  windows: {
    short_window_s: 10,
    long_window_s: 300,
    retry_min_backoff_ms: 1000,
    retry_min_attempts: 3,
    oversized_bytes: 100000,
    unbatched_min_calls: 5,
    unbatched_window_s: 60,
    token_bloat_min_repeats: 3,
    token_bloat_min_prompt_tokens: 1000,
    model_overuse_max_prompt_tokens: 2000,
    model_overuse_max_completion_tokens: 500,
  },
  currency: "INR",
  usd_inr_rate: 83.5,
  openai_upstream: "mock",
};

const SETTINGS_STORAGE_KEY = "overcall-mock-settings";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSettings(value: unknown): value is Settings {
  if (!isRecord(value) || !isRecord(value.rules) || !isRecord(value.windows)) return false;
  const windows = Object.values(value.windows);
  return (
    (value.currency === "INR" || value.currency === "USD") &&
    typeof value.usd_inr_rate === "number" &&
    Number.isFinite(value.usd_inr_rate) &&
    value.usd_inr_rate > 0 &&
    typeof value.experimental_enabled === "boolean" &&
    (value.openai_upstream === "mock" || value.openai_upstream === "real") &&
    Object.values(value.rules).every((enabled) => typeof enabled === "boolean") &&
    windows.length > 0 &&
    windows.every((window) => typeof window === "number" && Number.isSafeInteger(window) && window > 0) &&
    Number(value.windows.long_window_s) > Number(value.windows.short_window_s)
  );
}

function readStoredSettings(): Settings {
  try {
    const serialized = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!serialized) return structuredClone(initialSettings);
    const stored: unknown = JSON.parse(serialized);
    if (isSettings(stored)) return stored;
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    console.warn("Stored demo settings were invalid and have been reset.");
  } catch (error) {
    console.warn("Could not restore demo settings; using defaults for this session.", error);
  }
  return structuredClone(initialSettings);
}

const defaultRules: Rule[] = [
  { id: "duplicate_request", name: "Repeated identical requests", tier: 1, description: "Finds repeated requests with matching metadata." },
  { id: "retry_storm", name: "Rapid retries", tier: 2, description: "Finds retries that happen without a useful backoff." },
  { id: "oversized_payload", name: "Large payloads", tier: 2, description: "Finds payloads that may be larger than needed." },
];

const pricing = {
  openai: {
    version: "2026-01-15",
    source: "https://developers.openai.com/api/docs/pricing",
    notes: "Costs are estimates based on the selected model and token counts.",
    models: { "gpt-4o-mini": { input_per_1m: 0.15, cached_input_per_1m: 0.075, output_per_1m: 0.6, tier: "small" } },
  },
  stripe: {
    version: "2026-01-15",
    source: "https://stripe.com/pricing",
    notes: "Stripe does not bill per request. Any overhead shown is modelled, not billed.",
    per_request_usd: 0.0001,
    failed_request_usd: 0,
    money_moving_endpoints: ["/v1/payment_intents"],
  },
  aws: {
    version: "2026-01-15",
    source: "https://aws.amazon.com/pricing/",
    notes: "AWS request forwarding is not available yet.",
    services: {},
  },
};

let settings = readStoredSettings();
let hasData = true;
let logs = [...initialLogs];
let issues = [demoIssue];

export function getSettings() {
  return structuredClone(settings);
}

export function saveSettings(next: Settings) {
  settings = structuredClone(next);
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return getSettings();
}

export function getRules() {
  return structuredClone(defaultRules);
}

export function getIssues(filters: { provider?: string; severity?: string; tier?: string }) {
  return issues.filter((issue) =>
    (!filters.provider || issue.provider === filters.provider) &&
    (!filters.severity || issue.severity === filters.severity) &&
    (!filters.tier || issue.tier === Number(filters.tier)) &&
    (settings.experimental_enabled || !issue.experimental)
  );
}

export function getLogs(provider?: string, limit = 25) {
  return logs.filter((log) => !provider || log.provider === provider).slice(0, Math.min(limit, 200));
}

export function getOverview(): Overview {
  const projected = hasData ? issues.reduce((total, issue) => total + issue.projected_monthly_usd, 0) : 0;
  return {
    has_data: hasData,
    request_count: hasData ? logs.length : 0,
    flagged_request_count: hasData ? issues.reduce((total, issue) => total + issue.affected_count, 0) : 0,
    window_days: 7,
    total_cost_usd: hasData ? 0.084 : 0,
    projected_monthly_cost_usd: hasData ? 3.2 : 0,
    window_savings_usd: hasData ? 0.42 : 0,
    projected_monthly_usd: projected,
    waste_pct: hasData ? 0.15 : 0,
    experimental_projected_monthly_usd: 0,
    issue_counts: hasData ? { critical: 0, warning: issues.length, info: 0 } : { critical: 0, warning: 0, info: 0 },
    sources: hasData ? { openai: 2, stripe: 1 } : {},
    trend: hasData ? Array.from({ length: 7 }, (_, index) => ({
      date: new Date(Date.now() - (6 - index) * 86_400_000).toISOString().slice(0, 10),
      cost_usd: 0.01 + index * 0.002,
      waste_usd: 0.002 + index * 0.0004,
    })) : [],
    top_issues: getIssues({}).slice(0, 5),
    ran_at: new Date().toISOString(),
  };
}

export function getProviders(): Provider[] {
  return (["openai", "stripe", "aws"] as const).map((id) => {
    const proxyCount = logs.filter((log) => log.provider === id).length;
    return {
      id,
      status: id === "aws" ? "stubbed" : hasData ? "demo_only" : "waiting",
      counts: { proxy: 0, demo: hasData ? proxyCount : 0 },
      last_proxy_request_at: null,
      issue_count: issues.filter((issue) => issue.provider === id).length,
      pricing: structuredClone(pricing[id]),
      upstream_mode: id === "openai" ? settings.openai_upstream : id === "stripe" ? "test" : null,
    };
  });
}

export function getEvaluation() {
  return {
    has_data: hasData,
    requests: hasData ? logs.length : 0,
    using_default_windows: true,
    rules: hasData ? [{
      rule_id: demoIssue.rule_id,
      rule_name: demoIssue.rule_name,
      tier: demoIssue.tier,
      ground_truth: 1,
      flagged: 1,
      true_positives: 1,
      precision: 1,
      recall: 1,
    }] : [],
  };
}

export function loadSynthetic(seed: number) {
  hasData = true;
  logs = [...initialLogs];
  issues = [demoIssue];
  return { inserted: 84, seed, days: 7 };
}

export function clearData() {
  logs = [];
  issues = [];
  hasData = false;
  return { deleted: initialLogs.length };
}
