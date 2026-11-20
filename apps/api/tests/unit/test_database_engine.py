import asyncio

from overcall.config import Settings
from overcall.db.engine import create_database_engine


def test_database_engine_disables_prepared_statement_cache_for_pooler() -> None:
    engine = create_database_engine(
        Settings(
            database_url="postgresql://user:password@db.example.test:5432/overcall"
        )
    )
    assert engine is not None

    try:
        _, connect_args = engine.sync_engine.dialect.create_connect_args(
            engine.sync_engine.url
        )
        assert connect_args["prepared_statement_cache_size"] == 0
    finally:
        asyncio.run(engine.dispose())
