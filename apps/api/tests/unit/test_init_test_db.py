import asyncio

from scripts import init_test_db


class FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None


class FakeConnection:
    def __init__(self) -> None:
        self.statements: list[str] = []
        self.closed = False

    def transaction(self) -> FakeTransaction:
        return FakeTransaction()

    async def execute(self, statement: str) -> None:
        self.statements.append(statement)

    async def close(self) -> None:
        self.closed = True


def test_initialize_applies_every_migration_in_order(monkeypatch, tmp_path) -> None:
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    migration_sql = (
        ("20261022140000_init.sql", "initial schema"),
        ("20261022140100_rls_retention.sql", "row policies"),
        ("20261106170000_retention_purge.sql", "purge function"),
    )
    for filename, sql in migration_sql:
        (migrations / filename).write_text(sql, encoding="utf-8")

    auth_sql = tmp_path / "tests" / "sql" / "00_auth_stub.sql"
    auth_sql.parent.mkdir(parents=True)
    auth_sql.write_text("auth schema", encoding="utf-8")
    connection = FakeConnection()

    async def connect(url: str) -> FakeConnection:
        assert url == "postgresql://127.0.0.1:54322/postgres"
        return connection

    monkeypatch.setattr(init_test_db, "MIGRATIONS", migrations)
    monkeypatch.setattr(init_test_db, "API_ROOT", tmp_path)
    monkeypatch.setattr(init_test_db.asyncpg, "connect", connect)
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql://127.0.0.1:54322/postgres")

    asyncio.run(init_test_db.initialize())

    assert connection.statements == [
        "auth schema",
        "initial schema",
        "row policies",
        "purge function",
    ]
    assert connection.closed
