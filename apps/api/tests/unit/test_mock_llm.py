import json
import time

import httpx
import pytest

from overcall.main import app
from overcall.mock_llm import mock_app


@pytest.mark.asyncio
async def test_chat_stream_emits_openai_chunks_and_optional_usage() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=mock_app),
        base_url="http://mock-llm",
    ) as client:
        response = await client.post(
            "/v1/chat/completions",
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": True,
                "stream_options": {"include_usage": True},
            },
        )
        without_usage = await client.post(
            "/v1/chat/completions",
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": True,
            },
        )

    events = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: {")
    ]
    events_without_usage = [
        json.loads(line[6:])
        for line in without_usage.text.splitlines()
        if line.startswith("data: {")
    ]
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "[DONE]" in response.text
    assert events[-1]["usage"]["total_tokens"] > 0
    assert all("usage" not in event for event in events_without_usage)


@pytest.mark.asyncio
async def test_chat_stream_preserves_each_choice_when_n_is_greater_than_one() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=mock_app),
        base_url="http://mock-llm",
    ) as client:
        response = await client.post(
            "/v1/chat/completions",
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": True,
                "n": 2,
            },
        )

    events = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: {")
    ]
    choice_indexes = {
        choice["index"] for event in events for choice in event.get("choices", [])
    }

    assert choice_indexes == {0, 1}
    assert all(
        any(choice["finish_reason"] == "stop" for choice in event["choices"])
        for event in events
        if event.get("choices") and event["choices"][0]["finish_reason"] is not None
    )
    assert "[DONE]" in response.text


@pytest.mark.asyncio
async def test_mock_failure_controls_retry_after_response_size_and_latency() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=mock_app),
        base_url="http://mock-llm",
    ) as client:
        started = time.perf_counter()
        throttled = await client.post(
            "/v1/chat/completions",
            headers={
                "X-Mock-Status": "429",
                "X-Mock-Retry-After": "3",
                "X-Mock-Latency-Ms": "50",
            },
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hello"}]},
        )
        elapsed = time.perf_counter() - started
        padded = await client.post(
            "/v1/chat/completions",
            headers={"X-Mock-Resp-Bytes": "2048"},
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hello"}]},
        )

    assert throttled.status_code == 429
    assert throttled.headers["retry-after"] == "3"
    assert elapsed >= 0.045
    assert len(padded.content) >= 2048
    assert padded.json()["choices"]


@pytest.mark.asyncio
async def test_stream_can_be_cut_after_requested_chunk_count() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=mock_app),
        base_url="http://mock-llm",
    ) as client:
        response = await client.post(
            "/v1/chat/completions",
            headers={"X-Mock-Drop-After-Chunks": "2"},
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": "hello"}],
                "stream": True,
            },
        )

    chunks = [line for line in response.text.splitlines() if line.startswith("data:")]
    assert len(chunks) == 2
    assert "[DONE]" not in response.text


@pytest.mark.asyncio
async def test_chat_content_is_request_deterministic_and_bad_input_is_openai_shaped() -> None:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=mock_app),
        base_url="http://mock-llm",
    ) as client:
        first = await client.post(
            "/v1/chat/completions",
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "first"}]},
        )
        second = await client.post(
            "/v1/chat/completions",
            json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "second"}]},
        )
        invalid = await client.post("/v1/chat/completions", json={"messages": []})

    first_json = first.json()
    second_json = second.json()
    first_content = first_json["choices"][0]["message"]["content"]
    second_content = second_json["choices"][0]["message"]["content"]
    assert first_content != second_content
    assert first_json["id"] != second_json["id"]
    assert invalid.status_code == 400
    assert invalid.json()["error"]["type"] == "invalid_request_error"


def test_mock_openai_routes_are_not_exposed_by_public_api() -> None:
    paths = {getattr(route, "path", "") for route in app.routes}

    assert "/v1/chat/completions" not in paths
    assert "/v1/embeddings" not in paths
    assert "/v1/models" not in paths
