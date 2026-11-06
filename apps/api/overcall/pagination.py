from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from .config import get_settings
from .errors import OvercallError

_LOCAL_CURSOR_KEY = secrets.token_bytes(32)


def _key() -> bytes:
    settings = get_settings()
    if settings.ingest_key_pepper is not None:
        return settings.ingest_key_pepper.get_secret_value().encode()
    return _LOCAL_CURSOR_KEY


def encode_cursor(occurred_at: datetime, row_id: UUID) -> str:
    payload = json.dumps([occurred_at.isoformat(), str(row_id)], separators=(",", ":")).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(_key(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def decode_cursor(token: str) -> tuple[datetime, UUID]:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(_key(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        value = json.loads(payload)
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError("invalid payload")
        return datetime.fromisoformat(value[0]), UUID(value[1])
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise OvercallError("invalid_cursor", 400, "The pagination cursor is invalid.") from exc


def encode_issue_cursor(
    severity: str, impact_kind: str, projected_monthly_usd: str, row_id: UUID
) -> str:
    payload = json.dumps(
        [severity, impact_kind, projected_monthly_usd, str(row_id)],
        separators=(",", ":"),
    ).encode()
    encoded = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(_key(), encoded.encode(), hashlib.sha256).hexdigest()
    return f"{encoded}.{signature}"


def decode_issue_cursor(token: str) -> tuple[str, str, Decimal, UUID]:
    try:
        encoded, signature = token.split(".", 1)
        expected = hmac.new(_key(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("invalid signature")
        payload = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        value = json.loads(payload)
        if not isinstance(value, list) or len(value) != 4:
            raise ValueError("invalid payload")
        severity, impact_kind, amount, row_id = value
        if severity not in {"critical", "warning", "info"}:
            raise ValueError("invalid severity")
        if impact_kind not in {"spend", "reliability"}:
            raise ValueError("invalid impact kind")
        return severity, impact_kind, Decimal(amount), UUID(row_id)
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise OvercallError("invalid_cursor", 400, "The pagination cursor is invalid.") from exc
