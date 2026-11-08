import type {
  ApiAccuracy,
  ApiIssue,
  ApiIssueList,
  ApiIngestKey,
  ApiIngestKeyCreated,
  ApiLogFacets,
  ApiLogEntry,
  ApiLogList,
  ApiOverview,
  ApiProvider,
  ApiRule,
  ApiSettings,
  ApiSettingsUpdate,
} from "../lib/api";
import proxyRoutes from "../../../../contract/fixtures/proxy/routes.json";

const issueId = "11111111-1111-4111-8111-111111111111";

const demoIssue: ApiIssue = {
  id: issueId,
  rule_id: "duplicate_calls",
  rule_name: "Duplicate calls",
  tier: 1,
  experimental: false,
  provider: "openai",
  endpoint: "/v1/chat/completions",
  severity: "warning",
  impact_kind: "spend",
  title: "The same request is sent more than once",
  summary: "Identical requests are repeated within a short window.",
  explanation: "Several requests have the same metadata fingerprint and arrive close together.",
  suggested_fix: "Cache the result for repeated inputs or deduplicate requests before sending them.",
  affected_count: 18,
  window_savings_usd: "0.0126",
  projected_monthly_usd: "0.054",
  confidence: null,
  is_demo_data: true,
  sample_requests: [{
    request_id: "22222222-2222-4222-8222-222222222222",
    occurred_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    req_hash: "sha256:demo-7f2a",
    req_size: 1240,
    resp_size: 4380,
    status: 200,
    cost_usd: "0.014",
  }],
  detected_at: new Date().toISOString(),
};

const makeLog = (
  id: string,
  minutesAgo: number,
  provider: string,
  endpoint: string,
  status: number,
): ApiLogEntry => ({
  id,
  occurred_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  provider,
  endpoint,
  method: "POST",
  status,
  latency_ms: 240 + minutesAgo * 3,
  ttfb_ms: null,
  req_size: 640,
  resp_size: 910,
  req_hash: `sha256:${id.slice(0, 8)}`,
  model: provider === "openai" ? "gpt-4o-mini" : null,
  prompt_tokens: provider === "openai" ? 240 : 0,
  completion_tokens: provider === "openai" ? 80 : 0,
  tokens_estimated: false,
  stream: false,
  cost_usd: provider === "openai" ? "0.008" : "0.002",
  cost_basis: "estimated",
  pricing_version: "2026-01-15",
  caller: "demo-app",
  has_idempotency_key: false,
  error_code: status >= 400 ? "upstream_error" : null,
  origin: "demo",
  is_demo: true,
  flagged_by: id === "33333333-3333-4333-8333-333333333333"
    ? [{
        issue_id: issueId,
        rule_id: demoIssue.rule_id,
        title: demoIssue.title,
        severity: demoIssue.severity,
      }]
    : [],
});

const initialLogs: ApiLogEntry[] = [
  makeLog("33333333-3333-4333-8333-333333333333", 12, "openai", "/v1/chat/completions", 200),
  makeLog("44444444-4444-4444-8444-444444444444", 38, "stripe", "/v1/payment_intents", 201),
  makeLog("55555555-5555-4555-8555-555555555555", 95, "openai", "/v1/embeddings", 429),
];

let largeDemoLogs: ApiLogEntry[] | null = null;

function getLargeDemoLogs(): ApiLogEntry[] {
  if (!largeDemoLogs) {
    const providers = ["openai", "stripe", "aws"];
    const statuses = [200, 201, 429, 500];
    largeDemoLogs = Array.from({ length: 5_000 }, (_, index) => {
      const id = `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`;
      const endpoint = index === 4_999
        ? "/v1/demo/requests/target-04999"
        : `/v1/demo/requests/${index.toString().padStart(5, "0")}`;
      return makeLog(
        id,
        index,
        providers[index % providers.length],
        endpoint,
        statuses[index % statuses.length],
      );
    });
  }
  return largeDemoLogs;
}

const initialSettings: ApiSettings = {
  currency: "INR",
  usd_inr_rate: 83.5,
  rules_enabled: {
    duplicate_calls: true,
    missing_cache: true,
    retry_storm: true,
    oversized_payload: true,
    unbatched_calls: true,
    token_bloat: true,
    model_overuse: true,
  },
  tier3_enabled: false,
  thresholds: {
    short_window_s: 10,
    long_window_s: 300,
    retry_min_backoff_ms: 1000,
    retry_min_attempts: 3,
    oversized_bytes: 100000,
    unbatched_min_calls: 5,
    unbatched_window_s: 60,
    token_bloat_min_repeats: 3,
    token_bloat_min_context_tokens: 1000,
    model_overuse_max_prompt_tokens: 2000,
    model_overuse_max_completion_tokens: 500,
    model_overuse_min_calls: 10,
  },
  upstream_mode: "mock",
  confirm_real_upstream: false,
  retention_days: 14,
  updated_at: "2026-01-01T00:00:00Z",
};

const SETTINGS_STORAGE_KEY = "overcall-mock-settings";
const defaultRules: ApiRule[] = [
  { id: "duplicate_calls", name: "Duplicate calls", tier: 1, description: "The exact same request repeated after a successful response.", experimental: false },
  { id: "missing_cache", name: "Missing caching", tier: 1, description: "Repeated idempotent requests that could be cached.", experimental: false },
  { id: "retry_storm", name: "Retry storms", tier: 1, description: "Repeated calls after an error without sufficient backoff.", experimental: false },
  { id: "oversized_payload", name: "Oversized payloads", tier: 2, description: "Request or response bodies larger than the configured threshold.", experimental: false },
  { id: "unbatched_calls", name: "Unbatched calls", tier: 2, description: "Bursts of single calls that could use a batch equivalent.", experimental: false },
  { id: "token_bloat", name: "Repeated context resends", tier: 3, description: "Repeated large context blocks in chat requests.", experimental: true },
  { id: "model_overuse", name: "High-cost model for small tasks", tier: 3, description: "Premium models used for short prompts and answers.", experimental: true },
];

const pricing = {
  openai: {
    version: "2026-01-15",
    source_url: "https://developers.openai.com/api/docs/pricing",
    rows: [
      { label: "GPT-4o mini input", usd_per_1m: 0.15 },
      { label: "GPT-4o mini cached input", usd_per_1m: 0.075 },
      { label: "GPT-4o mini output", usd_per_1m: 0.6 },
    ],
  },
  stripe: {
    version: "2026-01-15",
    source_url: "https://stripe.com/pricing",
    rows: [{ label: "Modelled request overhead", usd_per_1m: 0.0001 }],
  },
  aws: {
    version: "2026-01-15",
    source_url: "https://aws.amazon.com/pricing/",
    rows: [],
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSettings(value: unknown): value is ApiSettings {
  if (!isRecord(value) || !isRecord(value.rules_enabled) || !isRecord(value.thresholds)) return false;
  const thresholds = Object.values(value.thresholds);
  return (
    (value.currency === "INR" || value.currency === "USD") &&
    typeof value.usd_inr_rate === "number" &&
    Number.isFinite(value.usd_inr_rate) &&
    value.usd_inr_rate > 0 &&
    typeof value.tier3_enabled === "boolean" &&
    (value.upstream_mode === "mock" || value.upstream_mode === "real") &&
    Object.values(value.rules_enabled).every((enabled) => typeof enabled === "boolean") &&
    thresholds.length > 0 &&
    thresholds.every((threshold) => typeof threshold === "number" && Number.isSafeInteger(threshold) && threshold > 0) &&
    Number(value.thresholds.long_window_s) > Number(value.thresholds.short_window_s) &&
    Number.isInteger(value.retention_days) &&
    typeof value.updated_at === "string"
  );
}

function readStoredSettings(): ApiSettings {
  try {
    const serialized = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!serialized) return structuredClone(initialSettings);
    const stored: unknown = JSON.parse(serialized);
    if (isSettings(stored)) return stored;
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    console.warn("Stored demo settings did not match the versioned API contract and were reset.");
  } catch (error) {
    console.warn("Could not restore demo settings; using defaults for this session.", error);
  }
  return structuredClone(initialSettings);
}

let settings = readStoredSettings();
let hasData = true;
let logs = [...initialLogs];
let issues = [demoIssue];
let ingestKeys: ApiIngestKey[] = [];
let ingestKeySequence = 0;

export function getSettings(): ApiSettings {
  return structuredClone(settings);
}

export function saveSettings(next: ApiSettingsUpdate): ApiSettings {
  settings = { ...structuredClone(next), confirm_real_upstream: false, updated_at: new Date().toISOString() };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return getSettings();
}

export function getRules(): ApiRule[] {
  return structuredClone(defaultRules);
}

export function getIssues(filters: { provider?: string; severity?: string; tier?: string }): ApiIssueList {
  const items = issues.filter((issue) =>
    (!filters.provider || issue.provider === filters.provider) &&
    (!filters.severity || issue.severity === filters.severity) &&
    (!filters.tier || issue.tier === Number(filters.tier)) &&
    (settings.tier3_enabled || !issue.experimental)
  );
  return { items: structuredClone(items), next_cursor: null };
}

export interface ApiLogFilters {
  q?: string;
  provider?: string;
  status_class?: string;
  endpoint?: string;
  caller?: string;
  model?: string;
  issue_id?: string;
  from?: string;
  to?: string;
}

export function getLogs(filters: ApiLogFilters = {}, limit = 25, cursor?: string, large = false): ApiLogList {
  const search = filters.q?.toLowerCase();
  const occurredFrom = filters.from ? new Date(filters.from).getTime() : Number.NEGATIVE_INFINITY;
  const occurredTo = filters.to ? new Date(filters.to).getTime() : Number.POSITIVE_INFINITY;
  const source = large ? getLargeDemoLogs() : logs;
  const matching = source.filter((log) => {
    const time = new Date(log.occurred_at).getTime();
    return (
      (!filters.provider || log.provider === filters.provider) &&
      (!filters.status_class || `${Math.floor(log.status / 100)}xx` === filters.status_class) &&
      (!filters.endpoint || log.endpoint === filters.endpoint) &&
      (!filters.caller || log.caller === filters.caller) &&
      (!filters.model || log.model === filters.model) &&
      (!filters.issue_id || log.flagged_by.some((flag) => flag.issue_id === filters.issue_id)) &&
      (!filters.from || time >= occurredFrom) &&
      (!filters.to || time <= occurredTo) &&
      (!search || [
        log.provider,
        log.method,
        log.endpoint,
        log.caller ?? "",
        log.model ?? "",
      ].some((value) => value.toLowerCase().includes(search)) || Boolean(search && log.req_hash.toLowerCase().startsWith(search)))
    );
  }).sort((a, b) =>
    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime() ||
    b.id.localeCompare(a.id)
  );
  const cursorIndex = cursor ? matching.findIndex((log) => log.id === cursor) : -1;
  const start = cursorIndex < 0 ? 0 : cursorIndex + 1;
  const pageSize = Math.max(1, Math.min(limit, 200));
  const items = matching.slice(start, start + pageSize);
  const hasMore = start + items.length < matching.length;
  return {
    items: structuredClone(items),
    next_cursor: hasMore && items.length ? items[items.length - 1].id : null,
  };
}

export function getLogFacets(large = false): ApiLogFacets {
  const source = large ? getLargeDemoLogs() : logs;
  const unique = (values: Array<string | null>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort().slice(0, 100);
  const counts = new Map<string, number>();
  for (const log of source) counts.set(log.endpoint, (counts.get(log.endpoint) ?? 0) + 1);
  return {
    providers: unique(source.map((log) => log.provider)),
    endpoints: [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, 100),
    callers: unique(source.map((log) => log.caller)),
    models: unique(source.map((log) => log.model)),
  };
}

export function getOverview(): ApiOverview {
  const days = 7;
  return {
    has_data: hasData,
    is_demo_data: hasData,
    generated_at: hasData ? new Date().toISOString() : null,
    run_id: hasData ? "66666666-6666-4666-8666-666666666666" : null,
    window: { start: null, end: null, days, low_confidence_projection: false },
    request_count: hasData ? logs.length : 0,
    flagged_request_count: hasData ? issues.reduce((total, issue) => total + issue.affected_count, 0) : 0,
    total_spend_usd: hasData ? "0.084" : "0",
    spend_savings: {
      window_usd: hasData ? "0.0126" : "0",
      projected_monthly_usd: hasData ? "0.054" : "0",
      percent_of_spend: hasData ? 15 : 0,
    },
    experimental_spend_savings: { projected_monthly_usd: "0" },
    reliability_findings: { count: 0, modelled_overhead_monthly_usd: "0" },
    severity_breakdown: hasData ? { critical: 0, warning: issues.length, info: 0 } : { critical: 0, warning: 0, info: 0 },
    by_provider: hasData ? [
      { provider: "openai", spend_usd: "0.082", issue_count: issues.length },
      { provider: "stripe", spend_usd: "0.002", issue_count: 0 },
    ] : [],
    trend: hasData ? Array.from({ length: days }, (_, index) => ({
      date: new Date(Date.now() - (days - index - 1) * 86_400_000).toISOString().slice(0, 10),
      spend_usd: (0.01 + index * 0.002).toFixed(3),
      waste_usd: (0.002 + index * 0.0004).toFixed(4),
    })) : [],
    top_issues: hasData ? structuredClone(issues.slice(0, 5)) : [],
  };
}

export function getProviders(): ApiProvider[] {
  return (["openai", "stripe", "aws"] as const).map((id) => {
    const proxyCount = logs.filter((log) => log.provider === id && !log.is_demo).length;
    const demoCount = logs.filter((log) => log.provider === id && log.is_demo).length;
    const providerPricing = pricing[id];
    const proxyBaseUrl = `http://localhost:8000/proxy/${id}/v1`;
    return {
      id,
      name: id === "openai" ? "OpenAI" : id === "stripe" ? "Stripe" : "AWS",
      status: id === "aws" ? "coming_soon" : proxyCount ? "receiving_traffic" : hasData ? "demo_only" : "waiting",
      proxy_base_url: proxyBaseUrl,
      snippets: getProviderSnippets(id, proxyBaseUrl),
      traffic: {
        proxy: proxyCount,
        demo: demoCount,
        last_request_at: logs.find((log) => log.provider === id && !log.is_demo)?.occurred_at ?? null,
      },
      upstream_mode: id === "openai" ? settings.upstream_mode : id === "stripe" ? "test" : null,
      pricing: {
        version: providerPricing.version,
        effective_from: "2026-01-15T00:00:00Z",
        source_url: providerPricing.source_url,
        rows: [...providerPricing.rows],
      },
      notes: id === "stripe"
        ? "Stripe does not bill per call. Savings are a modelled overhead."
        : id === "aws"
          ? "AWS request forwarding is not available yet."
          : null,
    };
  });
}

export function getIngestKeys(): ApiIngestKey[] {
  return structuredClone(ingestKeys);
}

export function createIngestKey(name: string): ApiIngestKeyCreated | null {
  if (ingestKeys.filter((key) => key.revoked_at === null).length >= 5) return null;
  ingestKeySequence += 1;
  const key = `oc_demo_${ingestKeySequence.toString().padStart(8, "0")}`;
  const safeKey: ApiIngestKey = {
    id: `00000000-0000-4000-8000-${ingestKeySequence.toString().padStart(12, "0")}`,
    name,
    prefix: key.slice(0, 9),
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
  };
  ingestKeys = [safeKey, ...ingestKeys];
  return { ...safeKey, key };
}

export function revokeIngestKey(id: string): void {
  ingestKeys = ingestKeys.map((key) =>
    key.id === id && key.revoked_at === null
          ? { ...key, revoked_at: new Date().toISOString() }
          : key,
  );
}

export function getEvaluation(): ApiAccuracy {
  return {
    datasets: [
      {
        id: "synthetic",
        label: "Synthetic data (circular)",
        note: "Generated from the same rules, so high scores are expected and are not evidence of real accuracy.",
        generated_at: new Date().toISOString(),
        requests: hasData ? 84 : 0,
        rules: hasData ? [{
          rule_id: "duplicate_calls",
          tier: 1,
          positives: 1,
          flagged: 1,
          true_positives: 1,
          precision: 1,
          recall: 1,
          false_positives_on_hard_negatives: 0,
        }] : [],
      },
      {
        id: "real",
        label: "Real-traffic fixtures (hand-labelled)",
        note: "Not measured yet; real-traffic validation is not part of this dataset.",
        generated_at: null,
        requests: 0,
        rules: [],
      },
    ],
  };
}

export function loadSynthetic(seed: number) {
  void seed;
  hasData = true;
  logs = [...initialLogs];
  issues = [demoIssue];
  return { inserted: 84 };
}

function getProviderSnippets(
  provider: ApiProvider["id"],
  baseUrl: string,
): ApiProvider["snippets"] {
  if (provider === "aws") return [];
  return proxyRoutes[provider].flatMap(({ method, path }) => {
    const url = `${baseUrl}${path}`;
    const overcallKey = "YOUR_OVERCALL_KEY";
    const isStripe = provider === "stripe";
    const curlAuth = isStripe
      ? `-u "$STRIPE_TEST_KEY:"`
      : `-H "Authorization: Bearer $OPENAI_API_KEY"`;
    const pythonAuth = isStripe
      ? `auth=(os.environ["STRIPE_TEST_KEY"], ""), headers={"X-Overcall-Key": "${overcallKey}"}`
      : `headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "X-Overcall-Key": "${overcallKey}"}`;
    const nodeAuth = isStripe
      ? `'Authorization': 'Basic ' + Buffer.from(process.env.STRIPE_TEST_KEY + ':').toString('base64')`
      : `'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY`;
    const curlBody = isStripe
      ? ""
      : ` -H 'Content-Type: application/json' --data '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'`;
    const pythonBody = isStripe
      ? ""
      : `, json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello"}]}`;
    const nodeBody = isStripe
      ? ""
      : `, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello' }] })`;
    return [
      {
        id: "curl",
        label: "cURL",
        code: `curl -X ${method} '${url}' ${curlAuth} -H 'X-Overcall-Key: ${overcallKey}'${curlBody}`,
      },
      {
        id: "python",
        label: "Python",
        code: `import os\nimport requests\n\nrequests.request('${method}', '${url}', ${pythonAuth}${pythonBody})`,
      },
      {
        id: "node",
        label: "Node",
        code: `await fetch('${url}', { method: '${method}', headers: { ${nodeAuth}, 'X-Overcall-Key': '${overcallKey}' }${nodeBody} })`,
      },
    ];
  });
}

export function clearData() {
  logs = [];
  issues = [];
  hasData = false;
}
