from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API_ROOT = ROOT / "apps" / "api"
sys.path.insert(0, str(API_ROOT))

from overcall.synthetic import generate  # noqa: E402
from overcall.v1_api import _synthetic_accuracy  # noqa: E402


def build_synthetic_report(
    *,
    seed: int,
    days: int,
    size: str,
    generated_at: datetime | None = None,
) -> dict:
    logs, truth = generate(seed=seed, days=days, size=size)
    rules = _synthetic_accuracy(logs, truth)
    return {
        "generated_at": (generated_at or datetime.now(UTC)).isoformat(),
        "requests": len(logs),
        "rules": [rule.model_dump(mode="json") for rule in rules],
    }


def write_report(report: dict, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate detection precision and recall on generated synthetic traffic."
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--size", choices=("small", "standard"), default="standard")
    parser.add_argument(
        "--out",
        type=Path,
        default=ROOT / "validation" / "reports" / "synthetic.json",
    )
    args = parser.parse_args()
    report = build_synthetic_report(seed=args.seed, days=args.days, size=args.size)
    write_report(report, args.out)
    print(
        f"Wrote {len(report['rules'])} rule results for "
        f"{report['requests']} requests to {args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
