from overcall.rules import base


def test_rule_context_reuses_filtered_rows_for_the_same_log_snapshot(monkeypatch) -> None:
    calls = 0

    def filter_rows(logs):
        nonlocal calls
        calls += 1
        return list(logs)

    monkeypatch.setattr(base, "eligible_logs", filter_rows)
    context = base.RuleContext(w=object(), window_days=7)
    logs = []
    other_logs = []

    first = context.filter_logs(logs)
    assert context.filter_logs(logs) is first
    assert context.filter_logs(other_logs) == other_logs
    assert calls == 2
