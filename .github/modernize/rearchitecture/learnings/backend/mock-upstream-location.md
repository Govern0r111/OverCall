# Mock Upstream Location

The in-process mock upstream lives in `apps/api/overcall/mock_llm.py` and is called through the proxy's httpx ASGI transport.

## What Happened

For OverCall task t13, `docs/PLAN.md` B7 listed legacy `overcall/mock_openai/{app,tokens}.py` paths, while the repository implementation was `overcall/mock_llm.py`. The named proxy integration test exercised the real mock app through `httpx.ASGITransport` and passed.

## Takeaway

When verifying B7 behavior, use `apps/api/overcall/mock_llm.py` and `apps/api/tests/integration/test_proxy_persistence.py`; do not assume the old path list exists. Verify transport and feature-specific tests separately.

## History
- 2026-11-06 (OverCall/t13): initial
