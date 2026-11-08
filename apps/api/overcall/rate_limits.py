from __future__ import annotations

from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


class InMemoryRateLimiter:
    """Bounded token-bucket rate limiter for a single API process."""

    def __init__(
        self,
        *,
        max_entries: int = 10_000,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be greater than zero")
        self._max_entries = max_entries
        self._clock = clock
        self._buckets: OrderedDict[str, _Bucket] = OrderedDict()

    def consume(self, key: str, *, limit: int, period_seconds: float) -> float | None:
        self._validate(limit, period_seconds)
        now = self._clock()
        bucket = self._buckets.get(key)
        if bucket is None:
            self._make_room()
            bucket = _Bucket(tokens=float(limit), updated_at=now)
            self._buckets[key] = bucket
        else:
            self._refill(bucket, limit=limit, period_seconds=period_seconds, now=now)
            self._buckets.move_to_end(key)

        if bucket.tokens >= 1:
            bucket.tokens -= 1
            return None
        return self._retry_after(bucket, limit=limit, period_seconds=period_seconds)

    def retry_after(self, key: str, *, limit: int, period_seconds: float) -> float | None:
        self._validate(limit, period_seconds)
        bucket = self._buckets.get(key)
        if bucket is None:
            return None
        self._refill(
            bucket,
            limit=limit,
            period_seconds=period_seconds,
            now=self._clock(),
        )
        self._buckets.move_to_end(key)
        if bucket.tokens >= 1:
            return None
        return self._retry_after(bucket, limit=limit, period_seconds=period_seconds)

    def _make_room(self) -> None:
        if len(self._buckets) >= self._max_entries:
            self._buckets.popitem(last=False)

    @staticmethod
    def _validate(limit: int, period_seconds: float) -> None:
        if limit < 1:
            raise ValueError("limit must be greater than zero")
        if period_seconds <= 0:
            raise ValueError("period_seconds must be greater than zero")

    @staticmethod
    def _refill(
        bucket: _Bucket,
        *,
        limit: int,
        period_seconds: float,
        now: float,
    ) -> None:
        elapsed = max(0.0, now - bucket.updated_at)
        bucket.tokens = min(float(limit), bucket.tokens + elapsed * limit / period_seconds)
        bucket.updated_at = now

    @staticmethod
    def _retry_after(bucket: _Bucket, *, limit: int, period_seconds: float) -> float:
        return (1 - bucket.tokens) * period_seconds / limit
