import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { FlaskConical, Filter } from "lucide-react";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { PageHeader, Card } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { PageErrorState } from "../components/PageErrorState";
import { IssueRow } from "../components/IssueRow";
import { useIssues, useOverview } from "../hooks/queries";
import { useApp, useMoney } from "../context/AppContext";

const FILTERS = [
  { key: "provider", label: "Provider", options: [["all", "All providers"], ["openai", "OpenAI"], ["stripe", "Stripe"], ["aws", "AWS"]] },
  { key: "severity", label: "Severity", options: [["all", "All severities"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Low"]] },
  { key: "tier", label: "Detection tier", options: [["all", "All tiers"], ["1", "Deterministic"], ["2", "Tunable threshold"], ["3", "Experimental"]] },
] as const;

const FilterSelect = ({ f, value, onChange }: { f: (typeof FILTERS)[number]; value: string; onChange: (v: string) => void }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger data-testid={`issue-filter-${f.key}-select`} aria-label={f.label} className="h-9 w-[170px] bg-card text-sm">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {f.options.map(([v, l]) => (
        <SelectItem key={v} value={v} data-testid={`issue-filter-${f.key}-option-${v}`}>{l}</SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export default function Issues() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    provider: searchParams.get("provider") ?? "all",
    severity: searchParams.get("severity") ?? "all",
    tier: searchParams.get("tier") ?? "all",
  };
  const openId = searchParams.get("open");
  const overview = useOverview();
  const { data: issues, isLoading, isError, refetch } = useIssues(filters);
  const money = useMoney();
  const { settings } = useApp();
  const visibleIssues = (issues ?? []).filter((issue) => settings?.experimental_enabled || !issue.experimental);

  const setFilter = (key: keyof typeof filters, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const toggleIssue = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (openId === id) next.delete("open");
    else next.set("open", id);
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams();
    if (openId) next.set("open", openId);
    setSearchParams(next, { replace: true });
  };

  if (!overview.data?.has_data) {
    return (
      <div>
        <PageHeader title="Issues" description="Review detected patterns and prioritize the highest-impact fixes." />
        {overview.isError && <PageErrorState message="Issue overview could not be loaded." onRetry={() => void overview.refetch()} />}
        {overview.isLoading && !overview.data && <p role="status" className="text-sm text-muted-foreground">Loading issue overview…</p>}
        {overview.data && <EmptyState />}
      </div>
    );
  }

  const total = visibleIssues.reduce((s, i) => s + i.projected_monthly_usd, 0);
  const activeFilters = Object.values(filters).filter((v) => v !== "all").length;

  return (
    <div>
      <PageHeader title="Issues" description="Review detected patterns and prioritize the highest-impact fixes." />
      {overview.isError && <PageErrorState message="Issue overview could not be refreshed." onRetry={() => void overview.refetch()} />}
      {isError && <PageErrorState message="Issues could not be loaded." onRetry={() => void refetch()} />}
      <Card className="mb-6 p-4 sm:p-5">
        <div role="group" aria-label="Issue filters">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Filter aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              Filter issues
            </p>
            <p data-testid="issues-summary" className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground tabular-nums">{visibleIssues.length}</span> issues ·{" "}
              <span className="font-mono text-savings tabular-nums">{money(total)}</span>/mo
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {FILTERS.map((f) => (
              <FilterSelect key={f.key} f={f} value={filters[f.key]} onChange={(v) => setFilter(f.key, v)} />
            ))}
            {activeFilters > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} data-testid="clear-issue-filters-button">
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </Card>
      {!settings?.experimental_enabled && (
        <p data-testid="experimental-off-hint" className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" /> Experimental LLM checks are off.
          <Link to="/settings" className="text-primary hover:underline">Turn them on in Settings</Link>
        </p>
      )}
      <section aria-label="Issue results">
        <Card testId="issues-list">
          {isError && !issues ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Issue results are unavailable until the request succeeds.</p>
          ) : isLoading && !issues ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">Loading issues…</p>
          ) : visibleIssues.length ? (
            <ul>{visibleIssues.map((i, idx) => <IssueRow key={i.id} issue={i} index={idx} open={openId === i.id} onToggle={() => toggleIssue(i.id)} />)}</ul>
          ) : (
            <div className="px-5 py-10 text-sm text-muted-foreground">
              <p data-testid="issues-empty-filtered">No issues match these filters. Try widening the provider, severity or tier.</p>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
