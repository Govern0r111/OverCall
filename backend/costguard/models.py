from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias="_id")

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        return cls.model_validate(doc) if doc else None

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True)
        data["_id"] = ObjectId(data["_id"])
        return data


class RequestLog(BaseDocument):
    timestamp: datetime
    provider: str
    endpoint: str
    method: str
    req_size: int
    req_hash: str
    status: int
    resp_size: int
    latency_ms: float
    cost_usd: float
    source: str
    caller: Optional[str] = None
    model: Optional[str] = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    context_hash: Optional[str] = None
    list_limit: Optional[int] = None
    items_returned: Optional[int] = None
    has_idempotency_key: bool = False
    ground_truth: Optional[str] = None


class Issue(BaseDocument):
    rule_id: str
    rule_name: str
    issue_type: str
    tier: int
    experimental: bool
    provider: str
    endpoint: str
    severity: str
    title: str
    summary: str
    explanation: str
    suggested_fix: str
    affected_requests: List[str]
    affected_count: int
    estimated_savings_usd: float
    projected_monthly_usd: float
    confidence: float
    sample_requests: List[Dict[str, Any]]
    detected_at: datetime
