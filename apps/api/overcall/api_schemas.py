from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorDetail(APIModel):
    code: str
    message: str
    request_id: str
    details: dict[str, Any] | None = None


class ErrorResponse(APIModel):
    error: ErrorDetail


class SampleRequest(APIModel):
    request_id: UUID
    occurred_at: datetime
    req_hash: str
    req_size: int
    resp_size: int
    status: int
    cost_usd: Decimal


class IssueResponse(APIModel):
    id: UUID
    rule_id: str
    rule_name: str
    tier: int
    experimental: bool
    provider: str
    endpoint: str
    severity: Literal["critical", "warning", "info"]
    impact_kind: Literal["spend", "reliability"]
    title: str
    summary: str
    explanation: str
    suggested_fix: str
    affected_count: int
    window_savings_usd: Decimal
    projected_monthly_usd: Decimal
    confidence: float | None
    is_demo_data: bool
    detected_at: datetime
    sample_requests: list[SampleRequest] = Field(default_factory=list)


class FlaggedBy(APIModel):
    issue_id: UUID
    rule_id: str
    title: str
    severity: Literal["critical", "warning", "info"]


class LogEntry(APIModel):
    id: UUID
    occurred_at: datetime
    provider: str
    method: str
    endpoint: str
    status: int
    latency_ms: float
    ttfb_ms: float | None
    req_size: int
    resp_size: int
    req_hash: str
    model: str | None
    prompt_tokens: int
    completion_tokens: int
    tokens_estimated: bool
    stream: bool
    cost_usd: Decimal
    cost_basis: str
    pricing_version: str | None
    caller: str | None
    has_idempotency_key: bool
    error_code: str | None
    origin: str
    is_demo: bool
    flagged_by: list[FlaggedBy] = Field(default_factory=list)


class LogList(APIModel):
    items: list[LogEntry]
    next_cursor: str | None


class IssueList(APIModel):
    items: list[IssueResponse]
    next_cursor: str | None


class OverviewWindow(APIModel):
    start: datetime | None
    end: datetime | None
    days: float
    low_confidence_projection: bool


class SpendSavings(APIModel):
    window_usd: Decimal
    projected_monthly_usd: Decimal
    percent_of_spend: float


class ExperimentalSavings(APIModel):
    projected_monthly_usd: Decimal


class ReliabilityFindings(APIModel):
    count: int
    modelled_overhead_monthly_usd: Decimal


class SeverityBreakdown(APIModel):
    critical: int
    warning: int
    info: int


class ProviderSpend(APIModel):
    provider: str
    spend_usd: Decimal
    issue_count: int


class TrendEntry(APIModel):
    date: str
    spend_usd: Decimal
    waste_usd: Decimal


class OverviewResponse(APIModel):
    has_data: bool
    is_demo_data: bool
    generated_at: datetime | None
    run_id: UUID | None
    window: OverviewWindow
    request_count: int
    flagged_request_count: int
    total_spend_usd: Decimal
    spend_savings: SpendSavings
    experimental_spend_savings: ExperimentalSavings
    reliability_findings: ReliabilityFindings
    severity_breakdown: SeverityBreakdown
    by_provider: list[ProviderSpend]
    trend: list[TrendEntry]
    top_issues: list[IssueResponse]


class MeResponse(APIModel):
    id: UUID
    email: str | None
    created_at: datetime
    proxy_status: Literal["no_key", "waiting_for_traffic", "receiving_traffic", "demo_only"]
    last_request_at: datetime | None
    issue_count: int
    is_demo_data: bool
    has_data: bool
    real_upstream_available: bool


class IngestKeyCreate(APIModel):
    name: str = Field(min_length=1, max_length=60)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("name must not be blank")
        return normalized


class IngestKeyCreatedResponse(APIModel):
    id: UUID
    name: str
    prefix: str
    key: str
    created_at: datetime


class IngestKeyListItem(APIModel):
    id: UUID
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class Thresholds(APIModel):
    short_window_s: int = Field(default=10, ge=1, le=300)
    long_window_s: int = Field(default=600, ge=60, le=3600)
    retry_min_backoff_ms: int = Field(default=1000, ge=100, le=10000)
    retry_min_attempts: int = Field(default=3, ge=2, le=10)
    oversized_bytes: int = Field(default=200000, ge=10000, le=5000000)
    unbatched_min_calls: int = Field(default=5, ge=2, le=100)
    unbatched_window_s: int = Field(default=5, ge=1, le=60)
    token_bloat_min_repeats: int = Field(default=3, ge=2, le=50)
    token_bloat_min_context_tokens: int = Field(default=1024, ge=256, le=32000)
    model_overuse_max_prompt_tokens: int = Field(default=800, ge=50, le=8000)
    model_overuse_max_completion_tokens: int = Field(default=300, ge=10, le=4000)
    model_overuse_min_calls: int = Field(default=10, ge=3, le=1000)

    @model_validator(mode="after")
    def validate_window_order(self) -> Thresholds:
        if self.long_window_s <= self.short_window_s:
            raise ValueError("long_window_s must be greater than short_window_s")
        return self

    @property
    def token_bloat_min_prompt_tokens(self) -> int:
        """Compatibility name used by the existing rule implementation."""
        return self.token_bloat_min_context_tokens


RULE_IDS = (
    "duplicate_calls",
    "missing_cache",
    "retry_storm",
    "oversized_payload",
    "unbatched_calls",
    "token_bloat",
    "model_overuse",
)


class SettingsResponse(APIModel):
    currency: Literal["INR", "USD"]
    usd_inr_rate: float
    rules_enabled: dict[str, bool]
    tier3_enabled: bool
    thresholds: Thresholds
    upstream_mode: Literal["mock", "real"]
    confirm_real_upstream: bool = False
    retention_days: int
    updated_at: datetime


class SettingsUpdate(APIModel):
    currency: Literal["INR", "USD"] = "INR"
    usd_inr_rate: float = Field(default=83.5, gt=0)
    rules_enabled: dict[str, bool] = Field(default_factory=lambda: dict.fromkeys(RULE_IDS, True))
    tier3_enabled: bool = False
    thresholds: Thresholds = Field(default_factory=Thresholds)
    upstream_mode: Literal["mock", "real"] = "mock"
    confirm_real_upstream: bool = False
    retention_days: int = Field(default=14, ge=1, le=90)


class SettingsReset(APIModel):
    confirm: bool


class DemoLoad(APIModel):
    seed: int = 42
    days: int = Field(default=7, ge=1, le=30)


class DemoLoadResponse(APIModel):
    inserted: int


class DeleteData(APIModel):
    confirm: str


class DetectionRunResponse(APIModel):
    run_id: UUID
    status: Literal["running", "completed", "failed"]


class DetectionRunSummary(APIModel):
    id: UUID
    status: str
    started_at: datetime
    finished_at: datetime | None
    is_demo_data: bool
    request_count: int
    flagged_request_count: int
    total_spend_usd: Decimal
    spend_savings_window_usd: Decimal
    spend_savings_monthly_usd: Decimal
    experimental_monthly_usd: Decimal
    reliability_count: int
    reliability_overhead_monthly_usd: Decimal


class ProviderSnippet(APIModel):
    id: str
    label: str
    code: str


class ProviderTraffic(APIModel):
    proxy: int
    demo: int
    last_request_at: datetime | None


class PricingRow(APIModel):
    label: str
    usd_per_1m: float


class ProviderPricing(APIModel):
    version: str
    effective_from: datetime
    source_url: str
    rows: list[PricingRow]


class ProviderResponse(APIModel):
    id: Literal["openai", "stripe", "aws"]
    name: str
    status: Literal["waiting", "receiving_traffic", "demo_only", "coming_soon"]
    proxy_base_url: str
    snippets: list[ProviderSnippet]
    traffic: ProviderTraffic
    upstream_mode: Literal["mock", "real", "test"] | None
    pricing: ProviderPricing | None
    notes: str | None


class AccuracyRule(APIModel):
    rule_id: str
    tier: int
    positives: int
    flagged: int
    true_positives: int
    precision: float
    recall: float
    false_positives_on_hard_negatives: int


class AccuracyDataset(APIModel):
    id: Literal["synthetic", "real"]
    label: str
    note: str
    generated_at: datetime | None
    requests: int
    rules: list[AccuracyRule]


class AccuracyResponse(APIModel):
    datasets: list[AccuracyDataset]


class RuleResponse(APIModel):
    id: str
    name: str
    tier: int
    description: str
    experimental: bool


class FacetValue(APIModel):
    value: str
    count: int


class LogFacets(APIModel):
    providers: list[str]
    endpoints: list[FacetValue]
    callers: list[str]
    models: list[str]
