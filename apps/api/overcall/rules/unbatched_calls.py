from ..pricing_config import PRICING
from .base import (
    PROVIDER_LABEL,
    Finding,
    Rule,
    by_endpoint,

    gap_s,
    group_by,
    severity_for,
)


def batch_for(log):
    return PRICING.get(log.provider, {}).get("batch_equivalents", {}).get(
        f"{log.method} {log.endpoint}"
    )


def bursts(group, window_s, min_calls):
    out, cur = [], [group[0]]
    for prev, nxt in zip(group, group[1:], strict=False):
        if gap_s(prev, nxt) <= window_s:
            cur.append(nxt)
        else:
            if len(cur) >= min_calls:
                out.append(cur)
            cur = [nxt]
    if len(cur) >= min_calls:
        out.append(cur)
    return out


class UnbatchedCalls(Rule):
    id = "unbatched_calls"
    name = "Unbatched calls"
    tier = 2
    description = "Bursts of single calls to an endpoint that has a documented batch equivalent."
    threshold_keys = ("unbatched_min_calls", "unbatched_window_s")

    def detect(self, logs, ctx):
        w = ctx.w
        candidates = [log for log in ctx.filter_logs(logs) if batch_for(log)]
        found, meta = [], {}
        grouped = group_by(
            candidates,
            lambda log: (log.provider, log.method, log.endpoint, log.caller),
        )
        for key, group in grouped.items():
            for b in bursts(group, w.unbatched_window_s, w.unbatched_min_calls):
                found += b[1:]
                m = meta.setdefault((key[0], key[2]), {"bursts": 0, "largest": 0, "callers": set()})
                m["bursts"] += 1
                m["largest"] = max(m["largest"], len(b))
                m["callers"].add(key[3] or "unknown")
        findings = []
        for (prov, ep), items in by_endpoint(found).items():
            batch = batch_for(items[0])
            waste = {log.id: log.cost_usd * batch["discount"] for log in items}
            m, label = meta[(prov, ep)], PROVIDER_LABEL.get(prov, prov)
            summary = (
                f"Your app made {len(items)} one-at-a-time calls to {ep} in quick bursts. "
                f"{label} offers a batch option that reduces modeled operational overhead, "
                "not provider fees."
                if batch["impact_kind"] == "reliability"
                else (
                    f"Your app made {len(items)} one-at-a-time calls to {ep} in quick bursts. "
                    f"{label} offers a batch option that does the same work in fewer, "
                    "cheaper requests."
                )
            )
            findings.append(Finding(
                issue_type=self.id,
                severity=severity_for(
                    ctx.monthly(sum(waste.values())), critical_at=30.0, warning_at=1.0
                ),
                provider=prov,
                endpoint=ep,
                title=f"Many single {label} calls that could be batched",
                summary=summary,
                explanation=(
                    f"Bursts of ≥{w.unbatched_min_calls} calls with "
                    f"≤{w.unbatched_window_s:g}s between them "
                    f"({m['bursts']} bursts, largest {m['largest']} calls; "
                    f"caller: {', '.join(sorted(m['callers']))}). "
                    f"Documented batch equivalent: {batch['method']}."
                ),
                suggested_fix=batch["fix"],
                affected=items,
                waste_by_request=waste,
                impact_kind=batch["impact_kind"],
            ))
        return findings
