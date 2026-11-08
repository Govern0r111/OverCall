import { Link } from "react-router-dom";
import { ArrowRight, Loader2, RefreshCw, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useAppAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { PageHeader, Card } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { PageErrorState } from "../components/PageErrorState";
import { HeroSavings } from "../components/HeroSavings";
import { ReliabilityFigure } from "../components/ReliabilityFigure";
import { TrendChart } from "../components/TrendChart";
import { IssueRow } from "../components/IssueRow";
import { DemoBanner } from "../components/DemoBanner";
import { useMe, useOverview, useRerun } from "../hooks/queries";
import { formatInt, timeAgo } from "../lib/format";
import type { Overview, Severity } from "../lib/api";

export const PageSkeleton = () => (
  <div data-testid="page-loading" className="space-y-6">
    <Skeleton className="h-8 w-48" />
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-80 lg:col-span-3" />
    </div>
  </div>
);

const SEVERITY_META: Record<Severity, { label: string; icon: typeof AlertTriangle; color: string }> = {
  critical: { label: "Critical", icon: AlertCircle, color: "text-critical" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-warning" },
  info: { label: "Low", icon: Info, color: "text-muted-foreground" },
};

const EMPTY_OVERVIEW: Overview = {
  has_data: false,
  is_demo_data: false,
  request_count: 0,
  flagged_request_count: 0,
  window_days: 0,
  total_cost_usd: 0,
  projected_monthly_cost_usd: 0,
  window_savings_usd: 0,
  projected_monthly_usd: 0,
  waste_pct: 0,
  experimental_projected_monthly_usd: 0,
  reliability_count: 0,
  reliability_overhead_monthly_usd: 0,
  low_confidence_projection: false,
  issue_counts: { critical: 0, warning: 0, info: 0 },
  trend: [],
  top_issues: [],
  ran_at: null,
};

const SeverityBar = ({ counts }: { counts: Record<Severity, number> }) => {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const order: Severity[] = ["critical", "warning", "info"];
  const widths = order.map((s) => ({ s, w: (counts[s] / total) * 100 }));
  return (
    <div data-testid="severity-distribution" className="flex flex-wrap items-center gap-4">
      <div className="flex h-1.5 w-48 overflow-hidden rounded-full bg-accent">
        {widths.filter((w) => w.w > 0).map(({ s, w }) => (
          <div
            key={s}
            data-testid={`severity-bar-${s}`}
            className={s === "critical" ? "bg-critical" : s === "warning" ? "bg-warning" : "bg-muted-foreground"}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {order.map((s) => {
          const meta = SEVERITY_META[s];
          const Icon = meta.icon;
          return (
            <span key={s} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} strokeWidth={2} />
              <span className="font-mono text-foreground">{counts[s]}</span>
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default function Overview() {
  const { user, isDemo } = useAppAuth();
  const { data, isLoading, isError, refetch } = useOverview();
  const me = useMe(user.id, !isDemo);
  const rerun = useRerun();
  const overview = data ?? EMPTY_OVERVIEW;
  const hasMeasurements = Boolean(data?.has_data);
  const hasProxyTraffic = !isDemo && Boolean(me.data?.has_data);

  const demoOnly = hasMeasurements && overview.is_demo_data;
  const topIssues = hasMeasurements ? overview.top_issues.slice(0, 5) : [];
  return (
    <div>
      <PageHeader
        title="Overview"
        description="See estimated savings, reliability findings, and the most important issues."
        actions={hasMeasurements ? (
          <Button variant="outline" size="sm" data-testid="rerun-detection-button" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
            {rerun.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 motion-safe:animate-spin motion-reduce:hidden" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Re-run detection
          </Button>
        ) : undefined}
      />
      {isError && <PageErrorState message="The overview could not be loaded." onRetry={() => void refetch()} />}
      {data && !hasMeasurements && me.isError && (
        <PageErrorState
          message="Your traffic status could not be loaded."
          onRetry={() => void me.refetch()}
        />
      )}
      {isLoading && !data && <p role="status" className="mb-6 text-sm text-muted-foreground">Loading your live overview…</p>}
      {data && !hasMeasurements && me.isLoading && (
        <p role="status" className="mb-6 text-sm text-muted-foreground">Checking for recent traffic…</p>
      )}
      {data && !hasMeasurements && !me.isLoading && !me.isError && (
        <EmptyState
          hasProxyTraffic={hasProxyTraffic}
          isAnalyzing={rerun.isPending}
          onAnalyze={() => rerun.mutate()}
        />
      )}
      {demoOnly && <DemoBanner />}
      <p data-testid="overview-traffic-summary" className="-mt-5 mb-7 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {hasMeasurements ? (
          <>
            <span>{overview.window_days.toFixed(1)} days of traffic</span>
            <span aria-hidden="true">·</span>
            <span>{formatInt(overview.request_count)} requests analyzed</span>
            {overview.ran_at && (
              <>
                <span aria-hidden="true">·</span>
                <span>Updated {timeAgo(overview.ran_at)}</span>
              </>
            )}
          </>
        ) : isLoading && !data ? "Loading live measurements…" : "Waiting for first traffic"}
      </p>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section aria-label="Impact summary" className="min-w-0 space-y-5">
          <HeroSavings data={overview} hasMeasurements={hasMeasurements} />
          <ReliabilityFigure data={overview} hasMeasurements={hasMeasurements} />
        </section>
        <section aria-label="Traffic trends" className="min-w-0">
          <TrendChart data={overview.trend} />
        </section>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <SeverityBar counts={overview.issue_counts} />
      </div>
      <Card testId="top-issues-card" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-5 py-4">
          <h2 className="text-sm font-semibold">Highest-impact issues</h2>
          <Link to="/issues" data-testid="view-all-issues-link" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all issues <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {topIssues.length ? (
          <ul>{topIssues.map((i, idx) => (
            <IssueRow
              key={i.id}
              issue={i}
              index={idx}
              issueHref={`/app/issues?open=${encodeURIComponent(i.id)}`}
            />
          ))}</ul>
        ) : (
          <p data-testid="no-issues-message" className="px-5 py-8 text-sm text-muted-foreground">
            {hasMeasurements ? "No wasteful patterns found. Nice work." : "No live issues yet. They will appear after traffic is analyzed."}
          </p>
        )}
      </Card>
    </div>
  );
}
