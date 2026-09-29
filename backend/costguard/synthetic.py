"""Seedable synthetic traffic generator with ground-truth labels. CLI: python -m costguard.synthetic --seed 42"""
import argparse
import json
import random
import string
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import List

from .hashing import normalize_endpoint
from .models import RequestLog
from .pricing_config import estimate_cost

DAY = 86400.0


class Gen:
    def __init__(self, seed: int, days: int, end: datetime | None = None):
        self.rng = random.Random(seed)
        self.end = end or datetime.now(timezone.utc).replace(microsecond=0)
        self.start = self.end - timedelta(days=days)
        self.days = days
        self.logs: List[RequestLog] = []

    def h(self) -> str:
        return f"{self.rng.getrandbits(64):016x}"

    def rid(self, prefix: str) -> str:
        return prefix + "".join(self.rng.choices(string.ascii_letters + string.digits, k=14))

    def when(self, day: int, margin: float = 3600) -> datetime:
        return self.start + timedelta(seconds=day * DAY + self.rng.uniform(0, DAY - margin))

    def add(self, ts, provider, method, path, *, status=200, model=None, pt=0, ct=0, h=None, req_size=None,
            resp_size=None, ctx=None, truth=None, idem=False, caller=None, latency=None, limit=None, items=None):
        h = h or self.h()
        r = self.rng
        self.logs.append(RequestLog(
            timestamp=ts, provider=provider, endpoint=normalize_endpoint(path), method=method,
            req_size=req_size if req_size is not None else (pt * 4 + 220 if provider == "openai" else r.randint(60, 400)),
            req_hash=h, status=status,
            resp_size=resp_size if resp_size is not None else (ct * 4 + 380 if provider == "openai" else r.randint(900, 2600)),
            latency_ms=round(latency if latency is not None else r.uniform(150, 600), 1),
            cost_usd=estimate_cost(provider, model, pt, ct, status), source="synthetic", caller=caller, model=model,
            prompt_tokens=pt if status < 300 else 0, completion_tokens=ct if status < 300 else 0,
            context_hash=ctx, list_limit=limit, items_returned=items, has_idempotency_key=idem, ground_truth=truth,
        ))
        return h

    def chat(self, ts, model, pt, ct, **kw):
        lat = kw.pop("latency", None) or self.rng.uniform(400, 2000) * (2.5 if model == "gpt-4o" else 1)
        return self.add(ts, "openai", "POST", "/v1/chat/completions", model=model, pt=pt, ct=ct, latency=lat, **kw)

    def embed(self, ts, pt, **kw):
        return self.add(ts, "openai", "POST", "/v1/embeddings", model="text-embedding-3-small", pt=pt,
                        resp_size=33_000, latency=self.rng.uniform(80, 300), **kw)


def baseline(g: Gen, d: int):
    r = g.rng
    for _ in range(150):
        g.chat(g.when(d), "gpt-4o-mini", r.randint(300, 1200), r.randint(80, 400), ctx="sys-support", caller="support-bot")
    for _ in range(20):
        g.chat(g.when(d), "gpt-4o", r.randint(2500, 6000), r.randint(400, 1200), caller="report-writer")
    for _ in range(40):
        g.embed(g.when(d), r.randint(20, 120), caller="search-api")
    for _ in range(60):
        g.add(g.when(d), "stripe", "POST", "/v1/payment_intents", status=402 if r.random() < 0.03 else 200, idem=True, caller="web-checkout")
    for _ in range(80):
        g.add(g.when(d), "stripe", "GET", f"/v1/customers/{g.rid('cus_')}", caller="admin-dashboard")
    for _ in range(20):
        g.add(g.when(d), "stripe", "GET", "/v1/charges", resp_size=r.randint(20_000, 45_000), limit=20, items=20, caller="billing-cron")
    for _ in range(4):
        ts, h = g.when(d), g.h()
        g.chat(ts, "gpt-4o-mini", 600, 150, status=429, h=h, latency=40, caller="support-bot")
        g.chat(ts + timedelta(seconds=r.uniform(2, 6)), "gpt-4o-mini", 600, 150, h=h, caller="support-bot")


def inject(g: Gen, d: int):
    r = g.rng
    for _ in range(15):  # double-submits
        ts, model = g.when(d), r.choice(["gpt-4o", "gpt-4o-mini"])
        pt, ct = r.randint(2000, 5000), r.randint(200, 600)
        h = g.chat(ts, model, pt, ct, caller="web-chat")
        for _ in range(r.randint(1, 2)):
            ts += timedelta(seconds=r.uniform(0.3, 3))
            g.chat(ts, model, pt, ct, h=h, truth="duplicate_calls", caller="web-chat")
    for _ in range(5):  # payment double-click without idempotency key
        ts = g.when(d)
        h = g.add(ts, "stripe", "POST", "/v1/payment_intents", caller="web-checkout")
        g.add(ts + timedelta(seconds=r.uniform(0.5, 2)), "stripe", "POST", "/v1/payment_intents", h=h, truth="duplicate_calls", caller="web-checkout")
    for _ in range(10):  # account page re-fetching the same customer
        ts, path, h = g.when(d), f"/v1/customers/{g.rid('cus_')}", g.h()
        for i in range(r.randint(6, 12)):
            g.add(ts, "stripe", "GET", path, h=h, truth="missing_cache" if i else None, caller="account-page")
            ts += timedelta(seconds=r.uniform(20, 120))
    for _ in range(8):  # same embedding input repeatedly
        ts, h, pt = g.when(d), g.h(), r.randint(20, 120)
        for i in range(4):
            g.embed(ts, pt, h=h, truth="missing_cache" if i else None, caller="search-api")
            ts += timedelta(seconds=r.uniform(30, 300))
    ts, h = g.when(d), g.h()
    for i in range(30):  # health check polling the models list
        g.add(ts, "openai", "GET", "/v1/models", h=h, resp_size=8_000, truth="missing_cache" if i else None, caller="health-check")
        ts += timedelta(seconds=60)
    for _ in range(3):  # 429 retry storms
        ts, h, n = g.when(d), g.h(), r.randint(6, 15)
        for i in range(n):
            last = i == n - 1 and r.random() < 0.5
            g.chat(ts, "gpt-4o-mini", 700, 200, status=200 if last else 429, h=h, latency=r.uniform(30, 80),
                   truth="retry_storm" if i else None, caller="support-bot")
            ts += timedelta(seconds=r.uniform(0.05, 0.3))
    ts, h = g.when(d), g.h()
    for i in range(r.randint(5, 8)):  # 5xx storm on Stripe
        g.add(ts, "stripe", "POST", "/v1/customers", status=r.choice([500, 503]), h=h, latency=r.uniform(40, 120),
              truth="retry_storm" if i else None, caller="signup-worker")
        ts += timedelta(seconds=r.uniform(0.08, 0.2))
    for _ in range(12):  # over-expanded event lists
        g.add(g.when(d), "stripe", "GET", "/v1/events", resp_size=r.randint(400_000, 900_000), limit=100, items=100,
              latency=r.uniform(900, 2500), truth="oversized_payload", caller="billing-cron")
    for _ in range(5):  # whole documents stuffed into prompts
        pt = r.randint(60_000, 110_000)
        g.chat(g.when(d), "gpt-4o", pt, r.randint(300, 800), latency=r.uniform(8000, 20000), truth="oversized_payload", caller="doc-summarizer")
    for _ in range(6):  # embedding loops
        ts = g.when(d)
        for i in range(r.randint(20, 50)):
            g.embed(ts, r.randint(100, 500), truth="unbatched_calls" if i else None, caller="search-indexer")
            ts += timedelta(seconds=r.uniform(0.05, 0.4))
    for _ in range(3):  # CRM sync retrieving customers one by one
        ts = g.when(d)
        for i in range(r.randint(10, 30)):
            g.add(ts, "stripe", "GET", f"/v1/customers/{g.rid('cus_')}", truth="unbatched_calls" if i else None, caller="crm-sync")
            ts += timedelta(seconds=r.uniform(0.1, 0.5))
    for _ in range(8):  # document chat resending the same context each turn
        ts, ctx, model = g.when(d), g.h(), r.choices(["gpt-4o-mini", "gpt-4o"], weights=[7, 3])[0]
        for i in range(r.randint(5, 12)):
            g.chat(ts, model, r.randint(3000, 8000), r.randint(150, 400), ctx=ctx, truth="token_bloat" if i else None, caller="doc-chat")
            ts += timedelta(seconds=r.uniform(20, 90))
    for _ in range(60):  # premium model for tiny classification prompts
        g.chat(g.when(d), "gpt-4o", r.randint(150, 500), r.randint(5, 40), truth="model_overuse", caller="classifier-worker")


def generate(seed: int = 42, days: int = 7, end: datetime | None = None) -> List[RequestLog]:
    g = Gen(seed, days, end)
    for d in range(days):
        baseline(g, d)
        inject(g, d)
    g.logs.sort(key=lambda l: l.timestamp)
    return g.logs


def ground_truth_counts(logs: List[RequestLog]) -> dict:
    return dict(Counter(l.ground_truth for l in logs if l.ground_truth))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Generate synthetic API traffic with ground truth")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--out", help="write JSONL to this path")
    a = ap.parse_args()
    data = generate(a.seed, a.days)
    if a.out:
        with open(a.out, "w") as fh:
            for l in data:
                fh.write(json.dumps(l.model_dump(mode="json")) + "\n")
    print(json.dumps({"requests": len(data), "ground_truth": ground_truth_counts(data)}, indent=2))
