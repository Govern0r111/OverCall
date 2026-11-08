import { ArrowDownRight, FlaskConical } from "lucide-react";
import type { Overview } from "../lib/api";
import { formatInt } from "../lib/format";
import { useApp, useMoney } from "../context/AppContext";
import { useCountUp } from "../hooks/useCountUp";
import { Card } from "./PageHeader";

const Stat = ({ label, value, testId }: { label: string; value: string; testId: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd data-testid={testId} className="mt-1 font-mono text-sm">{value}</dd>
  </div>
);

export const HeroSavings = ({ data, hasMeasurements = true, className = "" }: { data: Overview; hasMeasurements?: boolean; className?: string }) => {
  const money = useMoney();
  const { settings } = useApp();
  const total = Object.values(data.issue_counts).reduce((a, b) => a + b, 0);
  const pct = data.waste_pct.toFixed(data.waste_pct < 10 ? 1 : 0);
  const animatedSavings = useCountUp(hasMeasurements ? data.projected_monthly_usd : 0);
  const hasSavings = hasMeasurements && data.projected_monthly_usd > 0;
  const hasAnyIssues = data.reliability_count > 0 || total > 0;

  return (
    <Card testId="hero-savings-card" className={`flex min-w-0 flex-col p-6 lg:p-8 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Estimated monthly spend savings</p>
        {hasSavings && (
          <span className="flex items-center gap-1 rounded-full border border-savings/30 bg-savings/[0.06] px-2 py-0.5 text-xs font-medium text-savings">
            <ArrowDownRight className="h-3 w-3" strokeWidth={2} />
            {pct}% avoidable
          </span>
        )}
      </div>
      <p
        data-testid="hero-projected-savings"
        className="mt-3 font-mono text-5xl font-medium tracking-tight text-savings tabular-nums"
      >
        {hasMeasurements ? money(animatedSavings) : "—"}
      </p>
      <p data-testid="hero-supporting-line" className="mt-4 text-sm leading-relaxed">
        {hasMeasurements
          ? "Based on the last 7 days of traffic. This is an estimate, not a bill."
          : "Waiting for first traffic. Live estimates will appear after your first request."}
      </p>
      {hasMeasurements && !hasSavings && !hasAnyIssues && (
        <p data-testid="no-waste-message" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          No waste found. Nice.
        </p>
      )}
      {data.low_confidence_projection && (
        <p data-testid="low-confidence-projection-note" className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Based on less than a day of traffic, so this projection may swing a lot.
        </p>
      )}
      <dl className="mt-8 grid grid-cols-2 gap-5 border-t border-divider pt-6">
        <Stat label="Current spend" value={hasMeasurements ? `${money(data.projected_monthly_cost_usd)}/mo` : "—"} testId="hero-monthly-spend" />
        <Stat label="Avoidable" value={hasMeasurements ? `${pct}%` : "—"} testId="hero-waste-pct" />
        <Stat label="Flagged requests" value={hasMeasurements ? `${formatInt(data.flagged_request_count)} of ${formatInt(data.request_count)}` : "—"} testId="hero-flagged-requests" />
        <Stat label="Open issues" value={hasMeasurements ? formatInt(total) : "—"} testId="hero-issue-count" />
      </dl>
      <p data-testid="hero-trust-note" className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        {settings?.experimental_enabled && data.experimental_projected_monthly_usd > 0 ? (
          <>
            <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Up to {money(data.experimental_projected_monthly_usd)} more from experimental checks (not included).
          </>
        ) : (
          "Only deterministic and threshold-based checks count toward this number."
        )}
      </p>
    </Card>
  );
};
