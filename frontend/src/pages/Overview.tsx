import { Link } from "react-router-dom";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { PageHeader, Card } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { HeroSavings } from "../components/HeroSavings";
import { TrendChart } from "../components/TrendChart";
import { IssueRow } from "../components/IssueRow";
import { DemoBanner } from "../components/DemoBanner";
import { useOverview, useRerun } from "../hooks/queries";
import { formatInt, timeAgo } from "../lib/format";

export const PageSkeleton = () => (
  <div data-testid="page-loading" className="space-y-6">
    <Skeleton className="h-8 w-48" />
    <div className="grid gap-6 lg:grid-cols-5">
      <Skeleton className="h-80 lg:col-span-2" />
      <Skeleton className="h-80 lg:col-span-3" />
    </div>
  </div>
);

export default function Overview() {
  const { data, isLoading } = useOverview();
  const rerun = useRerun();
  if (isLoading || !data) return <PageSkeleton />;
  if (!data.has_data) return <EmptyState />;

  const demoOnly = !!data.sources.synthetic && !data.sources.proxy;
  return (
    <div>
      <PageHeader
        title="Overview"
        description={`${data.window_days.toFixed(1)} days of traffic · ${formatInt(data.request_count)} requests analyzed · updated ${timeAgo(data.ran_at)}`}
        actions={
          <Button variant="outline" size="sm" data-testid="rerun-detection-button" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
            {rerun.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
            Re-run detection
          </Button>
        }
      />
      {demoOnly && <DemoBanner />}
      <div className="grid gap-6 lg:grid-cols-5">
        <HeroSavings data={data} className="lg:col-span-2" />
        <TrendChart data={data.trend} className="lg:col-span-3" />
      </div>
      <Card testId="top-issues-card" className="mt-10">
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <h2 className="text-sm font-medium">Highest-impact issues</h2>
          <Link to="/issues" data-testid="view-all-issues-link" className="flex items-center gap-1 text-sm text-primary hover:underline">
            View all issues <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data.top_issues.length ? (
          <ul>{data.top_issues.map((i, idx) => <IssueRow key={i.id} issue={i} index={idx} />)}</ul>
        ) : (
          <p data-testid="no-issues-message" className="px-5 py-8 text-sm text-muted-foreground">No wasteful patterns found. Nice work.</p>
        )}
      </Card>
    </div>
  );
}
