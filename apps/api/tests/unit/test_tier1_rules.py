from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from overcall.api_schemas import Thresholds
from overcall.models import RequestLog
from overcall.rules.base import RuleContext, eligible_logs
from overcall.rules.duplicate_calls import DuplicateCalls
from overcall.rules.missing_cache import MissingCache
from overcall.rules.retry_storm import RetryStorm
from overcall.synthetic import generate

RULES = {
    "duplicate_calls": DuplicateCalls(),
    "missing_cache": MissingCache(),
    "retry_storm": RetryStorm(),
}
BASE_TIME = datetime(2026, 1, 1, tzinfo=UTC)
CONTEXT = RuleContext(w=Thresholds(), window_days=1)


def _log(
    request_id: str,
    *,
    second: float,
    provider: str = "openai",
    origin: str = "upstream",
    method: str = "POST",
    endpoint: str = "/v1/chat/completions",
    status: int = 200,
    req_hash: str = "same-payload",
    has_idempotency_key: bool = False,
) -> RequestLog:
    return RequestLog(
        id=request_id,
        timestamp=BASE_TIME + timedelta(seconds=second),
        provider=provider,
        endpoint=endpoint,
        method=method,
        req_size=1,
        req_hash=req_hash,
        status=status,
        resp_size=1,
        latency_ms=1,
        cost_usd=0.001,
        source="proxy",
        origin=origin,
        has_idempotency_key=has_idempotency_key,
    )


def _flagged(rule_id: str, logs: list[RequestLog]) -> set[str]:
    return {
        request_id
        for finding in RULES[rule_id].detect(logs, CONTEXT)
        for request_id in finding.waste_by_request
    }


def test_eligible_logs_sort_fallback_keeps_only_supported_rows() -> None:
    logs = [
        _log("later", second=2),
        _log("aws", second=0, provider="aws"),
        _log("earlier", second=1),
        _log("overcall", second=3, origin="overcall"),
    ]

    assert [row.id for row in eligible_logs(logs)] == ["earlier", "later"]


@pytest.mark.parametrize(
    ("gap_s", "should_flag"),
    [(9.99, True), (10.0, True), (10.01, False)],
)
def test_duplicate_calls_short_window_boundaries(gap_s: float, should_flag: bool) -> None:
    logs = [_log("first", second=0), _log("repeat", second=gap_s)]

    assert ("repeat" in _flagged("duplicate_calls", logs)) is should_flag


def test_duplicate_calls_require_success_and_matching_method_and_payload() -> None:
    failed_first = [
        _log("first", second=0, status=500),
        _log("repeat", second=1),
    ]
    changed_payload = [
        _log("first", second=0),
        _log("repeat", second=1, req_hash="different-payload"),
    ]
    changed_method = [
        _log("first", second=0),
        _log("repeat", second=1, method="GET"),
    ]

    assert not _flagged("duplicate_calls", failed_first)
    assert not _flagged("duplicate_calls", changed_payload)
    assert not _flagged("duplicate_calls", changed_method)


@pytest.mark.parametrize(
    ("gap_s", "should_flag"),
    [(10.0, False), (10.01, True), (600.0, True), (600.01, False)],
)
def test_missing_cache_window_boundaries(gap_s: float, should_flag: bool) -> None:
    logs = [
        _log("first", second=0, method="GET", endpoint="/v1/models"),
        _log("repeat", second=gap_s, method="GET", endpoint="/v1/models"),
    ]

    assert ("repeat" in _flagged("missing_cache", logs)) is should_flag


def test_missing_cache_excludes_non_deterministic_posts() -> None:
    logs = [
        _log("first", second=0),
        _log("repeat", second=60),
    ]

    assert not _flagged("missing_cache", logs)


@pytest.mark.parametrize(
    ("gap_ms", "should_flag"),
    [(999.0, True), (1000.0, False)],
)
def test_retry_storm_backoff_boundary(gap_ms: float, should_flag: bool) -> None:
    step = gap_ms / 1000
    logs = [
        _log("first", second=0, status=503),
        _log("second", second=step, status=503),
        _log("third", second=step * 2, status=503),
    ]

    assert bool(_flagged("retry_storm", logs)) is should_flag
    if should_flag:
        assert _flagged("retry_storm", logs) == {"second", "third"}


def test_retry_storm_requires_three_failures_and_no_successful_predecessor() -> None:
    two_attempts = [
        _log("first", second=0, status=503),
        _log("second", second=0.5, status=503),
    ]
    successful_predecessor = [
        _log("first", second=0, status=200),
        _log("second", second=0.5, status=503),
        _log("third", second=1, status=503),
    ]

    assert not _flagged("retry_storm", two_attempts)
    assert not _flagged("retry_storm", successful_predecessor)


def test_tier1_rules_detect_small_fixture_positives_without_hard_negative_flags() -> None:
    logs, truth = generate(seed=42, days=7, size="small")

    for rule_id in RULES:
        flagged = _flagged(rule_id, logs)
        assert truth.request_ids(rule_id) <= flagged
        assert flagged.isdisjoint(truth.request_ids(rule_id, "hard_negative"))


@pytest.mark.parametrize(
    ("rule_id", "logs"),
    [
        (
            "duplicate_calls",
            [_log("first", second=0), _log("repeat", second=1)],
        ),
        (
            "missing_cache",
            [
                _log("first", second=0, method="GET", endpoint="/v1/models"),
                _log("repeat", second=60, method="GET", endpoint="/v1/models"),
            ],
        ),
        (
            "retry_storm",
            [
                _log("first", second=0, status=503),
                _log("second", second=0.5, status=503),
                _log("third", second=1, status=503),
            ],
        ),
    ],
)
@pytest.mark.parametrize("excluded", [{"provider": "aws"}, {"origin": "overcall"}])
def test_tier1_rules_ignore_aws_and_overcall_rows(
    rule_id: str, logs: list[RequestLog], excluded: dict[str, str]
) -> None:
    excluded_logs = [log.model_copy(update=excluded) for log in logs]

    assert not _flagged(rule_id, excluded_logs)
