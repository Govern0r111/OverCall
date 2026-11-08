from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from copy import copy
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from overcall import v1_api
from overcall.config import Settings
from overcall.db.models import DetectionRun, Issue, RequestLog, UserSettings
from overcall.deps import UserContext, get_current_user, get_db_session
from overcall.main import create_app
from overcall.pagination import (
    decode_cursor,
    decode_issue_cursor,
    encode_cursor,
    encode_issue_cursor,
)
from overcall.pricing import DEFAULT_PRICING_BOOK

ROOT = Path(__file__).resolve().parents[4]
USER_ID = UUID("f0f8b461-b1ab-48ae-90c4-e33dc490cb68")
NOW = datetime(2026, 1, 1, tzinfo=UTC)
LOG_ID = UUID("b658e496-d11c-4099-9eaa-2a034c854c10")
RUN_ID = UUID("aa588b48-30a6-42f6-8c8a-0b41e111da32")
ISSUE_ID = UUID("08bcb6d8-bf3a-41b9-b463-2326f74c6e21")


class FakeResult:
    def scalars(self):
        return self

    def all(self):
        return []

    def scalar_one(self):
        return 0


class FakeSession:
    def __init__(self, settings: Settings):
        self.info = {"app_settings": settings}
        self.added = []

    async def execute(self, _statement):
        return FakeResult()

    def add(self, item):
        self.added.append(item)

    def add_all(self, items):
        self.added.extend(items)

    async def flush(self):
        return None

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def refresh(self, _item):
        return None


def _settings_row() -> UserSettings:
    return UserSettings(
        user_id=USER_ID,
        currency="INR",
        usd_inr_rate=Decimal("83.5"),
        rules_enabled={},
        tier3_enabled=False,
        thresholds={},
        upstream_mode="mock",
        retention_days=14,
        created_at=NOW,
        updated_at=NOW,
    )


def _log_row() -> RequestLog:
    return RequestLog(
        id=LOG_ID,
        user_id=USER_ID,
        source="proxy",
        origin="upstream",
        occurred_at=NOW,
        provider="openai",
        method="POST",
        endpoint="/v1/chat/completions",
        status=200,
        latency_ms=20.0,
        ttfb_ms=4.0,
        req_size=30,
        resp_size=40,
        req_hash="abcdef1234567890",
        model="gpt-4o-mini",
        prompt_tokens=4,
        completion_tokens=2,
        tokens_estimated=False,
        stream=False,
        cost_usd=Decimal("0.001"),
        cost_basis="billed",
        pricing_version="2026-01-15",
        caller="checkout",
        has_idempotency_key=False,
        error_code=None,
    )


def _run_row() -> DetectionRun:
    return DetectionRun(
        id=RUN_ID,
        user_id=USER_ID,
        status="succeeded",
        started_at=NOW,
        finished_at=NOW,
        is_demo_data=False,
        window_start=NOW,
        window_end=NOW,
        window_days=Decimal("1"),
        projection_low_confidence=False,
        request_count=1,
        flagged_request_count=1,
        total_spend_usd=Decimal("0.001"),
        spend_savings_window_usd=Decimal("0.0005"),
        spend_savings_monthly_usd=Decimal("0.015"),
        experimental_monthly_usd=Decimal("0"),
        reliability_count=0,
        reliability_overhead_monthly_usd=Decimal("0"),
        issue_counts={"warning": 1},
        trend=[{"date": "2026-01-01", "spend_usd": 0.001, "waste_usd": 0.0005}],
    )


def _issue_row() -> Issue:
    return Issue(
        id=ISSUE_ID,
        user_id=USER_ID,
        run_id=RUN_ID,
        rule_id="duplicate_calls",
        tier=1,
        experimental=False,
        provider="openai",
        endpoint="/v1/chat/completions",
        severity="warning",
        impact_kind="spend",
        title="Duplicate calls",
        summary="Repeated request",
        explanation="The same request was repeated.",
        suggested_fix="Use a cache.",
        affected_count=1,
        window_savings_usd=Decimal("0.0005"),
        projected_monthly_usd=Decimal("0.015"),
        confidence=None,
        is_demo_data=False,
        detected_at=NOW,
    )


class FakeSettingsRepository:
    row = _settings_row()

    def __init__(self, _session, _user_id):
        pass

    async def get_or_create(self):
        return self.row

    async def update(self, values):
        for field, value in values.items():
            setattr(self.row, field, value)
        self.row.updated_at = NOW
        return self.row


class FakeRequestLogRepository:
    row = _log_row()

    def __init__(self, _session, _user_id):
        pass

    async def count(self, *, source=None, provider=None):
        if source == "demo":
            return 0
        if provider and provider != self.row.provider:
            return 0
        return 1

    async def list_logs(self, *, limit=200, source=None, **_kwargs):
        if source == "demo":
            return []
        return [self.row][:limit]

    async def list_window(self, _start, _end, *, source=None, **_kwargs):
        if source == "demo":
            return []
        return [self.row]

    async def get(self, log_id):
        return self.row if log_id == self.row.id else None

    async def delete_for_source(self, _source):
        return 0

    async def delete_all(self):
        return 1


class FakeIssueRepository:
    row = _issue_row()

    def __init__(self, _session, _user_id):
        pass

    async def list_issues(self, *, limit=200, include_experimental=False, **_kwargs):
        if self.row.tier == 3 and not include_experimental:
            return []
        return [self.row][:limit]

    async def list_for_run(self, run_id, *, is_demo_data=None):
        if self.row.run_id != run_id:
            return []
        if is_demo_data is not None and self.row.is_demo_data is not is_demo_data:
            return []
        return [self.row]

    async def get(self, issue_id):
        return self.row if issue_id == self.row.id else None

    async def delete_for_source(self, _source):
        return 0

    async def delete_all(self):
        return 1


class FakeDetectionRunRepository:
    row = _run_row()

    def __init__(self, _session, _user_id):
        pass

    async def latest(self, **_kwargs):
        return self.row

    async def get(self, _run_id):
        return None

    async def delete_for_source(self, _source):
        return 0

    async def delete_all(self):
        return 1


@pytest.fixture
def api_client(api_settings: Settings, monkeypatch) -> TestClient:
    monkeypatch.setattr(v1_api, "UserSettingsRepository", FakeSettingsRepository)
    monkeypatch.setattr(v1_api, "RequestLogRepository", FakeRequestLogRepository)
    monkeypatch.setattr(v1_api, "IssueRepository", FakeIssueRepository)
    monkeypatch.setattr(v1_api, "DetectionRunRepository", FakeDetectionRunRepository)
    app = create_app(api_settings)
    session = FakeSession(api_settings)
    app.state.test_session = session

    async def current_user():
        return UserContext(user_id=USER_ID, email="dev@example.test")

    async def db_session():
        yield session

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_db_session] = db_session
    with TestClient(app) as test_client:
        yield test_client


def test_v1_routes_are_registered_and_auth_dependency_is_fail_closed(
    client: TestClient,
) -> None:
    response = client.get("/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthenticated"

    app = create_app(Settings(app_env="test", database_url=None))
    for route in app.routes:
        path = getattr(route, "path", "")
        if path.startswith("/v1/"):
            assert any(
                dependency.call is get_current_user for dependency in route.dependant.dependencies
            ), f"{path} lacks the injected auth dependency"


def test_v1_endpoints_respond_at_runtime(api_client: TestClient) -> None:
    checks = [
        ("GET", "/v1/me", None, 200),
        ("GET", "/v1/overview", None, 200),
        ("GET", "/v1/issues", None, 200),
        ("GET", f"/v1/issues/{ISSUE_ID}", None, 200),
        ("GET", "/v1/logs?q=abcd", None, 200),
        ("GET", "/v1/logs/facets", None, 200),
        ("GET", f"/v1/logs/{LOG_ID}", None, 200),
        ("GET", "/v1/providers", None, 200),
        ("GET", "/v1/settings", None, 200),
        ("PUT", "/v1/settings", None, 200),
        ("POST", "/v1/settings/reset", {"confirm": True}, 200),
        ("GET", "/v1/rules", None, 200),
        ("POST", "/v1/detection/run", None, 200),
        ("GET", "/v1/detection/runs/latest", None, 200),
        ("GET", "/v1/accuracy", None, 403),
        ("POST", "/v1/demo/load", {"seed": 42, "days": 1}, 403),
        ("DELETE", "/v1/demo", None, 204),
        ("DELETE", "/v1/data", {"confirm": "delete my data"}, 204),
    ]
    settings_body = api_client.get("/v1/settings").json()
    settings_body.pop("updated_at")
    checks[9] = ("PUT", "/v1/settings", settings_body, 200)
    for method, path, body, expected_status in checks:
        response = api_client.request(method, path, json=body)
        assert response.status_code == expected_status, (
            method,
            path,
            response.status_code,
            response.text,
        )


def test_live_endpoints_exclude_synthetic_rows(api_client: TestClient, monkeypatch) -> None:
    live_log = _log_row()
    demo_log = copy(live_log)
    demo_log.id = uuid4()
    demo_log.source = "demo"
    demo_log.occurred_at = NOW + timedelta(days=1)
    unknown_log = copy(live_log)
    unknown_log.id = uuid4()
    unknown_log.source = "unknown"
    unknown_log.occurred_at = NOW + timedelta(days=2)
    logs = [live_log, demo_log, unknown_log]

    live_run = _run_row()
    demo_run = copy(live_run)
    demo_run.id = uuid4()
    demo_run.is_demo_data = True
    demo_run.started_at = NOW + timedelta(days=1)
    live_issue = _issue_row()
    demo_issue = copy(live_issue)
    demo_issue.id = uuid4()
    demo_issue.run_id = demo_run.id
    demo_issue.is_demo_data = True
    issues = [live_issue, demo_issue]
    runs = [live_run, demo_run]

    class MixedRequestLogs:
        def __init__(self, _session, _user_id):
            pass

        async def count(self, *, source=None, provider=None):
            return sum(
                (source is None or row.source == source)
                and (provider is None or row.provider == provider)
                for row in logs
            )

        async def list_logs(self, *, limit=200, source=None, provider=None, **_kwargs):
            rows = [
                row
                for row in logs
                if (source is None or row.source == source)
                and (provider is None or row.provider == provider)
            ]
            return sorted(rows, key=lambda row: row.occurred_at, reverse=True)[:limit]

        async def list_window(self, _start, _end, *, source=None, limit=200_000):
            return [row for row in logs if source is None or row.source == source][:limit]

        async def get(self, log_id):
            return next((row for row in logs if row.id == log_id), None)

    class MixedIssues:
        def __init__(self, _session, _user_id):
            pass

        async def list_issues(self, *, limit=200, is_demo_data=None, **_kwargs):
            rows = [
                row
                for row in issues
                if is_demo_data is None or row.is_demo_data is is_demo_data
            ]
            return rows[:limit]

        async def list_for_run(self, run_id, *, is_demo_data=None):
            return [
                row
                for row in issues
                if row.run_id == run_id
                and (is_demo_data is None or row.is_demo_data is is_demo_data)
            ]

        async def get(self, issue_id):
            return next((row for row in issues if row.id == issue_id), None)

    class MixedRuns:
        def __init__(self, _session, _user_id):
            pass

        async def latest(self, *, is_demo_data=None):
            selected = [
                row
                for row in runs
                if is_demo_data is None or row.is_demo_data is is_demo_data
            ]
            return max(selected, key=lambda row: row.started_at) if selected else None

    monkeypatch.setattr(v1_api, "RequestLogRepository", MixedRequestLogs)
    monkeypatch.setattr(v1_api, "IssueRepository", MixedIssues)
    monkeypatch.setattr(v1_api, "DetectionRunRepository", MixedRuns)
    session = api_client.app.state.test_session
    statements = []
    original_execute = session.execute

    async def record_statement(statement):
        statements.append(statement)
        return await original_execute(statement)

    monkeypatch.setattr(session, "execute", record_statement)

    me_response = api_client.get("/v1/me")
    assert me_response.status_code == 200
    me = me_response.json()
    assert me["has_data"] is True
    assert me["is_demo_data"] is False
    assert me["proxy_status"] == "receiving_traffic"
    assert me["last_request_at"].startswith("2026-01-01T")
    issue_count_query = next(statement for statement in statements if "issues" in str(statement))
    assert "issues.is_demo_data" in str(issue_count_query)

    overview = api_client.get("/v1/overview").json()
    assert overview["run_id"] == str(live_run.id)
    assert overview["is_demo_data"] is False

    issue_list = api_client.get("/v1/issues").json()
    assert [item["id"] for item in issue_list["items"]] == [str(live_issue.id)]
    assert api_client.get(f"/v1/issues/{demo_issue.id}").status_code == 404
    issue_sample_queries = [
        statement
        for statement in statements
        if "issue_requests" in str(statement) and "request_logs" in str(statement)
    ]
    assert issue_sample_queries
    assert all("request_logs.source" in str(statement) for statement in issue_sample_queries)

    log_list = api_client.get("/v1/logs?q=abcd").json()
    assert [item["id"] for item in log_list["items"]] == [str(live_log.id)]
    assert api_client.get(f"/v1/logs/{demo_log.id}").status_code == 404
    issue_detail_queries = [
        statement
        for statement in statements
        if "issue_requests" in str(statement) and "issues" in str(statement)
    ]
    assert issue_detail_queries
    assert all("issues.is_demo_data" in str(statement) for statement in issue_detail_queries)

    statements.clear()
    facets = api_client.get("/v1/logs/facets")
    assert facets.status_code == 200
    facet_queries = [statement for statement in statements if "request_logs" in str(statement)]
    assert len(facet_queries) == 4
    assert all("request_logs.source" in str(statement) for statement in facet_queries)

    providers = {row["id"]: row for row in api_client.get("/v1/providers").json()}
    assert providers["openai"]["status"] == "receiving_traffic"
    assert providers["openai"]["traffic"]["proxy"] == 1
    assert providers["openai"]["traffic"]["demo"] == 0
    latest_run = api_client.get("/v1/detection/runs/latest").json()
    assert latest_run["id"] == str(live_run.id)

    logs[:] = [demo_log, unknown_log]
    no_live_data = api_client.get("/v1/me").json()
    assert no_live_data["has_data"] is False
    assert no_live_data["last_request_at"] is None
    assert no_live_data["proxy_status"] == "no_key"
    assert no_live_data["is_demo_data"] is False


def test_detection_uses_live_rows_and_preserves_demo_history(
    api_client: TestClient, monkeypatch
) -> None:
    live_log = _log_row()
    demo_log = copy(live_log)
    demo_log.id = uuid4()
    demo_log.source = "demo"
    logs = [live_log, demo_log]
    demo_issue = _issue_row()
    demo_issue.is_demo_data = True
    issues = [demo_issue]
    calls = {"source": None, "deleted_source": None}

    class TrackingRequestLogs:
        def __init__(self, _session, _user_id):
            pass

        async def list_window(self, _start, _end, *, source=None, limit=200_000):
            calls["source"] = source
            return [row for row in logs if source is None or row.source == source][:limit]

    class TrackingIssues:
        def __init__(self, _session, _user_id):
            pass

        async def delete_for_source(self, source):
            calls["deleted_source"] = source
            issues[:] = [row for row in issues if row.is_demo_data is not (source == "demo")]
            return 0

        async def delete_all(self):
            calls["deleted_source"] = "all"
            issues.clear()
            return 0

    class TrackingRuns:
        def __init__(self, _session, _user_id):
            pass

        async def get(self, _run_id):
            return None

    monkeypatch.setattr(v1_api, "RequestLogRepository", TrackingRequestLogs)
    monkeypatch.setattr(v1_api, "IssueRepository", TrackingIssues)
    monkeypatch.setattr(v1_api, "DetectionRunRepository", TrackingRuns)
    monkeypatch.setattr(v1_api, "RULES", [])

    result = asyncio.run(
        v1_api._perform_detection(api_client.app.state.test_session, USER_ID)
    )

    assert calls == {"source": "proxy", "deleted_source": "proxy"}
    assert result.request_count == 1
    assert result.is_demo_data is False
    assert issues == [demo_issue]


def test_demo_and_accuracy_routes_are_rejected_for_authenticated_api_users(
    api_client: TestClient,
) -> None:
    responses = [
        api_client.post("/v1/demo/load", json={"seed": 42, "days": 1}),
        api_client.get("/v1/accuracy"),
    ]

    for response in responses:
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "forbidden"


def test_demo_only_routes_are_documented_with_forbidden_error_envelopes() -> None:
    contract = json.loads((ROOT / "contract" / "openapi.yaml").read_text(encoding="utf-8"))
    for path, method in (("/v1/demo/load", "post"), ("/v1/accuracy", "get")):
        operation = contract["paths"][path][method]
        assert "200" not in operation["responses"]
        response = operation["responses"]["403"]
        assert (
            response["content"]["application/json"]["schema"]["$ref"]
            == "#/components/schemas/ErrorResponse"
        )
        assert "x-response-model" not in operation


def test_provider_endpoint_exposes_active_versioned_pricing(api_client: TestClient) -> None:
    response = api_client.get("/v1/providers")

    assert response.status_code == 200
    providers = {provider["id"]: provider for provider in response.json()}
    assert set(providers) == {"openai", "stripe", "aws"}
    for provider_name in providers:
        expected = DEFAULT_PRICING_BOOK.for_time(provider_name, datetime.now(UTC))
        pricing = providers[provider_name]["pricing"]
        assert pricing["version"] == expected.version
        assert pricing["source_url"] == expected.source_url
        assert {row["label"]: row["usd_per_1m"] for row in pricing["rows"]} == {
            f"{model_name} input": float(model.input_per_1m)
            for model_name, model in expected.models.items()
        }


def test_detection_run_persists_database_status_and_returns_public_status(
    api_client: TestClient,
) -> None:
    latest = api_client.get("/v1/detection/runs/latest")
    assert latest.status_code == 200
    assert latest.json()["status"] == "completed"

    response = api_client.post("/v1/detection/run")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"

    persisted_runs = [
        item for item in api_client.app.state.test_session.added if isinstance(item, DetectionRun)
    ]
    assert len(persisted_runs) == 1
    assert persisted_runs[0].status == "succeeded"


def test_empty_overview_matches_contract_fixture(
    api_settings: Settings, client: TestClient, monkeypatch
) -> None:
    class NoRunRepository:
        def __init__(self, _session, _user_id):
            pass

        async def latest(self, **_kwargs):
            return None

    monkeypatch.setattr(v1_api, "DetectionRunRepository", NoRunRepository)
    app = client.app
    session = FakeSession(api_settings)

    async def current_user():
        return UserContext(user_id=USER_ID, email="dev@example.test")

    async def db_session():
        yield session

    app.dependency_overrides[get_current_user] = current_user
    app.dependency_overrides[get_db_session] = db_session
    fixture = json.loads(
        (ROOT / "contract" / "fixtures" / "api" / "overview.empty.json").read_text(encoding="utf-8")
    )
    response = client.get("/v1/overview")
    assert response.status_code == 200
    assert response.json() == fixture


def test_default_settings_response_matches_contract_fixture(
    api_settings: Settings, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(v1_api, "UserSettingsRepository", FakeSettingsRepository)
    session = FakeSession(api_settings)

    async def current_user():
        return UserContext(user_id=USER_ID, email="dev@example.test")

    async def db_session():
        yield session

    client.app.dependency_overrides[get_current_user] = current_user
    client.app.dependency_overrides[get_db_session] = db_session
    fixture = json.loads(
        (ROOT / "contract" / "fixtures" / "api" / "settings.default.json").read_text(
            encoding="utf-8"
        )
    )
    response = client.get("/v1/settings")
    assert response.status_code == 200
    assert response.json() == fixture


def test_contract_includes_generated_success_response_schemas() -> None:
    contract = json.loads((ROOT / "contract" / "openapi.yaml").read_text(encoding="utf-8"))
    generated = create_app(Settings(app_env="test", database_url=None)).openapi()

    assert contract.get("components", {}).get("schemas") == generated["components"]["schemas"]
    for path, operations in contract["paths"].items():
        for method, operation in operations.items():
            if method.startswith("x-"):
                continue
            generated_operation = generated["paths"][path][method]
            for status, response in operation["responses"].items():
                if not status.startswith("2"):
                    continue
                expected_content = generated_operation["responses"][status].get("content")
                assert response.get("content") == expected_content, (
                    method.upper(),
                    path,
                    status,
                )


def _response_shape_paths(value: object, prefix: str = "") -> list[str]:
    """Return object-property paths, marking array items with `[]`."""
    paths: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}/{key}"
            paths.append(path)
            paths.extend(_response_shape_paths(child, path))
    elif isinstance(value, list):
        path = f"{prefix}/[]"
        paths.append(path)
        for child in value:
            paths.extend(_response_shape_paths(child, path))
    return paths


def test_every_versioned_json_response_matches_contract_fixture_shape(
    api_client: TestClient,
) -> None:
    fixture_path = ROOT / "contract" / "fixtures" / "api" / "response-shapes.json"
    response_shapes = json.loads(fixture_path.read_text(encoding="utf-8"))
    contract = json.loads((ROOT / "contract" / "openapi.yaml").read_text(encoding="utf-8"))
    operations = {
        operation["operationId"]: operation
        for path, methods in contract["paths"].items()
        # Ingest-key responses have separate B10 lifecycle tests; 204s have no JSON model.
        if path.startswith("/v1/") and not path.startswith("/v1/ingest-keys")
        for operation in methods.values()
        if "x-response-model" in operation
    }

    settings_body = api_client.get("/v1/settings").json()
    settings_body.pop("updated_at")
    responses = {
        "get_me": api_client.get("/v1/me"),
        "get_overview": api_client.get("/v1/overview"),
        "list_issues": api_client.get("/v1/issues"),
        "get_issue": api_client.get(f"/v1/issues/{ISSUE_ID}"),
        "list_logs": api_client.get("/v1/logs?q=abcd"),
        "log_facets": api_client.get("/v1/logs/facets"),
        "get_log": api_client.get(f"/v1/logs/{LOG_ID}"),
        "providers": api_client.get("/v1/providers"),
        "get_settings": api_client.get("/v1/settings"),
        "update_settings": api_client.put("/v1/settings", json=settings_body),
        "reset_settings": api_client.post("/v1/settings/reset", json={"confirm": True}),
        "get_rules": api_client.get("/v1/rules"),
        "run_detection": api_client.post("/v1/detection/run"),
        "latest_detection_run": api_client.get("/v1/detection/runs/latest"),
    }

    blocked_operations = {"accuracy", "load_demo"}
    assert set(response_shapes) == set(operations) - blocked_operations == set(responses)
    for operation_id, response in responses.items():
        operation = operations[operation_id]
        assert response.status_code == 200, (
            operation_id,
            response.status_code,
            response.text,
        )
        actual_paths = sorted(set(_response_shape_paths(response.json())))
        assert actual_paths == response_shapes[operation_id], operation_id

        if operation.get("x-response-container") == "array":
            prefix = "/[]/"
            actual_properties = {
                path[len(prefix) :]
                for path in response_shapes[operation_id]
                if path.startswith(prefix) and "/" not in path[len(prefix) :]
            }
        else:
            actual_properties = {
                path[1:]
                for path in response_shapes[operation_id]
                if path.startswith("/") and path.count("/") == 1
            }
        assert actual_properties == set(operation["x-response-properties"]), operation_id


def test_cursor_is_keyset_encoded_and_tamper_safe() -> None:
    row_id = uuid4()
    token = encode_cursor(NOW, row_id)
    assert decode_cursor(token) == (NOW, row_id)
    with pytest.raises(Exception) as error:
        decode_cursor(token + "x")
    assert getattr(error.value, "code", None) == "invalid_cursor"
    issue_token = encode_issue_cursor("warning", "spend", "0.015", ISSUE_ID)
    assert decode_issue_cursor(issue_token) == (
        "warning",
        "spend",
        Decimal("0.015"),
        ISSUE_ID,
    )


def test_tier_three_issues_require_both_gate_and_explicit_opt_in(
    api_client: TestClient, monkeypatch
) -> None:
    experimental = _issue_row()
    experimental.tier = 3
    experimental.experimental = True
    monkeypatch.setattr(FakeIssueRepository, "row", experimental)
    settings = _settings_row()
    settings.tier3_enabled = False
    monkeypatch.setattr(FakeSettingsRepository, "row", settings)

    assert api_client.get("/v1/issues?include_experimental=true").json()["items"] == []
    assert api_client.get(f"/v1/issues/{experimental.id}").status_code == 404

    settings.tier3_enabled = True
    assert api_client.get("/v1/issues").json()["items"] == []
    assert len(api_client.get("/v1/issues?include_experimental=true").json()["items"]) == 1
    assert api_client.get(f"/v1/issues/{experimental.id}").status_code == 200


def test_rule_catalog_and_threshold_bounds_match_contract(api_client: TestClient) -> None:
    rules = json.loads((ROOT / "contract" / "rules.json").read_text(encoding="utf-8"))
    assert api_client.get("/v1/rules").json() == rules

    thresholds = json.loads((ROOT / "contract" / "thresholds.json").read_text(encoding="utf-8"))
    from overcall.api_schemas import Thresholds

    assert Thresholds().model_dump() == {
        name: definition["default"] for name, definition in thresholds.items()
    }
    for name, definition in thresholds.items():
        Thresholds.model_validate({name: definition["min"]})
        Thresholds.model_validate({name: definition["max"]})


def test_contract_drift_script_passes() -> None:
    script = ROOT / "apps" / "api" / "scripts" / "check_contract.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
