from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from overcall.api_schemas import RULE_IDS, Thresholds
from overcall.models import RequestLog
from overcall.pricing_config import PRICING, model_price
from overcall.rules import RULES, RULES_BY_ID
from overcall.rules.base import Rule, RuleContext, eligible_logs
from overcall.synthetic import generate
from overcall.v1_api import _rule_enabled_for_detection, _synthetic_accuracy

BASE_TIME = datetime(2026, 1, 1, tzinfo=UTC)


def _log(
    request_id: str,
    *,
    second: float = 0,
    provider: str = "openai",
    origin: str = "upstream",
    method: str = "POST",
    endpoint: str = "/v1/chat/completions",
    status: int = 200,
    req_hash: str | None = None,
    req_size: int = 1,
    context_hash: str | None = None,
    context_tokens: int | None = None,
    prompt_tokens: int = 100,
    completion_tokens: int = 20,
    model: str | None = None,
    uses_tools: bool = False,
) -> RequestLog:
    return RequestLog(
        id=request_id,
        timestamp=BASE_TIME + timedelta(seconds=second),
        provider=provider,
        endpoint=endpoint,
        method=method,
        req_size=req_size,
        req_hash=req_hash or request_id,
        status=status,
        resp_size=1,
        latency_ms=1,
        cost_usd=1.0,
        source="proxy",
        origin=origin,
        context_hash=context_hash,
        context_tokens=context_tokens,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        model=model,
        uses_tools=uses_tools,
    )


def _context(thresholds: Thresholds | None = None) -> RuleContext:
    return RuleContext(w=thresholds or Thresholds(), window_days=1)


def _trigger_rows() -> dict[str, list[RequestLog]]:
    batch_key = next(iter(PRICING["openai"]["batch_equivalents"]))
    batch_method, batch_endpoint = batch_key.split(" ", 1)
    premium_model = next(iter(PRICING["openai"]["downgrade_map"]))
    return {
        "duplicate_calls": [
            _log("duplicate-first", second=0, req_hash="duplicate"),
            _log("duplicate-repeat", second=1, req_hash="duplicate"),
        ],
        "missing_cache": [
            _log("cache-first", second=0, method="GET", endpoint="/v1/models", req_hash="cache"),
            _log("cache-repeat", second=60, method="GET", endpoint="/v1/models", req_hash="cache"),
        ],
        "retry_storm": [
            _log("retry-first", second=0, status=503, req_hash="retry"),
            _log("retry-second", second=0.1, status=503, req_hash="retry"),
            _log("retry-third", second=0.2, status=503, req_hash="retry"),
        ],
        "oversized_payload": [
            _log("oversized", req_size=Thresholds().oversized_bytes + 1),
        ],
        "unbatched_calls": [
            _log(
                f"unbatched-{index}",
                second=index,
                method=batch_method,
                endpoint=batch_endpoint,
                req_hash=f"unbatched-{index}",
            )
            for index in range(Thresholds().unbatched_min_calls)
        ],
        "token_bloat": [
            _log(
                f"context-{index}",
                second=index,
                req_hash=f"context-{index}",
                context_hash="repeated-context",
                context_tokens=Thresholds().token_bloat_min_context_tokens,
                prompt_tokens=2_000,
                model="gpt-4o",
            )
            for index in range(Thresholds().token_bloat_min_repeats)
        ],
        "model_overuse": [
            _log(
                f"model-{index}",
                second=index,
                req_hash=f"model-{index}",
                prompt_tokens=100,
                completion_tokens=20,
                model=premium_model,
            )
            for index in range(Thresholds().model_overuse_min_calls)
        ],
    }


def test_all_seven_rules_share_the_rule_interface_and_are_registered() -> None:
    assert {rule.id for rule in RULES} == set(RULE_IDS)
    assert all(isinstance(rule, Rule) and callable(rule.detect) for rule in RULES)
    assert set(RULES_BY_ID) == set(RULE_IDS)
    assert all(rule.default_enabled for rule in RULES)
    assert all(
        rule.threshold_keys and all(key in Thresholds.model_fields for key in rule.threshold_keys)
        for rule in RULES
    )


def test_shared_eligibility_filters_and_orders_logs() -> None:
    later_id = _log("b", second=0)
    earlier_id = _log("a", second=0)
    self_originated = _log("self", origin="overcall")
    unsupported_provider = _log("aws", provider="aws")

    assert eligible_logs([later_id, self_originated, unsupported_provider, earlier_id]) == [
        earlier_id,
        later_id,
    ]


def test_every_rule_excludes_overcall_and_aws_rows_before_detection() -> None:
    context = _context()
    for rule_id, rows in _trigger_rows().items():
        rule = RULES_BY_ID[rule_id]
        assert rule.detect(rows, context), rule_id
        assert not rule.detect(
            [row.model_copy(update={"origin": "overcall"}) for row in rows], context
        ), f"{rule_id} included Overcall-origin traffic"
        assert not rule.detect(
            [row.model_copy(update={"provider": "aws"}) for row in rows], context
        ), f"{rule_id} included unsupported AWS traffic"


def test_oversized_payload_threshold_is_strict_and_settings_driven() -> None:
    context = _context(Thresholds(oversized_bytes=100_000))
    exact = _log("exact", req_size=100_000)
    above = _log("above", req_size=100_001)

    assert not RULES_BY_ID["oversized_payload"].detect([exact], context)
    assert RULES_BY_ID["oversized_payload"].detect([above], context)


def test_unbatched_calls_uses_configured_minimum_and_batch_equivalents_have_basis() -> None:
    rows = _trigger_rows()["unbatched_calls"][:3]
    context = _context(Thresholds(unbatched_min_calls=3))

    openai_finding = RULES_BY_ID["unbatched_calls"].detect(rows, context)[0]
    assert openai_finding.impact_kind == "spend"
    assert not RULES_BY_ID["unbatched_calls"].detect(
        rows, _context(Thresholds(unbatched_min_calls=4))
    )
    assert all(
        item["basis"].strip()
        for provider in PRICING.values()
        for item in provider["batch_equivalents"].values()
    )

    stripe_batch_key = next(iter(PRICING["stripe"]["batch_equivalents"]))
    stripe_method, stripe_endpoint = stripe_batch_key.split(" ", 1)
    stripe_rows = [
        _log(
            f"stripe-unbatched-{index}",
            second=index,
            provider="stripe",
            method=stripe_method,
            endpoint=stripe_endpoint,
        )
        for index in range(Thresholds().unbatched_min_calls)
    ]
    stripe_finding = RULES_BY_ID["unbatched_calls"].detect(stripe_rows, context)[0]

    assert stripe_finding.impact_kind == "reliability"
    assert "not provider fees" in stripe_finding.summary


def test_token_bloat_uses_context_token_threshold_and_cost_basis() -> None:
    thresholds = Thresholds(
        token_bloat_min_repeats=3,
        token_bloat_min_context_tokens=1_024,
    )
    context = _context(thresholds)
    under = [
        _log(
            f"under-{index}",
            second=index,
            context_hash="under",
            context_tokens=1_023,
            prompt_tokens=2_000,
            model="gpt-4o",
        )
        for index in range(3)
    ]
    assert not RULES_BY_ID["token_bloat"].detect(under, context)

    qualifying = [
        row.model_copy(update={"context_hash": "qualifying", "context_tokens": 1_024})
        for row in under
    ]
    finding = RULES_BY_ID["token_bloat"].detect(qualifying, context)[0]
    model, prices = model_price("gpt-4o")
    assert model == "gpt-4o"
    expected_waste = 1_024 * (prices["input_per_1m"] - prices["cached_input_per_1m"]) / 1e6
    assert len(finding.affected) == 2
    assert all(value == expected_waste for value in finding.waste_by_request.values())
    assert 0.0 <= finding.confidence <= 1.0


def test_model_overuse_uses_minimum_calls_and_excludes_tool_calls() -> None:
    thresholds = Thresholds(
        model_overuse_max_prompt_tokens=800,
        model_overuse_max_completion_tokens=300,
        model_overuse_min_calls=3,
    )
    context = _context(thresholds)
    rows = _trigger_rows()["model_overuse"][:3]

    finding = RULES_BY_ID["model_overuse"].detect(rows, context)[0]
    assert len(finding.affected) == 3
    assert finding.confidence == 0.7
    assert not RULES_BY_ID["model_overuse"].detect(rows[:2], context)
    assert not RULES_BY_ID["model_overuse"].detect(
        [row.model_copy(update={"uses_tools": True}) for row in rows], context
    )


def test_tier_three_detection_gate_and_rule_toggle() -> None:
    tier3_rule = RULES_BY_ID["token_bloat"]
    tier2_rule = RULES_BY_ID["oversized_payload"]
    settings = SimpleNamespace(
        rules_enabled={"token_bloat": True, "oversized_payload": True},
        tier3_enabled=False,
    )

    assert not _rule_enabled_for_detection(tier3_rule, settings)
    assert _rule_enabled_for_detection(tier2_rule, settings)

    settings.tier3_enabled = True
    assert _rule_enabled_for_detection(tier3_rule, settings)
    settings.rules_enabled["token_bloat"] = False
    assert not _rule_enabled_for_detection(tier3_rule, settings)


def test_synthetic_evaluation_reports_metrics_for_each_rule() -> None:
    logs, truth = generate(seed=42, days=7, size="small")

    report = _synthetic_accuracy(logs, truth)

    assert {row.rule_id for row in report} == set(RULE_IDS)
    assert all(
        row.positives > 0
        and row.flagged >= row.true_positives
        and row.positives >= row.true_positives
        and row.false_positives_on_hard_negatives >= 0
        for row in report
    )
    assert all(0 <= row.precision <= 1 and 0 <= row.recall <= 1 for row in report)
