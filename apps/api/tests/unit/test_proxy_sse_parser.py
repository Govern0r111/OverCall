import json

from overcall.pricing import Usage
from overcall.sse import SSEParser, SSEUsageTracker


def test_sse_parser_handles_every_boundary_crlf_comments_and_multiline_data() -> None:
    stream = (
        ': keep-alive\r\n'
        'data: {"message":"café"}\r\n'
        "data: second line\r\n"
        "\r\n"
        "data: [DONE]\r\n\r\n"
    ).encode()
    expected = ['{"message":"café"}\nsecond line', "[DONE]"]

    for split in range(len(stream) + 1):
        parser = SSEParser()
        events = parser.feed(stream[:split])
        events.extend(parser.feed(stream[split:]))
        events.extend(parser.finish())
        assert events == expected


def test_stream_usage_uses_latest_chat_usage_event() -> None:
    tracker = SSEUsageTracker(
        json.dumps(
            {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "hello"}]}
        ).encode()
    )
    tracker.feed(
        b'data: {"choices":[{"delta":{"content":"hello"},"index":0}]}\n\n'
    )
    tracker.feed(
        b'data: {"usage":{"prompt_tokens":5,"completion_tokens":2,'
        b'"prompt_tokens_details":{"cached_tokens":0}}}\n\n'
    )
    tracker.feed(
        b'data: {"usage":{"prompt_tokens":12,"completion_tokens":4,'
        b'"prompt_tokens_details":{"cached_tokens":3}}}\n\n'
    )

    assert tracker.usage() == Usage(
        prompt_tokens=12,
        completion_tokens=4,
        cached_prompt_tokens=3,
        tokens_estimated=False,
    )


def test_stream_usage_reads_response_api_usage_and_estimates_when_absent() -> None:
    request = json.dumps(
        {"model": "gpt-4o", "messages": [{"role": "user", "content": "hello"}]}
    ).encode()
    response_tracker = SSEUsageTracker(request)
    response_tracker.feed(
        b'data: {"response":{"usage":{"input_tokens":10,"output_tokens":5,'
        b'"input_tokens_details":{"cached_tokens":2}}}}\n\n'
    )
    estimated_tracker = SSEUsageTracker(request)
    estimated_tracker.feed(
        b'data: {"choices":[{"delta":{"content":"mock answer"},"index":0}]}\n\n'
    )

    assert response_tracker.usage() == Usage(
        prompt_tokens=10,
        completion_tokens=5,
        cached_prompt_tokens=2,
        tokens_estimated=False,
    )
    estimate = estimated_tracker.usage()
    assert estimate.tokens_estimated is True
    assert estimate.prompt_tokens > 0
    assert estimate.completion_tokens > 0
