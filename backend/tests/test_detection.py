import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from costguard.hashing import normalize_endpoint  # noqa: E402
from costguard.rules import RULES  # noqa: E402
from costguard.rules.base import RuleContext  # noqa: E402
from costguard.synthetic import generate  # noqa: E402


class W:
    short_window_s = 10
    long_window_s = 600
    retry_min_backoff_ms = 1000
    retry_min_attempts = 3
    oversized_bytes = 200_000
    unbatched_min_calls = 5
    unbatched_window_s = 5
    token_bloat_min_repeats = 3
    token_bloat_min_prompt_tokens = 1500
    model_overuse_max_prompt_tokens = 800
    model_overuse_max_completion_tokens = 300


def test_rules_against_ground_truth():
    logs = generate(seed=7, days=3)
    days = max(1.0, (logs[-1].timestamp - logs[0].timestamp).total_seconds() / 86400)
    ctx = RuleContext(w=W(), window_days=days)
    for rule in RULES:
        flagged = set()
        for f in rule.detect(logs, ctx):
            flagged |= set(f.waste_by_request)
        truth = {l.id for l in logs if l.ground_truth == rule.id}
        tp = len(flagged & truth)
        assert truth, rule.id
        assert tp / len(truth) >= 0.95, f"{rule.id} recall {tp}/{len(truth)}"
        assert tp / len(flagged) >= 0.95, f"{rule.id} precision {tp}/{len(flagged)}"


def test_generator_is_seedable():
    a = [(l.endpoint, l.req_hash) for l in generate(seed=3, days=1)]
    b = [(l.endpoint, l.req_hash) for l in generate(seed=3, days=1)]
    assert a == b


def test_endpoint_normalization():
    assert normalize_endpoint("/v1/customers/cus_Ab12CdEf34") == "/v1/customers/{id}"
    assert normalize_endpoint("/v1/setup_intents") == "/v1/setup_intents"
    assert normalize_endpoint("/v1/chat/completions") == "/v1/chat/completions"
