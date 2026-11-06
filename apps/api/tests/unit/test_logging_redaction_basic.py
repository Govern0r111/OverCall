import io
import logging

from overcall.logging import JsonFormatter, RedactionFilter, redact


def test_log_messages_and_exceptions_redact_credentials() -> None:
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.addFilter(RedactionFilter())
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("overcall.redaction.test")
    logger.handlers.clear()
    logger.propagate = False
    logger.setLevel(logging.DEBUG)
    logger.addHandler(handler)

    try:
        raise RuntimeError(
            "Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345 "
            "sk_test_1234567890ABCDEF oc_abcdefghijklmnopqrstuvwxyz0123456789"
        )
    except RuntimeError:
        logger.exception("failed request; token=abcdefghijklmno")

    output = stream.getvalue()
    assert "abcdefghijklmnopqrstuvwxyz012345" not in output
    assert "sk_test_1234567890ABCDEF" not in output
    assert "oc_abcdefghijklmnopqrstuvwxyz0123456789" not in output
    assert "abcdefghijklmno" not in output
    assert "[REDACTED]" in output


def test_redactor_covers_proxy_credential_formats() -> None:
    secrets = (
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature12345678",
        "sk_test_1234567890ABCDEF",
        "sk-proj-abcdefghijklmnop1234",
        "oc_abcdefghijklmnopqrstuvwxyz0123456789",
        "Authorization: Bearer abcdefghijklmnop",
        "token=abcdefghijklmno",
    )

    for secret in secrets:
        assert secret not in redact(f"header={secret}")

    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature12345678"
    assert jwt not in redact(f"authorization={jwt}")
