from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from overcall.db.models import DetectionRun, Issue, RequestLog, UserSettings
from overcall.db.repos import (
    DetectionRunRepository,
    IssueRepository,
    RequestLogRepository,
    UserSettingsRepository,
)
from overcall.deps import get_db_session
from overcall.errors import OvercallError


class FakeResult:
    rowcount = 0

    def __init__(self, rows: list[object] | None = None, one: object | None = None) -> None:
        self.rows = rows or []
        self.one = one

    def scalars(self) -> FakeResult:
        return self

    def all(self) -> list[object]:
        return self.rows

    def scalar_one_or_none(self) -> object | None:
        return self.one


class FakeSession:
    def __init__(self, *results: FakeResult) -> None:
        self.results = list(results)
        self.statements = []
        self.added = []
        self.flush_count = 0

    async def execute(self, statement):
        self.statements.append(statement)
        if self.results:
            return self.results.pop(0)
        return FakeResult()

    async def get(self, model, key):
        return self.results.pop(0).one if self.results else None

    def add(self, entity) -> None:
        self.added.append(entity)

    async def flush(self) -> None:
        self.flush_count += 1


def _compiled(statement) -> tuple[str, dict[str, object]]:
    compiled = statement.compile(dialect=postgresql.dialect())
    return str(compiled), compiled.params


def test_request_log_list_is_tenant_scoped_keyset_paginated_and_parameterized() -> None:
    user_id = uuid4()
    cursor_id = uuid4()
    cursor_time = datetime(2026, 11, 6, tzinfo=UTC)
    session = FakeSession(FakeResult())

    logs = asyncio.run(
        RequestLogRepository(session, user_id).list_logs(
            limit=50,
            cursor=(cursor_time, cursor_id),
            endpoint="/v1/chat/completions",
            query=r"%_ OR 1=1",
        )
    )

    assert logs == []
    sql, params = _compiled(session.statements[0])
    assert "request_logs.user_id =" in sql
    assert "request_logs.occurred_at <" in sql
    assert "request_logs.id <" in sql
    assert "ILIKE" in sql
    assert user_id in params.values()
    assert cursor_id in params.values()
    assert any(value == r"%\%\_ OR 1=1%" for value in params.values())
    assert "/v1/chat/completions" in params.values()
    assert " OR 1=1" not in sql


def test_request_log_window_is_scoped_and_ordered_deterministically() -> None:
    user_id = uuid4()
    session = FakeSession(FakeResult())
    start = datetime(2026, 11, 1, tzinfo=UTC)
    end = datetime(2026, 11, 6, tzinfo=UTC)

    asyncio.run(RequestLogRepository(session, user_id).list_window(start, end))

    sql, params = _compiled(session.statements[0])
    assert "request_logs.user_id =" in sql
    assert "request_logs.occurred_at >= " in sql
    assert "request_logs.occurred_at <= " in sql
    assert "ORDER BY request_logs.occurred_at ASC, request_logs.id ASC" in sql
    assert user_id in params.values()
    assert 200_000 in params.values()


def test_request_log_window_enforces_the_detection_row_cap() -> None:
    repository = RequestLogRepository(FakeSession(), uuid4())

    with pytest.raises(ValueError, match="between 1 and 200000"):
        asyncio.run(
            repository.list_window(
                datetime(2026, 11, 1, tzinfo=UTC),
                datetime(2026, 11, 6, tzinfo=UTC),
                limit=200_001,
            )
        )


def test_request_log_source_delete_rejects_unknown_source() -> None:
    session = FakeSession()

    with pytest.raises(ValueError, match="source must be"):
        asyncio.run(RequestLogRepository(session, uuid4()).delete_for_source("other"))

    assert session.statements == []


def test_issue_list_hides_experimental_rows_by_default_and_scopes_owner() -> None:
    user_id = uuid4()
    session = FakeSession(FakeResult())

    asyncio.run(IssueRepository(session, user_id).list_issues(limit=20))

    sql, params = _compiled(session.statements[0])
    assert "issues.user_id =" in sql
    assert "issues.tier !=" in sql
    assert "issues.experimental IS false" in sql
    assert user_id in params.values()


def test_issue_list_for_run_can_exclude_demo_data() -> None:
    user_id = uuid4()
    run_id = uuid4()
    session = FakeSession(FakeResult())

    asyncio.run(
        IssueRepository(session, user_id).list_for_run(run_id, is_demo_data=False)
    )

    sql, params = _compiled(session.statements[0])
    assert "issues.user_id =" in sql
    assert "issues.run_id =" in sql
    assert "issues.is_demo_data IS false" in sql
    assert user_id in params.values()
    assert run_id in params.values()


def test_issue_experimental_gate_can_be_enabled_explicitly() -> None:
    session = FakeSession(FakeResult())
    asyncio.run(IssueRepository(session, uuid4()).list_issues(limit=20, include_experimental=True))

    sql, _ = _compiled(session.statements[0])
    assert "issues.tier !=" not in sql
    assert "issues.experimental IS false" not in sql


def test_latest_run_query_is_owner_scoped_and_deterministic() -> None:
    user_id = uuid4()
    session = FakeSession(FakeResult())

    asyncio.run(DetectionRunRepository(session, user_id).latest(is_demo_data=False))

    sql, params = _compiled(session.statements[0])
    assert "detection_runs.user_id =" in sql
    assert "detection_runs.is_demo_data IS false" in sql
    assert "ORDER BY detection_runs.started_at DESC, detection_runs.id DESC" in sql
    assert user_id in params.values()
    assert "LIMIT" in sql


def test_source_deletes_are_owner_scoped_and_map_demo_data_explicitly() -> None:
    user_id = uuid4()
    session = FakeSession(FakeResult())

    asyncio.run(IssueRepository(session, user_id).delete_for_source("demo"))

    sql, params = _compiled(session.statements[0])
    assert "DELETE FROM issues" in sql
    assert "issues.user_id =" in sql
    assert "issues.is_demo_data IS true" in sql
    assert user_id in params.values()


def test_source_delete_rejects_unknown_source() -> None:
    session = FakeSession()

    with pytest.raises(ValueError, match="source must be"):
        asyncio.run(DetectionRunRepository(session, uuid4()).delete_for_source("other"))

    assert session.statements == []


def test_insert_always_uses_repository_owner_and_flushes_without_commit() -> None:
    owner_id = uuid4()
    supplied_id = uuid4()
    run = DetectionRun(
        user_id=supplied_id,
        status="succeeded",
        is_demo_data=False,
    )
    session = FakeSession()

    saved = asyncio.run(DetectionRunRepository(session, owner_id).add(run))

    assert saved is run
    assert run.user_id == owner_id
    assert session.added == [run]
    assert session.flush_count == 1


def test_settings_update_rejects_identity_fields_before_writing() -> None:
    session = FakeSession()
    repository = UserSettingsRepository(session, uuid4())

    with pytest.raises(ValueError, match="Unsupported settings fields"):
        asyncio.run(repository.update({"user_id": uuid4()}))

    assert session.statements == []
    assert session.flush_count == 0


def test_database_dependency_fails_closed_without_engine() -> None:
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(engine=None)))

    async def resolve_dependency() -> None:
        await anext(get_db_session(request))

    with pytest.raises(OvercallError, match="not ready"):
        asyncio.run(resolve_dependency())


def test_database_dependency_yields_and_closes_request_scoped_session(monkeypatch) -> None:
    engine = object()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(engine=engine)))
    state = SimpleNamespace(closed=False)

    class FakeAsyncSession:
        def __init__(self, bind, *, expire_on_commit):
            assert bind is engine
            assert expire_on_commit is False

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc_value, traceback):
            state.closed = True

    monkeypatch.setattr("overcall.deps.AsyncSession", FakeAsyncSession)

    async def resolve_dependency() -> object:
        dependency = get_db_session(request)
        session = await anext(dependency)
        await dependency.aclose()
        return session

    session = asyncio.run(resolve_dependency())
    assert isinstance(session, FakeAsyncSession)
    assert state.closed is True


def test_repository_models_expose_tenant_ownership_field() -> None:
    for model in (UserSettings, RequestLog, Issue, DetectionRun):
        assert "user_id" in model.model_fields
        assert model.__table__.columns["user_id"].nullable is False


def test_user_settings_get_or_create_uses_conflict_safe_insert() -> None:
    user_id = uuid4()
    settings = UserSettings(user_id=user_id)
    session = FakeSession(FakeResult(), FakeResult(one=settings))

    result = asyncio.run(UserSettingsRepository(session, user_id).get_or_create())

    assert result is settings
    sql, params = _compiled(session.statements[0])
    assert "ON CONFLICT (user_id) DO NOTHING" in sql
    assert user_id in params.values()
