from __future__ import annotations

import hashlib
import hmac

CURRENT_INGEST_KEY_VERSION = 1


def hash_ingest_key(key: str, pepper: str) -> str:
    """Return the versioned-storage format for an ingest key: HMAC-SHA256 hex."""
    return hmac.new(pepper.encode(), key.encode(), hashlib.sha256).hexdigest()
