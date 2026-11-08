import io
import logging
import random
import string

from overcall.logging import (
    JsonFormatter,
    RedactionFilter,
    redact,
    reset_request_id,
    set_request_id,
)


def test_log_messages_and_exceptions_redact_credentials() -> None:
    test_key = "sk" + "_test_1234567890ABCDEF"
    ingest_key = "oc" + "_abcdefghijklmnopqrstuvwxyz0123456789"
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
        raise RuntimeError(f"Authorization: Bearer {test_key} {ingest_key}")
    except RuntimeError:
        logger.exception("failed request; token=abcdefghijklmno")

    output = stream.getvalue()
    assert "abcdefghijklmnopqrstuvwxyz012345" not in output
    assert test_key not in output
    assert ingest_key not in output
    assert "abcdefghijklmno" not in output
    assert "[REDACTED]" in output


def test_redactor_covers_proxy_credential_formats() -> None:
    test_key = "sk" + "_test_1234567890ABCDEF"
    project_key = "sk" + "-proj-abcdefghijklmnop1234"
    ingest_key = "oc" + "_abcdefghijklmnopqrstuvwxyz0123456789"
    secrets = (
        test_key,
        project_key,
        ingest_key,
        f"Authorization: Bearer {project_key}",
        f"token={test_key}",
    )

    for secret in secrets:
        assert secret not in redact(f"header={secret}")

    jwt = "ey" + "J" + "a" * 16 + "." + "b" * 16 + "." + "c" * 8
    assert jwt not in redact(f"authorization={jwt}")


def test_randomized_credentials_are_redacted_from_request_ids_and_messages() -> None:
    generator = random.Random(20261107)
    alphabet = string.ascii_letters + string.digits

    def random_segment(length: int) -> str:
        return "".join(generator.choices(alphabet, k=length))

    secrets = [
        "sk" + "-proj-" + random_segment(32),
        "sk" + "_test_" + random_segment(32),
        "oc" + "_" + random_segment(32),
        "ey" + "J" + random_segment(16) + "." + random_segment(16) + "." + random_segment(16),
        "Bearer " + random_segment(32),
        "token=" + random_segment(32),
    ]

    formatter = JsonFormatter()
    redaction_filter = RedactionFilter()
    for secret in secrets:
        request_id_token = set_request_id(secret)
        try:
            record = logging.LogRecord(
                "overcall.redaction.fuzz",
                logging.INFO,
                __file__,
                1,
                "request handled with credential %s",
                (secret,),
                None,
            )
            redaction_filter.filter(record)
            output = formatter.format(record)
        finally:
            reset_request_id(request_id_token)

        assert secret not in output


def test_uri_passwords_are_redacted_with_or_without_a_username() -> None:
    credentials = (
        (
            "postgresql+asyncpg://overcall:db-pass-sentinel@db.example.test:5432/overcall",
            "db-pass-sentinel",
        ),
        ("redis://:cache-pass-sentinel@cache.example.test:6379/0", "cache-pass-sentinel"),
    )

    for uri, password in credentials:
        redacted = redact(uri)
        assert password not in redacted
        assert "[REDACTED]@" in redacted
