import json
from datetime import UTC, datetime

from scripts.evaluate import build_synthetic_report, write_report


def test_synthetic_report_is_per_rule_and_persisted_separately(tmp_path) -> None:
    generated_at = datetime(2026, 11, 6, tzinfo=UTC)
    report = build_synthetic_report(
        seed=42,
        days=7,
        size="small",
        generated_at=generated_at,
    )
    output = tmp_path / "reports" / "synthetic.json"

    write_report(report, output)

    persisted = json.loads(output.read_text(encoding="utf-8"))
    assert persisted == report
    assert persisted["generated_at"] == "2026-11-06T00:00:00+00:00"
    assert persisted["requests"] > 0
    assert "real" not in persisted
    assert {
        "rule_id",
        "tier",
        "positives",
        "flagged",
        "true_positives",
        "precision",
        "recall",
        "false_positives_on_hard_negatives",
    } <= persisted["rules"][0].keys()
    assert len(persisted["rules"]) == 7
    assert all(0 <= row["precision"] <= 1 for row in persisted["rules"])
    assert all(0 <= row["recall"] <= 1 for row in persisted["rules"])
