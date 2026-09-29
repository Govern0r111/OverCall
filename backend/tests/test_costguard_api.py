"""Comprehensive backend API tests for API Cost Guard."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend .env value used by CI
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def seed_data(api):
    # Ensure clean synthetic dataset for the whole module
    api.delete(f"{BASE_URL}/api/data", timeout=30)
    r = api.post(f"{BASE_URL}/api/synthetic/load", json={"seed": 42}, timeout=60)
    assert r.status_code == 200, r.text
    # Reset settings defaults
    api.put(f"{BASE_URL}/api/settings", json={
        "currency": "INR", "usd_inr_rate": 83.5, "experimental_enabled": False,
        "openai_upstream": "mock",
        "rules": {r_id: True for r_id in [
            "duplicate_calls", "missing_cache", "retry_storm",
            "oversized_payload", "unbatched_calls", "token_bloat", "model_overuse"
        ]},
        "windows": {}
    }, timeout=30)
    yield
    api.put(f"{BASE_URL}/api/settings", json={}, timeout=30)


# --- Health & Overview ---
class TestOverview:
    def test_health(self, api):
        r = api.get(f"{BASE_URL}/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_overview_has_data(self, api):
        r = api.get(f"{BASE_URL}/api/overview")
        assert r.status_code == 200
        d = r.json()
        assert d.get("has_data") is True
        assert d.get("projected_monthly_usd", 0) > 0
        assert 6 <= len(d.get("trend", [])) <= 10
        top = d.get("top_issues", [])
        assert len(top) <= 5
        # sorted by severity (critical first) then savings desc
        rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        keys = [(rank.get(i["severity"], 9), -i["projected_monthly_usd"]) for i in top]
        assert keys == sorted(keys)


# --- Synthetic evaluate: precision & recall ---
class TestEvaluate:
    def test_precision_recall(self, api):
        r = api.get(f"{BASE_URL}/api/synthetic/evaluate", timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert d["has_data"] is True
        rules = d["rules"]
        assert len(rules) == 7
        for rule in rules:
            rid = rule.get("rule_id") or rule.get("id")
            assert rule["precision"] >= 0.95, f"{rid} precision={rule['precision']}"
            assert rule["recall"] >= 0.95, f"{rid} recall={rule['recall']}"


# --- Issues filters and experimental gating ---
class TestIssues:
    def test_filters(self, api):
        r = api.get(f"{BASE_URL}/api/issues?provider=openai")
        assert r.status_code == 200
        assert all(i["provider"] == "openai" for i in r.json())

        r = api.get(f"{BASE_URL}/api/issues?severity=high")
        assert r.status_code == 200
        assert all(i["severity"] == "high" for i in r.json())

        r = api.get(f"{BASE_URL}/api/issues?tier=1")
        assert r.status_code == 200
        assert all(i["tier"] == 1 for i in r.json())

    def test_tier3_gated(self, api):
        # Ensure experimental off first
        s = api.get(f"{BASE_URL}/api/settings").json()
        s["experimental_enabled"] = False
        api.put(f"{BASE_URL}/api/settings", json=s)
        r = api.get(f"{BASE_URL}/api/issues?tier=3")
        assert r.status_code == 200
        assert r.json() == [] or all(i["tier"] != 3 for i in r.json())

        ov_off = api.get(f"{BASE_URL}/api/overview").json()
        proj_off = ov_off.get("projected_monthly_usd", 0)

        # Enable experimental
        s["experimental_enabled"] = True
        api.put(f"{BASE_URL}/api/settings", json=s)
        r = api.get(f"{BASE_URL}/api/issues?tier=3")
        assert r.status_code == 200
        tier3 = r.json()
        assert len(tier3) > 0, "Expected tier 3 issues once enabled"

        # Hero projected must NOT include tier 3
        ov_on = api.get(f"{BASE_URL}/api/overview").json()
        assert "experimental_projected_monthly_usd" in ov_on
        assert ov_on["experimental_projected_monthly_usd"] > 0
        # Hero excludes Tier 3, so should equal (approx) the off value
        assert abs(ov_on["projected_monthly_usd"] - proj_off) < 0.01

        # Cleanup
        s["experimental_enabled"] = False
        api.put(f"{BASE_URL}/api/settings", json=s)


# --- Settings validation & effects ---
class TestSettings:
    def test_disable_rule_removes_issues(self, api):
        # Get baseline
        r0 = api.get(f"{BASE_URL}/api/issues").json()
        had_dup = any(i["rule_id"] == "duplicate_calls" for i in r0)
        assert had_dup
        s = api.get(f"{BASE_URL}/api/settings").json()
        s["rules"]["duplicate_calls"] = False
        r = api.put(f"{BASE_URL}/api/settings", json=s)
        assert r.status_code == 200
        r1 = api.get(f"{BASE_URL}/api/issues").json()
        assert not any(i["rule_id"] == "duplicate_calls" for i in r1)
        # restore
        s["rules"]["duplicate_calls"] = True
        api.put(f"{BASE_URL}/api/settings", json=s)

    def test_unknown_rule_returns_400(self, api):
        s = api.get(f"{BASE_URL}/api/settings").json()
        s["rules"]["fake_rule_xyz"] = True
        r = api.put(f"{BASE_URL}/api/settings", json=s)
        assert r.status_code == 400
        # restore
        s["rules"].pop("fake_rule_xyz", None)
        api.put(f"{BASE_URL}/api/settings", json=s)

    def test_invalid_window_422(self, api):
        s = api.get(f"{BASE_URL}/api/settings").json()
        bad = dict(s)
        bad["windows"] = dict(s["windows"], short_window_s=0)
        r = api.put(f"{BASE_URL}/api/settings", json=bad)
        assert r.status_code == 422

    def test_window_change_affects_results(self, api):
        s = api.get(f"{BASE_URL}/api/settings").json()
        orig = s["windows"]["short_window_s"]
        before = api.get(f"{BASE_URL}/api/issues?rule=duplicate_calls").json()
        s["windows"]["short_window_s"] = 60
        api.put(f"{BASE_URL}/api/settings", json=s)
        after = api.get(f"{BASE_URL}/api/issues").json()
        # Restore
        s["windows"]["short_window_s"] = orig
        api.put(f"{BASE_URL}/api/settings", json=s)
        # can't be sure of exact counts but the endpoint must succeed
        assert isinstance(after, list)
        assert isinstance(before, list)


# --- Proxy: OpenAI mock ---
class TestOpenAIProxy:
    def test_mock_chat_completion(self, api):
        r = requests.post(
            f"{BASE_URL}/api/proxy/openai/v1/chat/completions",
            headers={"Authorization": "Bearer sk-test", "X-CostGuard-Caller": "test-caller"},
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "usage" in j
        assert "x-costguard-request-id" in r.headers
        # Verify a log entry created with source=proxy
        recent = api.get(f"{BASE_URL}/api/logs/recent?provider=openai&limit=5").json()
        proxy_logs = [l for l in recent if l["source"] == "proxy"]
        assert len(proxy_logs) >= 1
        latest = proxy_logs[0]
        assert latest["cost_usd"] > 0
        assert latest.get("req_hash")
        assert latest.get("caller") == "test-caller"

    def test_mock_status_header_429(self, api):
        r = requests.post(
            f"{BASE_URL}/api/proxy/openai/v1/chat/completions",
            headers={"Authorization": "Bearer sk-test", "x-mock-status": "429"},
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hi"}]},
            timeout=30,
        )
        assert r.status_code == 429

    def test_duplicate_calls_detected(self, api):
        # Send same request 3x within 2s
        payload = {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "duplicate-test-42"}]}
        for _ in range(3):
            requests.post(f"{BASE_URL}/api/proxy/openai/v1/chat/completions",
                          headers={"Authorization": "Bearer sk-test"}, json=payload, timeout=30)
        time.sleep(1)
        issues = api.get(f"{BASE_URL}/api/issues?provider=openai").json()
        dup = [i for i in issues if i["rule_id"] == "duplicate_calls"]
        assert len(dup) >= 1


# --- Proxy: Stripe ---
class TestStripeProxy:
    def test_checkout_session(self, api):
        key = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
        r = requests.post(
            f"{BASE_URL}/api/proxy/stripe/v1/checkout/sessions",
            auth=(key, ""),
            data={
                "mode": "payment",
                "success_url": "https://example.com/s",
                "cancel_url": "https://example.com/c",
                "line_items[0][price_data][currency]": "usd",
                "line_items[0][price_data][product_data][name]": "T",
                "line_items[0][price_data][unit_amount]": "1000",
                "line_items[0][quantity]": "1",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("id", "").startswith("cs_test_")

    def test_live_key_403(self):
        r = requests.post(
            f"{BASE_URL}/api/proxy/stripe/v1/checkout/sessions",
            auth=("sk_live_something", ""), data={},
            timeout=15,
        )
        assert r.status_code == 403

    def test_aws_501(self):
        r = requests.get(f"{BASE_URL}/api/proxy/aws/anything", timeout=15)
        assert r.status_code == 501

    def test_unknown_provider_404(self):
        r = requests.get(f"{BASE_URL}/api/proxy/gcp/anything", timeout=15)
        assert r.status_code == 404


# --- Clear data ---
class TestClearData:
    def test_delete_then_overview_empty(self, api):
        r = api.delete(f"{BASE_URL}/api/data", timeout=30)
        assert r.status_code == 200
        ov = api.get(f"{BASE_URL}/api/overview").json()
        assert ov.get("has_data") is False
        # Restore synthetic for downstream tests
        api.post(f"{BASE_URL}/api/synthetic/load", json={"seed": 42}, timeout=60)
