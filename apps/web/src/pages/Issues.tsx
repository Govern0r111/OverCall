import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { FlaskConical, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { PageHeader, Card } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { IssueRow } from "../components/IssueRow";
import { useIssues, useOverview } from "../hooks/queries";
import { useApp, useMoney } from "../context/AppContext";
import { PageSkeleton } from "./Overview";

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
  const { data: issues, isLoading } = useIssues(filters);
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

  if (overview.isLoading || !overview.data) return <PageSkeleton />;
  if (!overview.data.has_data) return <EmptyState />;

  const total = visibleIssues.reduce((s, i) => s + i.projected_monthly_usd, 0);
  const activeFilters = Object.values(filters).filter((v) => v !== "all").length;

  return (
    <div>
      <PageHeader title="Issues" description="Every wasteful pattern we found, highest impact first. Select a row to see what we detected and how to fix it." />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </div>
        {FILTERS.map((f) => (
          <FilterSelect key={f.key} f={f} value={filters[f.key]} onChange={(v) => setFilter(f.key, v)} />
        ))}
        <p data-testid="issues-summary" className="ml-auto text-sm text-muted-foreground">
          <span className="font-mono text-foreground">{visibleIssues.length}</span> issues ·{" "}
          <span className="font-mono text-savings">{money(total)}</span>/mo
        </p>
      </div>
      {!settings?.experimental_enabled && (
        <p data-testid="experimental-off-hint" className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" /> Experimental LLM checks are off.
          <Link to="/settings" className="text-primary hover:underline">Turn them on in Settings</Link>
        </p>
      )}
      <Card testId="issues-list">
        {isLoading ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Loading issues…</p>
        ) : visibleIssues.length ? (
          <ul>{visibleIssues.map((i, idx) => <IssueRow key={i.id} issue={i} index={idx} open={openId === i.id} onToggle={() => toggleIssue(i.id)} />)}</ul>
        ) : (
          <div className="px-5 py-10 text-sm text-muted-foreground">
            <p data-testid="issues-empty-filtered">No issues match these filters. Try widening the provider, severity or tier.</p>
            {activeFilters > 0 && <button type="button" onClick={clearFilters} className="mt-3 text-primary hover:underline">Clear filters</button>}
          </div>
        )}
      </Card>
    </div>
  );
}
