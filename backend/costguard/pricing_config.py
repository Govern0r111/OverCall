import json
from pathlib import Path

PRICING_DIR = Path(__file__).parent / "pricing"
PROVIDERS = ("openai", "stripe", "aws")
PRICING = {p: json.loads((PRICING_DIR / f"{p}.json").read_text()) for p in PROVIDERS}


def model_price(model):
    cfg = PRICING["openai"]
    models = cfg["models"]
    model = model or cfg["default_model"]
    if model in models:
        return model, models[model]
    matches = [k for k in models if model.startswith(k)]
    key = max(matches, key=len) if matches else cfg["default_model"]
    return key, models[key]


def is_ok(status: int) -> bool:
    return 200 <= status < 300


def estimate_cost(provider, model=None, prompt_tokens=0, completion_tokens=0, status=200) -> float:
    if provider == "openai":
        cfg = PRICING["openai"]
        if not is_ok(status):
            return cfg["failed_request_cost_usd"]
        if not model:
            return cfg["per_request_overhead_usd"]
        _, p = model_price(model)
        return (prompt_tokens * p["input_per_1m"] + completion_tokens * p["output_per_1m"]) / 1e6
    if provider == "stripe":
        cfg = PRICING["stripe"]
        return cfg["per_request_usd"] if is_ok(status) else cfg["failed_request_usd"]
    return 0.0
