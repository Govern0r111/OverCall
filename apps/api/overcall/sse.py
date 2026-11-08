import codecs
import json
import math
from typing import Any

from .pricing import Usage

_MAX_COMPLETION_CHARS = 100_000


class SSEParser:
    def __init__(self) -> None:
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self._buffer = ""
        self._data_lines: list[str] = []

    def feed(self, chunk: bytes) -> list[str]:
        self._buffer += self._decoder.decode(chunk)
        return self._drain(final=False)

    def finish(self) -> list[str]:
        self._buffer += self._decoder.decode(b"", final=True)
        events = self._drain(final=True)
        if self._buffer:
            self._consume_line(self._buffer, events)
            self._buffer = ""
        self._dispatch(events)
        return events

    def _drain(self, *, final: bool) -> list[str]:
        events: list[str] = []
        while True:
            separator = next(
                (index for index, character in enumerate(self._buffer) if character in "\r\n"),
                None,
            )
            if separator is None:
                break
            if (
                self._buffer[separator] == "\r"
                and separator == len(self._buffer) - 1
                and not final
            ):
                break
            width = (
                2
                if self._buffer[separator : separator + 2] == "\r\n"
                else 1
            )
            line = self._buffer[:separator]
            self._buffer = self._buffer[separator + width :]
            self._consume_line(line, events)
        return events

    def _consume_line(self, line: str, events: list[str]) -> None:
        if not line:
            self._dispatch(events)
            return
        if line.startswith(":"):
            return
        field, separator, value = line.partition(":")
        if field == "data":
            if separator and value.startswith(" "):
                value = value[1:]
            self._data_lines.append(value)

    def _dispatch(self, events: list[str]) -> None:
        if self._data_lines:
            events.append("\n".join(self._data_lines))
            self._data_lines.clear()


class SSEUsageTracker:
    def __init__(self, request_body: bytes) -> None:
        self._parser = SSEParser()
        try:
            body = json.loads(request_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {}
        self._request = body if isinstance(body, dict) else {}
        self._usage: Usage | None = None
        self._completion_text = ""
        self._completion_chars = 0

    def feed(self, chunk: bytes) -> None:
        for event in self._parser.feed(chunk):
            self._consume_event(event)

    def finish(self) -> None:
        for event in self._parser.finish():
            self._consume_event(event)

    def usage(self) -> Usage:
        if self._usage is not None:
            return self._usage
        model = str(self._request.get("model") or "")
        messages = self._request.get("messages")
        prompt_tokens = 2
        if isinstance(messages, list):
            for message in messages:
                if isinstance(message, dict):
                    prompt_tokens += _count_tokens(_stringify(message.get("role")), model)
                    prompt_tokens += _count_tokens(_stringify(message.get("content")), model)
                    prompt_tokens += 4
        completion_tokens = self._estimate_completion_tokens(model)
        return Usage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            tokens_estimated=True,
        )

    def _consume_event(self, raw_event: str) -> None:
        if raw_event == "[DONE]":
            return
        try:
            event = json.loads(raw_event)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return
        if not isinstance(event, dict):
            return

        usage = event.get("usage")
        response = event.get("response")
        if not isinstance(usage, dict) and isinstance(response, dict):
            usage = response.get("usage")
        parsed_usage = _parse_usage(usage)
        if parsed_usage is not None:
            self._usage = parsed_usage

        self._capture_completion(event)

    def _capture_completion(self, event: dict[str, Any]) -> None:
        for choice in event.get("choices", []):
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta")
            if not isinstance(delta, dict):
                delta = choice.get("message")
            if isinstance(delta, dict):
                self._append_text(delta.get("content"))
            self._append_text(choice.get("text"))

        if event.get("type") == "response.output_text.delta":
            self._append_text(event.get("delta"))
        response = event.get("response")
        if isinstance(response, dict):
            self._append_text(response.get("output_text"))

    def _append_text(self, value: Any) -> None:
        if not isinstance(value, str):
            return
        self._completion_chars += len(value)
        remaining = _MAX_COMPLETION_CHARS - len(self._completion_text)
        if remaining > 0:
            self._completion_text += value[:remaining]

    def _estimate_completion_tokens(self, model: str) -> int:
        if not self._completion_text:
            return 0
        estimated = _count_tokens(self._completion_text, model)
        if self._completion_chars > len(self._completion_text):
            estimated = math.ceil(
                estimated * self._completion_chars / len(self._completion_text)
            )
        return estimated


def _parse_usage(value: Any) -> Usage | None:
    if not isinstance(value, dict):
        return None
    prompt = value.get("prompt_tokens", value.get("input_tokens"))
    completion = value.get("completion_tokens", value.get("output_tokens"))
    if not _is_token_count(prompt) or not _is_token_count(completion):
        return None
    prompt_details = value.get("prompt_tokens_details")
    if not isinstance(prompt_details, dict):
        prompt_details = value.get("input_tokens_details")
    cached = prompt_details.get("cached_tokens", 0) if isinstance(prompt_details, dict) else 0
    if not _is_token_count(cached):
        cached = 0
    return Usage(
        prompt_tokens=prompt,
        completion_tokens=completion,
        cached_prompt_tokens=cached,
        tokens_estimated=False,
    )


def _is_token_count(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) if value is not None else ""


def _count_tokens(text: str, model: str) -> int:
    if not text:
        return 0
    try:
        import tiktoken
    except ImportError:
        return math.ceil(len(text) / 4)

    uses_legacy_encoding = model.startswith(
        ("gpt-3.5", "gpt-4", "text-davinci", "code-davinci")
    ) and not model.startswith(("gpt-4o", "gpt-4.1"))
    encoding_name = "cl100k_base" if uses_legacy_encoding else "o200k_base"
    try:
        encoding = tiktoken.get_encoding(encoding_name)
    except ValueError:
        return math.ceil(len(text) / 4)
    return len(encoding.encode(text))
