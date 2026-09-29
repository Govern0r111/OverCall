from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .db import issues_col, logs_col, runs_col
from .engine import SEVERITY_RANK, ensure_fresh, evaluate, load_logs, mark_dirty, run_detection
from .models import Issue, RequestLog
from .pricing_config import PRICING
from .rules import RULES, RULES_BY_ID
from .settings_store import AppSettings, get_settings, save_settings
from .synthetic import generate, ground_truth_counts

router = APIRouter(prefix="/api")


class SyntheticLoad(BaseModel):
    seed: int = 42
    days: int = Field(7, ge=1, le=30)


@router.get("/health")
async def health():
    return {"status": "ok"}


async def latest_summary() -> dict:
    await ensure_fresh()
    doc = await runs_col.find_one({"_id": "latest"}) or {"has_data": False}
    doc.pop("_id", None)
    return doc


async def fetch_issues(query: dict) -> list:
    docs = await issues_col.find(query).to_list(1000)
    items = [Issue.from_mongo(d) for d in docs]
    items.sort(key=lambda i: (SEVERITY_RANK[i.severity], -i.projected_monthly_usd))
    return [i.model_dump() for i in items]


@router.get("/overview")
async def overview():
    summary = await latest_summary()
    top = await fetch_issues({})
    return {**summary, "top_issues": top[:5]}


@router.get("/issues")
async def list_issues(provider: Optional[str] = None, severity: Optional[str] = None, tier: Optional[int] = None):
    await ensure_fresh()
    q = {k: v for k, v in {"provider": provider, "severity": severity, "tier": tier}.items() if v is not None}
    return await fetch_issues(q)


@router.get("/rules")
async def list_rules():
    return [{"id": r.id, "name": r.name, "tier": r.tier, "description": r.description} for r in RULES]


@router.post("/detect/run")
async def detect_run():
    summary = await run_detection()
    summary.pop("_id", None)
    return summary


@router.get("/settings", response_model=AppSettings)
async def read_settings():
    return await get_settings()


@router.put("/settings", response_model=AppSettings)
async def update_settings(body: AppSettings):
    unknown = set(body.rules) - set(RULES_BY_ID)
    if unknown:
        raise HTTPException(400, f"Unknown rules: {', '.join(sorted(unknown))}")
    saved = await save_settings(body)
    mark_dirty()
    return saved


async def provider_stats(provider: str) -> dict:
    stats = {"proxy": 0, "synthetic": 0}
    async for row in logs_col.aggregate([{"$match": {"provider": provider}}, {"$group": {"_id": "$source", "n": {"$sum": 1}}}]):
        stats[row["_id"]] = row["n"]
    last = await logs_col.find_one({"provider": provider, "source": "proxy"}, sort=[("timestamp", -1)])
    return {"counts": stats, "last_proxy_request_at": last["timestamp"] if last else None}


@router.get("/providers")
async def providers():
    s = await get_settings()
    out = []
    for p in ("openai", "stripe", "aws"):
        if p == "aws":
            out.append({"id": p, "status": "stubbed", "counts": {"proxy": 0, "synthetic": 0}, "last_proxy_request_at": None,
                        "issue_count": 0, "pricing": PRICING[p], "upstream_mode": None})
            continue
        st = await provider_stats(p)
        status = "receiving_traffic" if st["counts"]["proxy"] else ("synthetic_only" if st["counts"]["synthetic"] else "waiting")
        out.append({"id": p, "status": status, **st, "issue_count": await issues_col.count_documents({"provider": p}),
                    "pricing": PRICING[p], "upstream_mode": s.openai_upstream if p == "openai" else "test"})
    return out


@router.get("/logs/recent")
async def recent_logs(limit: int = 25, provider: Optional[str] = None):
    q = {"provider": provider} if provider else {}
    docs = await logs_col.find(q).sort("timestamp", -1).to_list(min(limit, 200))
    return [RequestLog.from_mongo(d).model_dump(exclude={"ground_truth"}) for d in docs]


@router.post("/synthetic/load")
async def load_synthetic(body: SyntheticLoad = SyntheticLoad()):
    await logs_col.delete_many({"source": "synthetic"})
    logs = generate(body.seed, body.days)
    await logs_col.insert_many([l.to_mongo() for l in logs])
    await run_detection()
    return {"inserted": len(logs), "seed": body.seed, "days": body.days, "ground_truth": ground_truth_counts(logs)}


@router.get("/synthetic/evaluate")
async def evaluate_synthetic():
    logs = await load_logs({"source": "synthetic"})
    if not logs:
        return {"has_data": False, "rules": []}
    s = await get_settings()
    return {"has_data": True, "requests": len(logs), "rules": evaluate(logs, s.windows)}


@router.delete("/data")
async def clear_data():
    res = await logs_col.delete_many({})
    await run_detection()
    return {"deleted": res.deleted_count}
