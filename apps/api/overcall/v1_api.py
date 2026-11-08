# FastAPI reads Depends/Query defaults as dependency metadata.
# ruff: noqa: B008

from __future__ import annotations

import json
import secrets
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal, NoReturn
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .api_schemas import (
    RULE_IDS,
    AccuracyRule,
    DeleteData,
    DemoLoad,
    DetectionRunResponse,
    DetectionRunSummary,
    ErrorResponse,
    FacetValue,
    IngestKeyCreate,
    IngestKeyCreatedResponse,
    IngestKeyListItem,
    IssueList,
    IssueResponse,
    LogEntry,
    LogFacets,
    LogList,
    MeResponse,
    OverviewResponse,
    PricingRow,
    ProviderPricing,
    ProviderResponse,
    RuleResponse,
    SettingsReset,
    SettingsResponse,
    SettingsUpdate,
    Thresholds,
)
from .auth.ingest_keys import CURRENT_INGEST_KEY_VERSION, hash_ingest_key
from .config import Settings
from .db.models import (
    DetectionRun,
    IngestKey,
    Issue,
    IssueRequest,
    RequestLog,
    UserSettings,
)
from .db.repos import (
    DetectionRunRepository,
    IngestKeyRepository,
    IssueRepository,
    RequestLogRepository,
    UserSettingsRepository,
)
from .deps import UserContext, get_current_user, get_db_session
from .errors import OvercallError
from .models import RequestLog as LegacyLog
from .pagination import (
    decode_cursor,
    decode_issue_cursor,
    encode_cursor,
    encode_issue_cursor,
)
from .pricing import DEFAULT_PRICING_BOOK
from .rules import RULES
from .rules.base import RuleContext
from .synthetic.truth import GroundTruth

router = APIRouter(prefix="/v1", dependencies=[Depends(get_current_user)])
_ROOT = Path(__file__).resolve().parents[3]
_RULE_NAMES = {rule.id: rule.name for rule in RULES}
_DEFAULT_THRESHOLDS = Thresholds()
_DEFAULT_RULES = dict.fromkeys(RULE_IDS, True)


async def _settings(session: AsyncSession, user_id: UUID) -> UserSettings:
    return await UserSettingsRepository(session, user_id).get_or_create()


def _settings_response(
    row: UserSettings, *, confirm_real_upstream: bool = False
) -> SettingsResponse:
    thresholds = Thresholds.model_validate(row.thresholds or {})
    rules = {rule_id: True for rule_id in RULE_IDS}
    rules.update(row.rules_enabled or {})
    return SettingsResponse(
        currency=row.currency,
        usd_inr_rate=float(row.usd_inr_rate),
        rules_enabled=rules,
        tier3_enabled=row.tier3_enabled,
        thresholds=thresholds,
        upstream_mode=row.upstream_mode,
        confirm_real_upstream=confirm_real_upstream,
        retention_days=row.retention_days,
        updated_at=row.updated_at,
    )


def _to_legacy_log(row: RequestLog) -> LegacyLog:
    return LegacyLog(
        id=str(row.id),
        timestamp=row.occurred_at,
        provider=row.provider,
        endpoint=row.endpoint,
        method=row.method,
        req_size=row.req_size,
        req_hash=row.req_hash,
        status=row.status,
        resp_size=row.resp_size,
        latency_ms=row.latency_ms,
        cost_usd=float(row.cost_usd),
        cost_basis=row.cost_basis,
        pricing_version=row.pricing_version,
        source=row.source,
        origin=row.origin,
        caller=row.caller,
        model=row.model,
        prompt_tokens=row.prompt_tokens,
        completion_tokens=row.completion_tokens,
        cached_prompt_tokens=row.cached_prompt_tokens,
        tokens_estimated=row.tokens_estimated,
        stream=row.stream,
        context_hash=row.context_hash,
        context_tokens=row.context_tokens,
        uses_tools=row.uses_tools,
        list_limit=row.list_limit,
        items_returned=row.items_returned,
        has_idempotency_key=row.has_idempotency_key,
        error_code=row.error_code,
    )


def _window_days(logs: list[LegacyLog]) -> float:
    if not logs:
        return 1.0
    return max(1.0, (logs[-1].timestamp - logs[0].timestamp).total_seconds() / 86400)


def _synthetic_accuracy(
    logs: list[LegacyLog], truth: GroundTruth
) -> list[AccuracyRule]:
    context = RuleContext(w=_DEFAULT_THRESHOLDS, window_days=_window_days(logs))
    results = []
    for rule in RULES:
        flagged: set[str] = set()
        for finding in rule.detect(logs, context):
            flagged.update(finding.waste_by_request)
        positives = truth.request_ids(rule.id)
        hard_negatives = truth.request_ids(rule.id, "hard_negative")
        true_positives = len(flagged & positives)
        results.append(
            AccuracyRule(
                rule_id=rule.id,
                tier=rule.tier,
                positives=len(positives),
                flagged=len(flagged),
                true_positives=true_positives,
                precision=(
                    true_positives / len(flagged)
                    if flagged
                    else (1.0 if not positives else 0.0)
                ),
                recall=true_positives / len(positives) if positives else 1.0,
                false_positives_on_hard_negatives=len(flagged & hard_negatives),
            )
        )
    return results


def _rule_enabled_for_detection(rule: Any, settings: UserSettings) -> bool:
    return (settings.rules_enabled or {}).get(rule.id, True) and (
        rule.tier != 3 or settings.tier3_enabled
    )


def _api_detection_status(status: str) -> Literal["running", "completed", "failed"]:
    if status == "running":
        return "running"
    if status == "succeeded":
        return "completed"
    if status == "failed":
        return "failed"
    raise ValueError(f"Unexpected persisted detection run status: {status}")


@dataclass(slots=True)
class _FindingTotals:
    spend_by_request: dict[str, float]
    experimental_by_request: dict[str, float]
    reliability_overhead_by_request: dict[str, float]
    reliability_count: int


def _aggregate_finding_totals(findings: list[tuple[Any, Any]]) -> _FindingTotals:
    spend_by_request: dict[str, float] = {}
    experimental_by_request: dict[str, float] = {}
    reliability_overhead_by_request: dict[str, float] = {}
    reliability_count = 0

    for rule, finding in findings:
        if finding.impact_kind == "reliability":
            target = reliability_overhead_by_request
            reliability_count += 1
        elif rule.tier == 3:
            target = experimental_by_request
        else:
            target = spend_by_request
        for request_id, waste in finding.waste_by_request.items():
            target[request_id] = max(target.get(request_id, 0.0), waste)

    return _FindingTotals(
        spend_by_request=spend_by_request,
        experimental_by_request=experimental_by_request,
        reliability_overhead_by_request=reliability_overhead_by_request,
        reliability_count=reliability_count,
    )


async def _perform_detection(
    session: AsyncSession,
    user_id: UUID,
    run_id: UUID | None = None,
) -> DetectionRun:
    now = datetime.now(UTC)
    run_id = run_id or uuid4()
    run_repo = DetectionRunRepository(session, user_id)
    issue_repo = IssueRepository(session, user_id)
    log_repo = RequestLogRepository(session, user_id)
    run = await run_repo.get(run_id)
    if run is None:
        run = DetectionRun(
            id=run_id,
            user_id=user_id,
            status="running",
            started_at=now,
            is_demo_data=False,
        )
        session.add(run)
        await session.flush()

    settings = await _settings(session, user_id)
    thresholds = Thresholds.model_validate(settings.thresholds or {})
    rows = await log_repo.list_window(
        now - timedelta(days=30),
        now,
        source="proxy",
        limit=200_000,
    )
    logs = [_to_legacy_log(row) for row in rows]
    days = _window_days(logs)
    run.is_demo_data = bool(rows) and all(row.source == "demo" for row in rows)
    run.window_start = rows[0].occurred_at if rows else None
    run.window_end = rows[-1].occurred_at if rows else None
    run.window_days = Decimal(str(round(days, 3)))
    run.request_count = len(rows)
    run.total_spend_usd = sum((row.cost_usd for row in rows), Decimal("0"))

    context = RuleContext(w=thresholds, window_days=days)
    findings: list[tuple[Any, Any]] = []
    for rule in RULES:
        if not _rule_enabled_for_detection(rule, settings):
            continue
        findings.extend((rule, finding) for finding in rule.detect(logs, context))

    totals = _aggregate_finding_totals(findings)
    await issue_repo.delete_for_source("proxy")
    severity_counts = {"critical": 0, "warning": 0, "info": 0}
    for rule, finding in findings:
        issue_id = uuid4()
        issue = Issue(
            id=issue_id,
            user_id=user_id,
            run_id=run_id,
            rule_id=rule.id,
            tier=rule.tier,
            experimental=rule.tier == 3,
            provider=finding.provider,
            endpoint=finding.endpoint,
            severity=finding.severity,
            impact_kind=finding.impact_kind,
            title=finding.title,
            summary=finding.summary,
            explanation=finding.explanation,
            suggested_fix=finding.suggested_fix,
            affected_count=len(finding.affected),
            window_savings_usd=Decimal(str(round(finding.estimated_savings, 6))),
            projected_monthly_usd=Decimal(
                str(round(context.monthly(finding.estimated_savings), 6))
            ),
            confidence=finding.confidence if rule.tier == 3 else None,
            is_demo_data=run.is_demo_data,
            detected_at=now,
        )
        session.add(issue)
        severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
        for legacy_log in finding.affected:
            try:
                request_id = UUID(legacy_log.id)
            except ValueError:
                continue
            waste = float(finding.waste_by_request.get(legacy_log.id, 0.0))
            session.add(
                IssueRequest(
                    issue_id=issue_id,
                    request_id=request_id,
                    user_id=user_id,
                    waste_usd=Decimal(str(waste)),
                )
            )

    by_day: dict[str, dict[str, float]] = defaultdict(lambda: {"spend_usd": 0.0, "waste_usd": 0.0})
    log_by_id = {str(row.id): row for row in rows}
    for row in rows:
        by_day[row.occurred_at.date().isoformat()]["spend_usd"] += float(row.cost_usd)
    for request_id, waste in totals.spend_by_request.items():
        row = log_by_id.get(request_id)
        if row is not None:
            by_day[row.occurred_at.date().isoformat()]["waste_usd"] += waste

    run.flagged_request_count = len(totals.spend_by_request)
    run.spend_savings_window_usd = Decimal(str(round(sum(totals.spend_by_request.values()), 6)))
    run.spend_savings_monthly_usd = Decimal(
        str(round(sum(totals.spend_by_request.values()) * 30 / days, 6))
    )
    run.experimental_monthly_usd = Decimal(
        str(round(sum(totals.experimental_by_request.values()) * 30 / days, 6))
    )
    run.reliability_count = totals.reliability_count
    run.reliability_overhead_monthly_usd = Decimal(
        str(round(sum(totals.reliability_overhead_by_request.values()) * 30 / days, 6))
    )
    run.issue_counts = severity_counts
    run.trend = [{"date": date, **values} for date, values in sorted(by_day.items())]
    run.projection_low_confidence = len(rows) < 10
    run.status = "succeeded"
    run.finished_at = datetime.now(UTC)
    run.duration_ms = max(0, int((run.finished_at - run.started_at).total_seconds() * 1000))
    await session.commit()
    return run


async def _background_detection(engine: Any, user_id: UUID, run_id: UUID) -> None:
    from sqlalchemy.ext.asyncio import AsyncSession

    async with AsyncSession(engine, expire_on_commit=False) as session:
        try:
            await _perform_detection(session, user_id, run_id)
        except Exception:
            await session.rollback()
            failed_run = await DetectionRunRepository(session, user_id).get(run_id)
            if failed_run is not None:
                failed_run.status = "failed"
                failed_run.finished_at = datetime.now(UTC)
                await session.commit()
            raise


async def _schedule_detection(
    session: AsyncSession,
    user_id: UUID,
    background_tasks: BackgroundTasks | None = None,
) -> DetectionRun | None:
    repo = RequestLogRepository(session, user_id)
    if await repo.count(source="proxy") <= 20_000:
        return await _perform_detection(session, user_id)
    now = datetime.now(UTC)
    run = DetectionRun(
        user_id=user_id,
        status="running",
        started_at=now,
        is_demo_data=False,
    )
    session.add(run)
    await session.commit()
    if background_tasks is not None:
        await session.refresh(run)
        engine = getattr(session, "bind", None)
        if engine is not None:
            background_tasks.add_task(_background_detection, engine, user_id, run.id)
    return run


def _cursor_param(cursor: str | None) -> tuple[datetime, UUID] | None:
    return decode_cursor(cursor) if cursor else None


async def _issue_response(session: AsyncSession, user_id: UUID, issue: Issue) -> IssueResponse:
    result = await session.execute(
        select(RequestLog)
        .join(IssueRequest, IssueRequest.request_id == RequestLog.id)
        .where(
            IssueRequest.user_id == user_id,
            IssueRequest.issue_id == issue.id,
            RequestLog.user_id == user_id,
            RequestLog.source == "proxy",
        )
        .order_by(RequestLog.occurred_at.desc(), RequestLog.id.desc())
        .limit(5)
    )
    samples = [
        {
            "request_id": log.id,
            "occurred_at": log.occurred_at,
            "req_hash": log.req_hash,
            "req_size": log.req_size,
            "resp_size": log.resp_size,
            "status": log.status,
            "cost_usd": log.cost_usd,
        }
        for log in result.scalars().all()
    ]
    return IssueResponse(
        id=issue.id,
        rule_id=issue.rule_id,
        rule_name=_RULE_NAMES.get(issue.rule_id, issue.rule_id),
        tier=issue.tier,
        experimental=issue.experimental,
        provider=issue.provider,
        endpoint=issue.endpoint,
        severity=issue.severity,
        impact_kind=issue.impact_kind,
        title=issue.title,
        summary=issue.summary,
        explanation=issue.explanation,
        suggested_fix=issue.suggested_fix,
        affected_count=issue.affected_count,
        window_savings_usd=issue.window_savings_usd,
        projected_monthly_usd=issue.projected_monthly_usd,
        confidence=issue.confidence,
        is_demo_data=issue.is_demo_data,
        detected_at=issue.detected_at,
        sample_requests=samples,
    )


async def _log_response(session: AsyncSession, user_id: UUID, log: RequestLog) -> LogEntry:
    result = await session.execute(
        select(Issue)
        .join(IssueRequest, IssueRequest.issue_id == Issue.id)
        .where(
            IssueRequest.request_id == log.id,
            IssueRequest.user_id == user_id,
            Issue.user_id == user_id,
            Issue.is_demo_data.is_(False),
        )
        .order_by(Issue.severity, Issue.id)
    )
    flagged_by = [
        {
            "issue_id": issue.id,
            "rule_id": issue.rule_id,
            "title": issue.title,
            "severity": issue.severity,
        }
        for issue in result.scalars().all()
    ]
    return LogEntry(
        id=log.id,
        occurred_at=log.occurred_at,
        provider=log.provider,
        method=log.method,
        endpoint=log.endpoint,
        status=log.status,
        latency_ms=log.latency_ms,
        ttfb_ms=log.ttfb_ms,
        req_size=log.req_size,
        resp_size=log.resp_size,
        req_hash=log.req_hash,
        model=log.model,
        prompt_tokens=log.prompt_tokens,
        completion_tokens=log.completion_tokens,
        tokens_estimated=log.tokens_estimated,
        stream=log.stream,
        cost_usd=log.cost_usd,
        cost_basis=log.cost_basis,
        pricing_version=log.pricing_version,
        caller=log.caller,
        has_idempotency_key=log.has_idempotency_key,
        error_code=log.error_code,
        origin=log.origin,
        is_demo=log.source == "demo",
        flagged_by=flagged_by,
    )


def _run_summary(run: DetectionRun) -> DetectionRunSummary:
    return DetectionRunSummary(
        id=run.id,
        status=_api_detection_status(run.status),
        started_at=run.started_at,
        finished_at=run.finished_at,
        is_demo_data=run.is_demo_data,
        request_count=run.request_count,
        flagged_request_count=run.flagged_request_count,
        total_spend_usd=run.total_spend_usd,
        spend_savings_window_usd=run.spend_savings_window_usd,
        spend_savings_monthly_usd=run.spend_savings_monthly_usd,
        experimental_monthly_usd=run.experimental_monthly_usd,
        reliability_count=run.reliability_count,
        reliability_overhead_monthly_usd=run.reliability_overhead_monthly_usd,
    )


@router.get("/me", response_model=MeResponse)
async def get_me(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> MeResponse:
    logs = RequestLogRepository(session, user.user_id)
    settings = await _settings(session, user.user_id)
    await session.commit()
    proxy_count = await logs.count(source="proxy")
    latest = await logs.list_logs(limit=1, source="proxy")
    issue_count_result = await session.execute(
        select(func.count())
        .select_from(Issue)
        .where(Issue.user_id == user.user_id, Issue.is_demo_data.is_(False))
    )
    issue_count = int(issue_count_result.scalar_one())
    key_count_result = await session.execute(
        select(func.count())
        .select_from(IngestKey)
        .where(IngestKey.user_id == user.user_id, IngestKey.revoked_at.is_(None))
    )
    key_count = int(key_count_result.scalar_one())
    if proxy_count:
        proxy_status = "receiving_traffic"
    elif key_count:
        proxy_status = "waiting_for_traffic"
    else:
        proxy_status = "no_key"
    app_settings = getattr(session, "info", {}).get("app_settings")
    return MeResponse(
        id=user.user_id,
        email=user.email,
        created_at=settings.created_at,
        proxy_status=proxy_status,
        last_request_at=latest[0].occurred_at if latest else None,
        issue_count=issue_count,
        is_demo_data=False,
        has_data=bool(proxy_count),
        real_upstream_available=bool(app_settings and app_settings.allow_real_upstream),
    )


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> OverviewResponse:
    run = await DetectionRunRepository(session, user.user_id).latest(is_demo_data=False)
    if run is None:
        return OverviewResponse(
            has_data=False,
            is_demo_data=False,
            generated_at=None,
            run_id=None,
            window=dict(start=None, end=None, days=1, low_confidence_projection=False),
            request_count=0,
            flagged_request_count=0,
            total_spend_usd=0,
            spend_savings=dict(window_usd=0, projected_monthly_usd=0, percent_of_spend=0),
            experimental_spend_savings=dict(projected_monthly_usd=0),
            reliability_findings=dict(count=0, modelled_overhead_monthly_usd=0),
            severity_breakdown=dict(critical=0, warning=0, info=0),
            by_provider=[],
            trend=[],
            top_issues=[],
        )
    issue_repo = IssueRepository(session, user.user_id)
    issues = await issue_repo.list_for_run(run.id, is_demo_data=False)
    issues.sort(
        key=lambda item: (
            {"critical": 0, "warning": 1, "info": 2}.get(item.severity, 3),
            0 if item.impact_kind == "spend" else 1,
            -float(item.projected_monthly_usd),
            str(item.id),
        )
    )
    start = run.window_start or run.started_at - timedelta(days=1)
    end = run.window_end or run.started_at
    logs = await RequestLogRepository(session, user.user_id).list_window(
        start, end, source="proxy", limit=200_000
    )
    by_provider: dict[str, dict[str, Any]] = {}
    for log in logs:
        provider = by_provider.setdefault(
            log.provider, {"provider": log.provider, "spend_usd": Decimal("0"), "issue_count": 0}
        )
        provider["spend_usd"] += log.cost_usd
    for issue in issues:
        if issue.impact_kind == "spend":
            by_provider.setdefault(
                issue.provider,
                {"provider": issue.provider, "spend_usd": Decimal("0"), "issue_count": 0},
            )["issue_count"] += 1
    total = run.total_spend_usd
    percentage = float(run.spend_savings_window_usd / total * Decimal("100")) if total else 0.0
    return OverviewResponse(
        has_data=run.request_count > 0,
        is_demo_data=run.is_demo_data,
        generated_at=run.finished_at or run.started_at,
        run_id=run.id,
        window=dict(
            start=run.window_start,
            end=run.window_end,
            days=float(run.window_days or 1),
            low_confidence_projection=run.projection_low_confidence,
        ),
        request_count=run.request_count,
        flagged_request_count=run.flagged_request_count,
        total_spend_usd=total,
        spend_savings=dict(
            window_usd=run.spend_savings_window_usd,
            projected_monthly_usd=run.spend_savings_monthly_usd,
            percent_of_spend=percentage,
        ),
        experimental_spend_savings=dict(projected_monthly_usd=run.experimental_monthly_usd),
        reliability_findings=dict(
            count=run.reliability_count,
            modelled_overhead_monthly_usd=run.reliability_overhead_monthly_usd,
        ),
        severity_breakdown={
            "critical": int((run.issue_counts or {}).get("critical", 0)),
            "warning": int((run.issue_counts or {}).get("warning", 0)),
            "info": int((run.issue_counts or {}).get("info", 0)),
        },
        by_provider=list(by_provider.values()),
        trend=[
            {
                "date": entry["date"],
                "spend_usd": entry.get("spend_usd", 0),
                "waste_usd": entry.get("waste_usd", 0),
            }
            for entry in run.trend
        ],
        top_issues=[await _issue_response(session, user.user_id, issue) for issue in issues[:5]],
    )


@router.get("/issues", response_model=IssueList)
async def list_issues(
    provider: str | None = None,
    severity: Literal["critical", "warning", "info"] | None = None,
    tier: int | None = Query(default=None, ge=1, le=3),
    impact_kind: Literal["spend", "reliability"] | None = None,
    include_experimental: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> IssueList:
    settings = await _settings(session, user.user_id)
    await session.commit()
    include_tier3 = settings.tier3_enabled and include_experimental
    priority_cursor = decode_issue_cursor(cursor) if cursor else None
    rows = await IssueRepository(session, user.user_id).list_issues(
        limit=limit + 1,
        priority_cursor=priority_cursor,
        provider=provider,
        severity=severity,
        tier=tier,
        impact_kind=impact_kind,
        is_demo_data=False,
        include_experimental=include_tier3,
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = (
        encode_issue_cursor(
            rows[-1].severity,
            rows[-1].impact_kind,
            str(rows[-1].projected_monthly_usd),
            rows[-1].id,
        )
        if has_more and rows
        else None
    )
    return IssueList(
        items=[await _issue_response(session, user.user_id, issue) for issue in rows],
        next_cursor=next_cursor,
    )


@router.get("/issues/{issue_id}", response_model=IssueResponse)
async def get_issue(
    issue_id: UUID,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> IssueResponse:
    repo = IssueRepository(session, user.user_id)
    issue = await repo.get(issue_id)
    if issue is None or issue.is_demo_data:
        raise OvercallError("not_found", 404, "The requested issue was not found.")
    if issue.tier == 3 and not (await _settings(session, user.user_id)).tier3_enabled:
        raise OvercallError("not_found", 404, "The requested issue was not found.")
    await session.commit()
    return await _issue_response(session, user.user_id, issue)


@router.get("/logs", response_model=LogList)
async def list_logs(
    q: str | None = Query(default=None, min_length=4, max_length=200),
    provider: str | None = None,
    status_class: Literal["2xx", "3xx", "4xx", "5xx"] | None = None,
    endpoint: str | None = Query(default=None, max_length=512),
    caller: str | None = Query(default=None, max_length=64),
    model: str | None = Query(default=None, max_length=128),
    issue_id: UUID | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: str | None = None,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> LogList:
    if from_ and to and from_ > to:
        raise OvercallError(
            "validation_error",
            422,
            "The time range is invalid.",
            {"fields": [{"path": "from", "message": "Must be earlier than or equal to to."}]},
        )
    cursor_value = _cursor_param(cursor)
    repo = RequestLogRepository(session, user.user_id)
    rows = await repo.list_logs(
        limit=limit + 1,
        cursor=cursor_value,
        provider=provider,
        endpoint=endpoint,
        caller=caller,
        occurred_from=from_,
        occurred_to=to,
        query=q,
        status_class=status_class,
        issue_id=issue_id,
        model=model,
        source="proxy",
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor(rows[-1].occurred_at, rows[-1].id) if has_more and rows else None
    return LogList(
        items=[await _log_response(session, user.user_id, row) for row in rows],
        next_cursor=next_cursor,
    )


@router.get("/logs/facets", response_model=LogFacets)
async def log_facets(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> LogFacets:
    providers_result = await session.execute(
        select(RequestLog.provider)
        .where(RequestLog.user_id == user.user_id, RequestLog.source == "proxy")
        .distinct()
        .order_by(RequestLog.provider)
        .limit(100)
    )
    callers_result = await session.execute(
        select(RequestLog.caller)
        .where(
            RequestLog.user_id == user.user_id,
            RequestLog.source == "proxy",
            RequestLog.caller.is_not(None),
        )
        .distinct()
        .order_by(RequestLog.caller)
        .limit(100)
    )
    models_result = await session.execute(
        select(RequestLog.model)
        .where(
            RequestLog.user_id == user.user_id,
            RequestLog.source == "proxy",
            RequestLog.model.is_not(None),
        )
        .distinct()
        .order_by(RequestLog.model)
        .limit(100)
    )
    endpoints_result = await session.execute(
        select(RequestLog.endpoint, func.count().label("count"))
        .where(RequestLog.user_id == user.user_id, RequestLog.source == "proxy")
        .group_by(RequestLog.endpoint)
        .order_by(func.count().desc(), RequestLog.endpoint)
        .limit(100)
    )
    return LogFacets(
        providers=list(providers_result.scalars().all()),
        callers=list(callers_result.scalars().all()),
        models=list(models_result.scalars().all()),
        endpoints=[FacetValue(value=row[0], count=int(row[1])) for row in endpoints_result.all()],
    )


@router.get("/logs/{log_id}", response_model=LogEntry)
async def get_log(
    log_id: UUID,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> LogEntry:
    log = await RequestLogRepository(session, user.user_id).get(log_id)
    if log is None or log.source != "proxy":
        raise OvercallError("not_found", 404, "The requested log was not found.")
    return await _log_response(session, user.user_id, log)


@router.post(
    "/ingest-keys",
    response_model=IngestKeyCreatedResponse,
    status_code=201,
)
async def create_ingest_key(
    body: IngestKeyCreate,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> IngestKeyCreatedResponse:
    app_settings: Settings | None = session.info.get("app_settings")
    pepper = app_settings.ingest_key_pepper if app_settings is not None else None
    if pepper is None:
        raise OvercallError("not_ready", 503, "The service is not ready. Try again shortly.")

    plaintext = f"oc_{secrets.token_urlsafe(32)}"
    row = await IngestKeyRepository(session).create_for_user(
        user.user_id,
        name=body.name,
        prefix=plaintext[:9],
        key_hash=hash_ingest_key(plaintext, pepper.get_secret_value()),
        pepper_version=CURRENT_INGEST_KEY_VERSION,
    )
    if row is None:
        raise OvercallError(
            "conflict",
            409,
            "This action conflicts with the current state.",
        )

    await session.commit()
    return IngestKeyCreatedResponse(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        key=plaintext,
        created_at=row.created_at,
    )


@router.get("/ingest-keys", response_model=list[IngestKeyListItem])
async def list_ingest_keys(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[IngestKeyListItem]:
    rows = await IngestKeyRepository(session).list_for_user(user.user_id)
    return [
        IngestKeyListItem(
            id=row.id,
            name=row.name,
            prefix=row.prefix,
            created_at=row.created_at,
            last_used_at=row.last_used_at,
            revoked_at=row.revoked_at,
        )
        for row in rows
    ]


@router.delete("/ingest-keys/{key_id}", status_code=204, response_class=Response)
async def revoke_ingest_key(
    key_id: UUID,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    await IngestKeyRepository(session).revoke_for_user(user.user_id, key_id)
    await session.commit()
    return Response(status_code=204)


def _provider_pricing(provider: str) -> ProviderPricing | None:
    try:
        pricing = DEFAULT_PRICING_BOOK.for_time(provider, datetime.now(UTC))
    except (KeyError, ValueError):
        return None
    rows = []
    for model_name, model in pricing.models.items():
        rows.append(
            PricingRow(
                label=f"{model_name} input",
                usd_per_1m=float(model.input_per_1m),
            )
        )
    return ProviderPricing(
        version=pricing.version,
        effective_from=pricing.effective_from,
        source_url=pricing.source_url,
        rows=rows,
    )


def _snippets(provider: str, base_url: str) -> list[dict[str, str]]:
    routes_file = _ROOT / "contract" / "fixtures" / "proxy" / "routes.json"
    try:
        routes = json.loads(routes_file.read_text(encoding="utf-8"))[provider]
    except (OSError, KeyError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Could not load proxy route snippets for provider {provider!r}."
        ) from exc

    snippets = []
    for sample in routes:
        method = sample["method"]
        url = f"{base_url}{sample['path']}"
        if provider == "stripe":
            auth_curl = '-u "$STRIPE_TEST_KEY:"'
            auth_python = (
                'auth=(os.environ["STRIPE_TEST_KEY"], ""), '
                'headers={"X-Overcall-Key": "YOUR_OVERCALL_KEY"}'
            )
            auth_node = (
                "'Authorization': 'Basic ' + "
                "Buffer.from(process.env.STRIPE_TEST_KEY + ':').toString('base64')"
            )
            body_curl = ""
            body_python = ""
            body_node = ""
        else:
            auth_curl = '-H "Authorization: Bearer $OPENAI_API_KEY"'
            auth_python = (
                'headers={"Authorization": f"Bearer {os.environ[\'OPENAI_API_KEY\']}", '
                '"X-Overcall-Key": "YOUR_OVERCALL_KEY"}'
            )
            auth_node = (
                "'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, "
                "'Content-Type': 'application/json'"
            )
            body_curl = (
                " -H 'Content-Type: application/json' "
                "--data '{\"model\":\"gpt-4o-mini\","
                "\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'"
            )
            body_python = (
                ', json={"model": "gpt-4o-mini", '
                '"messages": [{"role": "user", "content": "Hello"}]}'
            )
            body_node = (
                ", body: JSON.stringify({ model: 'gpt-4o-mini', "
                "messages: [{ role: 'user', content: 'Hello' }] })"
            )
        snippets.extend(
            [
                {
                    "id": "curl",
                    "label": "cURL",
                    "code": (
                        f"curl -X {method} '{url}' {auth_curl} "
                        f"-H 'X-Overcall-Key: YOUR_OVERCALL_KEY'{body_curl}"
                    ),
                },
                {
                    "id": "python",
                    "label": "Python",
                    "code": (
                        "import os\nimport requests\n\n"
                        f"requests.request('{method}', '{url}', {auth_python}{body_python})"
                    ),
                },
                {
                    "id": "node",
                    "label": "Node",
                    "code": (
                        f"await fetch('{url}', {{ method: '{method}', headers: {{ {auth_node}, "
                        "'X-Overcall-Key': 'YOUR_OVERCALL_KEY' }"
                        f"{body_node} }})"
                    ),
                },
            ]
        )
    return snippets

@router.get("/providers", response_model=list[ProviderResponse])
async def providers(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ProviderResponse]:
    settings = await _settings(session, user.user_id)
    await session.commit()
    logs = RequestLogRepository(session, user.user_id)
    settings_obj: Settings = session.info.get("app_settings") if hasattr(session, "info") else None
    base_url = (
        settings_obj.public_proxy_base_url if settings_obj is not None else "http://localhost:8000"
    ).rstrip("/")
    providers_result = []
    for provider, name in (("openai", "OpenAI"), ("stripe", "Stripe"), ("aws", "AWS")):
        proxy_count = await logs.count(source="proxy", provider=provider)
        latest = await logs.list_logs(limit=1, source="proxy", provider=provider)
        if provider == "aws":
            status = "coming_soon"
        elif proxy_count:
            status = "receiving_traffic"
        else:
            status = "waiting"
        providers_result.append(
            ProviderResponse(
                id=provider,
                name=name,
                status=status,
                proxy_base_url=f"{base_url}/proxy/{provider}/v1",
                snippets=[]
                if provider == "aws"
                else _snippets(provider, f"{base_url}/proxy/{provider}/v1"),
                traffic=dict(
                    proxy=proxy_count,
                    demo=0,
                    last_request_at=latest[0].occurred_at if latest else None,
                ),
                upstream_mode=(
                    settings.upstream_mode
                    if provider == "openai"
                    else "test"
                    if provider == "stripe"
                    else None
                ),
                pricing=_provider_pricing(provider),
                notes=(
                    "Stripe does not bill per call. Savings are a modelled overhead."
                    if provider == "stripe"
                    else None
                ),
            )
        )
    return providers_result


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SettingsResponse:
    row = await _settings(session, user.user_id)
    await session.commit()
    return _settings_response(row)


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(
    body: SettingsUpdate,
    background_tasks: BackgroundTasks,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SettingsResponse:
    unknown = set(body.rules_enabled) - set(RULE_IDS)
    if unknown:
        raise OvercallError(
            "validation_error",
            422,
            "Some settings are invalid.",
            {
                "fields": [
                    {
                        "path": "rules_enabled",
                        "message": f"Unknown rule identifiers: {', '.join(sorted(unknown))}.",
                    }
                ]
            },
        )
    app_settings: Settings = getattr(session, "info", {}).get("app_settings")
    if body.upstream_mode == "real":
        if app_settings is None or not app_settings.allow_real_upstream:
            raise OvercallError(
                "real_upstream_disabled",
                403,
                "Real upstream traffic is disabled by the operator.",
            )
        if not body.confirm_real_upstream:
            raise OvercallError(
                "confirmation_required",
                400,
                "Confirm real upstream traffic before saving this setting.",
            )
    values = body.model_dump(
        exclude={"confirm_real_upstream"},
        mode="json",
    )
    values["thresholds"] = body.thresholds.model_dump(mode="json")
    repo = UserSettingsRepository(session, user.user_id)
    row = await repo.update(values)
    await session.commit()
    await _schedule_detection(session, user.user_id, background_tasks)
    return _settings_response(row, confirm_real_upstream=body.confirm_real_upstream)


@router.post("/settings/reset", response_model=SettingsResponse)
async def reset_settings(
    body: SettingsReset,
    background_tasks: BackgroundTasks,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> SettingsResponse:
    if not body.confirm:
        raise OvercallError("confirmation_required", 400, "Confirm resetting settings.")
    repo = UserSettingsRepository(session, user.user_id)
    row = await repo.update(
        {
            "currency": "INR",
            "usd_inr_rate": Decimal("83.5"),
            "rules_enabled": _DEFAULT_RULES,
            "tier3_enabled": False,
            "thresholds": _DEFAULT_THRESHOLDS.model_dump(mode="json"),
            "upstream_mode": "mock",
            "retention_days": 14,
        }
    )
    await session.commit()
    await _schedule_detection(session, user.user_id, background_tasks)
    return _settings_response(row)


@router.get("/rules", response_model=list[RuleResponse])
async def get_rules(
    user: UserContext = Depends(get_current_user),
) -> list[RuleResponse]:
    del user
    rules_file = _ROOT / "contract" / "rules.json"
    return [
        RuleResponse.model_validate(rule)
        for rule in json.loads(rules_file.read_text(encoding="utf-8"))
    ]


@router.post(
    "/detection/run",
    response_model=DetectionRunResponse,
    responses={202: {"model": DetectionRunResponse, "description": "Detection queued."}},
)
async def run_detection(
    background_tasks: BackgroundTasks,
    response: Response,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DetectionRunResponse:
    run = await _schedule_detection(session, user.user_id, background_tasks)
    assert run is not None
    if run.status == "running":
        response.status_code = 202
    return DetectionRunResponse(run_id=run.id, status=_api_detection_status(run.status))


@router.get("/detection/runs/latest", response_model=DetectionRunSummary)
async def latest_detection_run(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> DetectionRunSummary:
    run = await DetectionRunRepository(session, user.user_id).latest(is_demo_data=False)
    if run is None:
        raise OvercallError("not_found", 404, "No detection run is available.")
    return _run_summary(run)


@router.get("/accuracy", response_model=ErrorResponse, status_code=403)
async def accuracy(
    user: UserContext = Depends(get_current_user),
) -> NoReturn:
    del user
    raise OvercallError(
        "forbidden",
        403,
        "Synthetic accuracy data is available only in the local demo mode.",
    )

@router.post("/demo/load", response_model=ErrorResponse, status_code=403)
async def load_demo(
    body: DemoLoad,
    background_tasks: BackgroundTasks,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> NoReturn:
    del body, background_tasks, user, session
    raise OvercallError(
        "forbidden",
        403,
        "Synthetic data is available only in the local demo mode.",
    )


@router.delete("/demo", status_code=204, response_class=Response)
async def delete_demo(
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    await IssueRepository(session, user.user_id).delete_for_source("demo")
    await RequestLogRepository(session, user.user_id).delete_for_source("demo")
    await DetectionRunRepository(session, user.user_id).delete_for_source("demo")
    await session.commit()
    return Response(status_code=204)


@router.delete("/data", status_code=204, response_class=Response)
async def delete_data(
    body: DeleteData,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    if body.confirm != "delete my data":
        raise OvercallError(
            "confirmation_required",
            400,
            'Type "delete my data" to confirm this action.',
        )
    await IssueRepository(session, user.user_id).delete_all()
    await RequestLogRepository(session, user.user_id).delete_all()
    await DetectionRunRepository(session, user.user_id).delete_all()
    await session.commit()
    return Response(status_code=204)
