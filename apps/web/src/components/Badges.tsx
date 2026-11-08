import { FlaskConical, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { cn } from "../lib/utils";
import type { Severity } from "../lib/api";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "text-critical border-critical/30 bg-critical/[0.06]",
  warning: "text-warning border-warning/30 bg-warning/[0.07]",
  info: "text-muted-foreground border-border",
};

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", warning: "Warning", info: "Low" };

export const SeverityBadge = ({ severity, testId }: { severity: Severity; testId?: string }) => (
  <span
    data-testid={testId}
    className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", SEVERITY_STYLE[severity])}
  >
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
    {SEVERITY_LABEL[severity]}
  </span>
);

export const TierBadge = ({ tier, confidence, testId }: { tier: number; confidence?: number | null; testId?: string }) => {
  if (tier === 3) {
    const confidenceLabel = confidence == null || !Number.isFinite(confidence)
      ? "Confidence unknown"
      : `Confidence ${Math.round(confidence * 100)}%`;
    return (
      <span
        data-testid={testId}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/60 px-2 py-0.5 text-xs text-primary"
      >
        <FlaskConical className="h-3 w-3" strokeWidth={2} />
        Experimental
        <span className="font-mono">· {confidenceLabel}</span>
      </span>
    );
  }
  const Icon = tier === 1 ? ShieldCheck : SlidersHorizontal;
  return (
    <span data-testid={testId} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" strokeWidth={2} />
      {tier === 1 ? "Deterministic" : "Tunable threshold"}
    </span>
  );
};
