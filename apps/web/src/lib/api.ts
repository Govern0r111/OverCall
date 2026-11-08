import axios from "axios";
import type { components } from "../api/schema";
import { authClient, hasDemoSession } from "../auth/authClient";
import { env } from "./env";
import { toast } from "sonner";

export const BACKEND_URL = env.backendUrl;
export const API_BASE_PATH = "/v1";
const backendBase = BACKEND_URL.replace(/\/+$/, "");
export const api = axios.create({
  baseURL: import.meta.env.DEV ? API_BASE_PATH : `${backendBase}${API_BASE_PATH}`,
});
api.interceptors.request.use(async (config) => {
  if (hasDemoSession()) config.baseURL = `${window.location.origin}${API_BASE_PATH}`;
  const token = await authClient.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use((response) => response, async (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && !hasDemoSession()) {
    try {
      sessionStorage.setItem("overcall-session-ended", "1");
      await authClient.logout();
    } catch {
      toast.error("Your session ended. Sign in again to continue.");
    }
  }
  return Promise.reject(error);
});

export const PROXY_URLS = {
  openai: `${backendBase}/proxy/openai/v1`,
  stripe: `${backendBase}/proxy/stripe`,
};

export type Severity = "critical" | "warning" | "info";
export type Currency = "INR" | "USD";

/** JSON representation of Decimal fields returned by the versioned API. */
export type ApiDecimal = string;
export type ApiMe = components["schemas"]["MeResponse"];

export interface ApiSampleRequest {
  request_id: string;
  occurred_at: string;
  req_hash: string;
  req_size: number;
  resp_size: number;
  status: number;
  cost_usd: ApiDecimal;
}

export interface ApiIssue {
  id: string;
  rule_id: string;
  rule_name: string;
  tier: number;
  experimental: boolean;
  provider: string;
  endpoint: string;
  severity: Severity;
  impact_kind: "spend" | "reliability";
  title: string;
  summary: string;
  explanation: string;
  suggested_fix: string;
  affected_count: number;
  window_savings_usd: ApiDecimal;
  projected_monthly_usd: ApiDecimal;
  confidence: number | null;
  is_demo_data: boolean;
  detected_at: string;
  sample_requests: ApiSampleRequest[];
}

export interface ApiIssueList {
  items: ApiIssue[];
  next_cursor: string | null;
}

export interface ApiLogEntry {
  id: string;
  occurred_at: string;
  provider: string;
  method: string;
  endpoint: string;
  status: number;
  latency_ms: number;
  ttfb_ms: number | null;
  req_size: number;
  resp_size: number;
  req_hash: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_estimated: boolean;
  stream: boolean;
  cost_usd: ApiDecimal;
  cost_basis: string;
  pricing_version: string | null;
  caller: string | null;
  has_idempotency_key: boolean;
  error_code: string | null;
  origin: string;
  is_demo: boolean;
  flagged_by: Array<{
    issue_id: string;
    rule_id: string;
    title: string;
    severity: Severity;
  }>;
}

export interface ApiLogList {
  items: ApiLogEntry[];
  next_cursor: string | null;
}

export interface ApiLogFacets {
  providers: string[];
  endpoints: Array<{ value: string; count: number }>;
  callers: string[];
  models: string[];
}

export interface ApiTrendEntry {
  date: string;
  spend_usd: ApiDecimal;
  waste_usd: ApiDecimal;
}

export interface ApiOverview {
  has_data: boolean;
  is_demo_data: boolean;
  generated_at: string | null;
  run_id: string | null;
  window: {
    start: string | null;
    end: string | null;
    days: number;
    low_confidence_projection: boolean;
  };
  request_count: number;
  flagged_request_count: number;
  total_spend_usd: ApiDecimal;
  spend_savings: {
    window_usd: ApiDecimal;
    projected_monthly_usd: ApiDecimal;
    percent_of_spend: number;
  };
  experimental_spend_savings: { projected_monthly_usd: ApiDecimal };
  reliability_findings: {
    count: number;
    modelled_overhead_monthly_usd: ApiDecimal;
  };
  severity_breakdown: Record<Severity, number>;
  by_provider: Array<{ provider: string; spend_usd: ApiDecimal; issue_count: number }>;
  trend: ApiTrendEntry[];
  top_issues: ApiIssue[];
}

export interface ApiThresholds {
  short_window_s: number;
  long_window_s: number;
  retry_min_backoff_ms: number;
  retry_min_attempts: number;
  oversized_bytes: number;
  unbatched_min_calls: number;
  unbatched_window_s: number;
  token_bloat_min_repeats: number;
  token_bloat_min_context_tokens: number;
  model_overuse_max_prompt_tokens: number;
  model_overuse_max_completion_tokens: number;
  model_overuse_min_calls: number;
}

export interface ApiSettings {
  currency: Currency;
  usd_inr_rate: number;
  rules_enabled: Record<string, boolean>;
  tier3_enabled: boolean;
  thresholds: ApiThresholds;
  upstream_mode: "mock" | "real";
  confirm_real_upstream: boolean;
  retention_days: number;
  updated_at: string;
}

export type ApiSettingsUpdate = Omit<ApiSettings, "updated_at">;

export interface ApiRule {
  id: string;
  name: string;
  tier: number;
  description: string;
  experimental: boolean;
}

export interface ApiProvider {
  id: "openai" | "stripe" | "aws";
  name: string;
  status: "waiting" | "receiving_traffic" | "demo_only" | "coming_soon";
  proxy_base_url: string;
  snippets: Array<{ id: string; label: string; code: string }>;
  traffic: { proxy: number; demo: number; last_request_at: string | null };
  upstream_mode: "mock" | "real" | "test" | null;
  pricing: {
    version: string;
    effective_from: string;
    source_url: string;
    rows: Array<{ label: string; usd_per_1m: number }>;
  } | null;
  notes: string | null;
}

export type ApiIngestKey = components["schemas"]["IngestKeyListItem"];
export type ApiIngestKeyCreated = components["schemas"]["IngestKeyCreatedResponse"];

export interface ApiAccuracyRule {
  rule_id: string;
  tier: number;
  positives: number;
  flagged: number;
  true_positives: number;
  precision: number;
  recall: number;
  false_positives_on_hard_negatives: number;
}

export interface ApiAccuracyDataset {
  id: "synthetic" | "real";
  label: string;
  note: string;
  generated_at: string | null;
  requests: number;
  rules: ApiAccuracyRule[];
}

export interface ApiAccuracy {
  datasets: ApiAccuracyDataset[];
}

export interface SampleRequest {
  id: string;
  timestamp: string;
  status: number;
  req_size: number;
  resp_size: number;
  req_hash: string;
  cost_usd: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  provider: string;
  endpoint: string;
  method?: string;
  status: number;
  latency_ms: number;
  ttfb_ms: number | null;
  req_size: number;
  resp_size: number;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_estimated: boolean;
  stream: boolean;
  cost_usd: number;
  cost_basis: string;
  pricing_version: string | null;
  has_idempotency_key: boolean;
  error_code: string | null;
  origin: string;
  is_demo: boolean;
  flagged_by: string[];
  flagged_issues: ApiLogEntry["flagged_by"];
  issue_ids?: string[];
  caller?: string | null;
  model?: string | null;
  req_hash?: string;
}

export interface Issue {
  id: string;
  rule_id: string;
  rule_name: string;
  tier: number;
  experimental: boolean;
  provider: string;
  endpoint: string;
  severity: Severity;
  impact_kind: "spend" | "reliability";
  title: string;
  summary: string;
  explanation: string;
  suggested_fix: string;
  affected_count: number;
  estimated_savings_usd: number;
  projected_monthly_usd: number;
  confidence: number | null;
  is_demo_data: boolean;
  sample_requests: SampleRequest[];
  detected_at: string;
}

export interface TrendPoint {
  date: string;
  cost_usd: number;
  waste_usd: number;
}

export interface Overview {
  has_data: boolean;
  is_demo_data: boolean;
  request_count: number;
  flagged_request_count: number;
  window_days: number;
  total_cost_usd: number;
  projected_monthly_cost_usd: number;
  window_savings_usd: number;
  projected_monthly_usd: number;
  waste_pct: number;
  experimental_projected_monthly_usd: number;
  reliability_count: number;
  reliability_overhead_monthly_usd: number;
  low_confidence_projection: boolean;
  issue_counts: Record<Severity, number>;
  trend: TrendPoint[];
  top_issues: Issue[];
  ran_at: string | null;
}

export interface Windows {
  short_window_s: number;
  long_window_s: number;
  retry_min_backoff_ms: number;
  retry_min_attempts: number;
  oversized_bytes: number;
  unbatched_min_calls: number;
  unbatched_window_s: number;
  token_bloat_min_repeats: number;
  token_bloat_min_context_tokens: number;
  model_overuse_max_prompt_tokens: number;
  model_overuse_max_completion_tokens: number;
  model_overuse_min_calls: number;
}

export interface Settings {
  rules: Record<string, boolean>;
  experimental_enabled: boolean;
  windows: Windows;
  currency: Currency;
  usd_inr_rate: number;
  openai_upstream: "mock" | "real";
  confirm_real_upstream: boolean;
  retention_days: number;
  updated_at: string;
}

export interface Rule {
  id: string;
  name: string;
  tier: number;
  description: string;
  experimental: boolean;
}

export interface Provider {
  id: ApiProvider["id"];
  name: string;
  status: ApiProvider["status"];
  proxy_base_url: string;
  snippets: ApiProvider["snippets"];
  traffic: ApiProvider["traffic"];
  upstream_mode: ApiProvider["upstream_mode"];
  pricing: ApiProvider["pricing"];
  notes: string | null;
}

export type Evaluation = ApiAccuracy;

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const amount = (value: ApiDecimal) => finite(Number(value));

export const fromApiIssue = (issue: ApiIssue): Issue => ({
  id: issue.id,
  rule_id: issue.rule_id,
  rule_name: issue.rule_name,
  tier: issue.tier,
  experimental: issue.experimental,
  provider: issue.provider,
  endpoint: issue.endpoint,
  severity: issue.severity,
  impact_kind: issue.impact_kind,
  title: issue.title,
  summary: issue.summary,
  explanation: issue.explanation,
  suggested_fix: issue.suggested_fix,
  affected_count: issue.affected_count,
  estimated_savings_usd: amount(issue.window_savings_usd),
  projected_monthly_usd: amount(issue.projected_monthly_usd),
  confidence: issue.confidence,
  is_demo_data: issue.is_demo_data,
  sample_requests: issue.sample_requests.map((request) => ({
    id: request.request_id,
    timestamp: request.occurred_at,
    status: request.status,
    req_size: request.req_size,
    resp_size: request.resp_size,
    req_hash: request.req_hash,
    cost_usd: amount(request.cost_usd),
  })),
  detected_at: issue.detected_at,
});

export const fromApiOverview = (overview: ApiOverview): Overview => {
  const days = finite(overview.window.days);
  const monthlySpend = days > 0 ? amount(overview.total_spend_usd) * 30 / days : 0;
  return {
    has_data: overview.has_data,
    is_demo_data: overview.is_demo_data,
    request_count: finite(overview.request_count),
    flagged_request_count: finite(overview.flagged_request_count),
    window_days: days,
    total_cost_usd: amount(overview.total_spend_usd),
    projected_monthly_cost_usd: monthlySpend,
    window_savings_usd: amount(overview.spend_savings.window_usd),
    projected_monthly_usd: amount(overview.spend_savings.projected_monthly_usd),
    waste_pct: finite(overview.spend_savings.percent_of_spend) / 100,
    experimental_projected_monthly_usd: amount(overview.experimental_spend_savings.projected_monthly_usd),
    reliability_count: finite(overview.reliability_findings.count),
    reliability_overhead_monthly_usd: amount(overview.reliability_findings.modelled_overhead_monthly_usd),
    low_confidence_projection: overview.window.low_confidence_projection,
    issue_counts: {
      critical: finite(overview.severity_breakdown.critical),
      warning: finite(overview.severity_breakdown.warning),
      info: finite(overview.severity_breakdown.info),
    },
    trend: overview.trend.map((entry) => ({
      date: entry.date,
      cost_usd: amount(entry.spend_usd),
      waste_usd: amount(entry.waste_usd),
    })),
    top_issues: overview.top_issues.map(fromApiIssue),
    ran_at: overview.generated_at,
  };
};

export const fromApiLog = (log: ApiLogEntry): LogEntry => ({
  id: log.id,
  timestamp: log.occurred_at,
  provider: log.provider,
  endpoint: log.endpoint,
  method: log.method,
  status: log.status,
  latency_ms: log.latency_ms,
  ttfb_ms: log.ttfb_ms,
  req_size: log.req_size,
  resp_size: log.resp_size,
  prompt_tokens: log.prompt_tokens,
  completion_tokens: log.completion_tokens,
  tokens_estimated: log.tokens_estimated,
  stream: log.stream,
  cost_usd: amount(log.cost_usd),
  cost_basis: log.cost_basis,
  pricing_version: log.pricing_version,
  has_idempotency_key: log.has_idempotency_key,
  error_code: log.error_code,
  origin: log.origin,
  is_demo: log.is_demo,
  flagged_by: log.flagged_by.map((flag) => flag.rule_id),
  flagged_issues: log.flagged_by,
  issue_ids: log.flagged_by.map((flag) => flag.issue_id),
  caller: log.caller,
  model: log.model,
  req_hash: log.req_hash,
});

export const fromApiSettings = (settings: ApiSettings): Settings => ({
  rules: settings.rules_enabled,
  experimental_enabled: settings.tier3_enabled,
  windows: settings.thresholds,
  currency: settings.currency,
  usd_inr_rate: settings.usd_inr_rate,
  openai_upstream: settings.upstream_mode,
  confirm_real_upstream: settings.confirm_real_upstream,
  retention_days: settings.retention_days,
  updated_at: settings.updated_at,
});

export const toApiSettingsUpdate = (settings: Settings): ApiSettingsUpdate => ({
  currency: settings.currency,
  usd_inr_rate: settings.usd_inr_rate,
  rules_enabled: settings.rules,
  tier3_enabled: settings.experimental_enabled,
  thresholds: settings.windows,
  upstream_mode: settings.openai_upstream,
  confirm_real_upstream: settings.confirm_real_upstream,
  retention_days: settings.retention_days,
});

export const fromApiProvider = (provider: ApiProvider): Provider => provider;
