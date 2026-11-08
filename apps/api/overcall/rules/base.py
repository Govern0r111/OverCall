from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

from ..models import RequestLog
from ..pricing_config import is_ok  # noqa: F401  (re-exported for rules)

PROVIDER_LABEL = {"openai": "OpenAI", "stripe": "Stripe", "aws": "AWS"}


@dataclass
class Finding:
    issue_type: str
    severity: str
    provider: str
    endpoint: str
    title: str
    summary: str
    explanation: str
    suggested_fix: str
    affected: list[RequestLog]
    waste_by_request: dict[str, float]
    confidence: float = 1.0
    impact_kind: Literal["spend", "reliability"] = "spend"

    @property
    def estimated_savings(self) -> float:
        return sum(self.waste_by_request.values())


@dataclass
class RuleContext:
    w: object
    window_days: float
    _source_logs: list[RequestLog] | None = field(default=None, init=False, repr=False)
    _filtered_logs: list[RequestLog] | None = field(default=None, init=False, repr=False)

    def monthly(self, usd: float) -> float:
        return usd * 30 / self.window_days

    def filter_logs(self, logs: list[RequestLog]) -> list[RequestLog]:
        if logs is not self._source_logs:
            self._source_logs = logs
            self._filtered_logs = eligible_logs(logs)
        if self._filtered_logs is None:
            raise RuntimeError("RuleContext failed to prepare eligible logs")
        return self._filtered_logs


class Rule(ABC):
    id: str
    name: str
    tier: int
    description: str
    default_enabled = True
    threshold_keys: tuple[str, ...] = ()

    @abstractmethod
    def detect(self, logs: list[RequestLog], ctx: RuleContext) -> list[Finding]:
        ...


def gap_s(a: RequestLog, b: RequestLog) -> float:
    return (b.timestamp - a.timestamp).total_seconds()


def group_by(items, key) -> dict:
    out: dict = {}
    for it in items:
        out.setdefault(key(it), []).append(it)
    return out


def by_endpoint(flagged: list[RequestLog]) -> dict:
    return group_by(flagged, lambda log: (log.provider, log.endpoint))


def eligible_logs(logs: list[RequestLog]) -> list[RequestLog]:
    """Return supported upstream rows in deterministic rule-evaluation order."""
    eligible = []
    previous_key = None
    ordered = True
    for log in logs:
        if log.origin == "overcall" or log.provider == "aws":
            continue
        key = (log.timestamp, log.id)
        if previous_key is not None and key < previous_key:
            ordered = False
        eligible.append(log)
        previous_key = key
    if not ordered:
        eligible.sort(key=lambda log: (log.timestamp, log.id))
    return eligible


def severity_for(monthly_usd: float, critical_at: float = 20.0, warning_at: float = 2.0) -> str:
    if monthly_usd >= critical_at:
        return "critical"
    return "warning" if monthly_usd >= warning_at else "info"
