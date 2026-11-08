import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { PageHeader, Card } from "../components/PageHeader";
import { PageErrorState } from "../components/PageErrorState";
import { Input } from "../components/ui/input";
import { useLogFacets, useLogs } from "../hooks/queries";
import { useMoney } from "../context/AppContext";
import type { LogEntry } from "../lib/api";

type TimeRange = "all" | "15m" | "1h" | "24h" | "7d" | "30d" | "custom";
type PresetRange = Exclude<TimeRange, "all" | "custom">;

const RANGE_MS: Record<PresetRange, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};

const isTimeRange = (value: string | null): value is TimeRange =>
  value === "all" || value === "15m" || value === "1h" || value === "24h" ||
  value === "7d" || value === "30d" || value === "custom";

const toDateTimeLocal = (value: string) => {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const fromDateTimeLocal = (value: string) => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : "";
};

const isApproximateCost = (basis: string) => basis === "estimated" || basis === "modelled";
const metadataButtonLabel = (row: LogEntry) =>
  `Open metadata for ${row.provider} ${row.endpoint} at ${new Date(row.timestamp).toLocaleString()}`;
const ROW_HEIGHT = 56;
const VIRTUALIZE_AFTER = 500;
const VIRTUAL_ROWS = 40;
const VIRTUAL_OVERSCAN = 8;

export default function Logs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(query);
  const selectedRangeParam = searchParams.get("range");
  const selectedRange = isTimeRange(selectedRangeParam) ? selectedRangeParam : "all";
  const provider = searchParams.get("provider") ?? "";
  const statusClass = searchParams.get("status") ?? "";
  const endpoint = searchParams.get("endpoint") ?? "";
  const caller = searchParams.get("caller") ?? "";
  const model = searchParams.get("model") ?? "";
  const issueId = searchParams.get("issue");
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const rangeValid = !from || !to || new Date(from).getTime() <= new Date(to).getTime();
  const { data: pages, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useLogs({
    search: query.trim().length >= 4 ? query.trim() : undefined,
    provider: provider || undefined,
    status_class: statusClass || undefined,
    endpoint: endpoint || undefined,
    caller: caller || undefined,
    model: model || undefined,
    issue_id: issueId || undefined,
    from: rangeValid ? from || undefined : undefined,
    to: rangeValid ? to || undefined : undefined,
  });
  const { data: facets, isError: facetsError } = useLogFacets();
  const money = useMoney();
  const data = useMemo(() => pages?.pages.flatMap((page) => page.items) ?? [], [pages]);

  useEffect(() => setSearchDraft(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (searchDraft.trim()) next.set("q", searchDraft.trim());
      else next.delete("q");
      if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    panelRef.current?.querySelector<HTMLButtonElement>("[data-panel-close]")?.focus();
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  useEffect(() => {
    setScrollTop(0);
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
  }, [caller, endpoint, from, issueId, model, provider, query, selectedRange, statusClass, to]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const updateRange = (value: string) => {
    const range = isTimeRange(value) ? value : "all";
    const next = new URLSearchParams(searchParams);
    if (range === "all") {
      next.delete("range");
      next.delete("from");
      next.delete("to");
    } else if (range === "custom") {
      next.set("range", range);
    } else {
      const end = new Date();
      next.set("range", range);
      next.set("from", new Date(end.getTime() - RANGE_MS[range]).toISOString());
      next.set("to", end.toISOString());
    }
    setSearchParams(next, { replace: true });
  };
  const updateCustomDate = (key: "from" | "to", value: string) => {
    const next = new URLSearchParams(searchParams);
    const normalized = fromDateTimeLocal(value);
    if (normalized) next.set(key, normalized);
    else next.delete(key);
    next.set("range", "custom");
    setSearchParams(next, { replace: true });
  };
  const openPanel = (row: LogEntry, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setSelected(row);
  };
  function closePanel() {
    setSelected(null);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const term = query.toLowerCase();
    return rows.filter((row) => !term || [
      row.endpoint,
      row.provider,
      row.method ?? "",
      row.caller ?? "",
      row.model ?? "",
      row.req_hash ?? "",
    ].some((value) => value.toLowerCase().includes(term)));
  }, [data, query]);
  const virtualized = filtered.length > VIRTUALIZE_AFTER;
  const startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIRTUAL_OVERSCAN) : 0;
  const endIndex = virtualized ? Math.min(filtered.length, startIndex + VIRTUAL_ROWS) : filtered.length;
  const visibleRows = filtered.slice(startIndex, endIndex);
  const scrollRegionProps = virtualized ? { tabIndex: 0 } : {};

  return (
    <div>
      <PageHeader title="Logs" description="Raw request metadata flowing through the proxy. Request bodies are never shown." />
      {isLoading && pages === undefined && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading request logs…</p>}
      <div role="group" aria-label="Log filters" className="mb-6 rounded-lg border border-border bg-card p-4 sm:p-5">
        <p className="mb-3 text-sm font-medium">Search and filter</p>
        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.4fr)]">
          <label className="relative flex min-w-0 items-center">
            <Search aria-hidden="true" className="absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search endpoint, provider, model or hash" aria-label="Search logs" className="h-10 w-full pl-9 text-base sm:text-sm" />
          </label>
          <select value={selectedRange} onChange={(event) => updateRange(event.target.value)} aria-label="Filter logs by time range" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">
            <option value="all">Any time</option><option value="15m">Last 15 minutes</option><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option>
          </select>
        </div>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <select value={provider} onChange={(event) => updateParam("provider", event.target.value)} aria-label="Filter logs by provider" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All providers</option>{(facets?.providers ?? ["openai", "stripe", "aws"]).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={statusClass} onChange={(event) => updateParam("status", event.target.value)} aria-label="Filter logs by status" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All statuses</option><option value="2xx">2xx success</option><option value="3xx">3xx redirect</option><option value="4xx">4xx client error</option><option value="5xx">5xx server error</option>
          </select>
          <select value={endpoint} onChange={(event) => updateParam("endpoint", event.target.value)} aria-label="Filter logs by endpoint" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All endpoints</option>{(facets?.endpoints ?? []).map(({ value, count }) => <option key={value} value={value}>{value} ({count})</option>)}
          </select>
          <select value={caller} onChange={(event) => updateParam("caller", event.target.value)} aria-label="Filter logs by caller" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All callers</option>{(facets?.callers ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={model} onChange={(event) => updateParam("model", event.target.value)} aria-label="Filter logs by model" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All models</option>{(facets?.models ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        {selectedRange === "custom" && (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-divider pt-4">
            <label className="grid gap-1 text-xs text-muted-foreground">
              From
              <Input type="datetime-local" value={toDateTimeLocal(from)} onChange={(event) => updateCustomDate("from", event.target.value)} aria-label="Logs from date and time" className="h-10 text-base text-foreground sm:text-sm" />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              To
              <Input type="datetime-local" value={toDateTimeLocal(to)} onChange={(event) => updateCustomDate("to", event.target.value)} aria-label="Logs to date and time" className="h-10 text-base text-foreground sm:text-sm" />
            </label>
            {!rangeValid && <p role="alert" className="text-sm text-destructive">The start time must be earlier than or equal to the end time.</p>}
          </div>
        )}
      </div>
      {facetsError && <p role="status" className="mb-3 text-xs text-muted-foreground">Filter options could not be loaded; use search or the available filters.</p>}
      {query.trim().length > 0 && query.trim().length < 4 && (
        <p role="status" className="mb-3 text-xs text-muted-foreground">Searches across all requests start at four characters; this shorter search checks the loaded rows.</p>
      )}
      {issueId && <p className="mb-3 text-sm text-muted-foreground">Filtered to issue <span className="font-mono">{issueId}</span> · <button type="button" onClick={() => updateParam("issue", "")} className="text-primary hover:underline">Clear issue filter</button></p>}
      {isError && (
        <PageErrorState message="Could not load request logs. No sample data is being shown." onRetry={() => void refetch()} />
      )}
      <Card>
        <div
          ref={tableScrollRef}
          {...scrollRegionProps}
          data-testid="logs-table-viewport"
          role="region"
          aria-label="Request log results"
          className={virtualized ? "max-h-[70vh] overflow-auto" : "min-w-0 overflow-x-hidden md:overflow-x-auto"}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <ul data-testid="mobile-log-results" className="divide-y divide-divider md:hidden">
            {virtualized && startIndex > 0 && <li aria-hidden="true" className="p-0" style={{ height: startIndex * ROW_HEIGHT }} />}
            {visibleRows.map((row) => (
              <li key={row.id} className="flex min-h-14 min-w-0 items-center px-3">
                <button
                  type="button"
                  onClick={(event) => openPanel(row, event.currentTarget)}
                  aria-label={metadataButtonLabel(row)}
                  className="flex min-h-10 w-full min-w-0 items-center gap-3 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <time dateTime={row.timestamp} className="shrink-0">{new Date(row.timestamp).toLocaleTimeString()}</time>
                      <span className="truncate">{row.provider}</span>
                    </span>
                    <span title={row.endpoint} className="block truncate font-mono text-xs font-medium">{row.endpoint}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 font-mono text-xs">
                    <span>{row.status} · {row.latency_ms}ms</span>
                    <span title={isApproximateCost(row.cost_basis) ? `${row.cost_basis === "modelled" ? "Modelled" : "Estimated"} cost` : undefined}>
                      {isApproximateCost(row.cost_basis) ? "~" : ""}{money(row.cost_usd)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {virtualized && endIndex < filtered.length && <li aria-hidden="true" className="p-0" style={{ height: (filtered.length - endIndex) * ROW_HEIGHT }} />}
          </ul>
          <div data-testid="desktop-log-results" className="hidden min-w-0 md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className={`pointer-events-none sticky ${virtualized ? "top-0" : "top-14"} border-b border-divider bg-card text-xs text-muted-foreground`}>
                <tr>{["Time", "Provider", "Endpoint", "Status", "Latency", "Size", "Tokens", "Cost", "Flagged by"].map((heading) => <th key={heading} scope="col" className="px-5 py-3 font-medium">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {virtualized && startIndex > 0 && <tr aria-hidden="true"><td colSpan={9} className="p-0" style={{ height: startIndex * ROW_HEIGHT }} /></tr>}
                {visibleRows.map((row) => (
                  <tr key={row.id} className="h-14 border-b border-divider last:border-0 hover:bg-accent/50">
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">
                      <button type="button" onClick={(event) => openPanel(row, event.currentTarget)} aria-label={metadataButtonLabel(row)} title={new Date(row.timestamp).toISOString()} className="scroll-mt-24 text-left hover:text-foreground">
                        {new Date(row.timestamp).toLocaleTimeString()}
                      </button>
                    </td>
                    <td className="px-5 py-4 capitalize">{row.provider}</td>
                    <td className="max-w-[320px] break-all px-5 py-4 font-mono text-xs"><span className="line-clamp-2" title={row.endpoint}>{row.endpoint}</span></td>
                    <td className="px-5 py-4 font-mono text-xs">{row.status}</td>
                    <td className="px-5 py-4 font-mono text-xs">{row.latency_ms}ms</td>
                    <td className="px-5 py-4 font-mono text-xs">{formatBytes(row.req_size + row.resp_size)}</td>
                    <td className="px-5 py-4 font-mono text-xs">
                      <span title={row.tokens_estimated ? "Estimated tokens" : undefined}>{row.tokens_estimated ? "~" : ""}{(row.prompt_tokens + row.completion_tokens).toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-4 font-mono text-xs">
                      <span title={isApproximateCost(row.cost_basis) ? `${row.cost_basis === "modelled" ? "Modelled" : "Estimated"} cost` : undefined}>{isApproximateCost(row.cost_basis) ? "~" : ""}{money(row.cost_usd)}</span>
                    </td>
                    <td className="px-5 py-4 text-xs text-warning">{row.flagged_by.join(", ") || "—"}</td>
                  </tr>
                ))}
                {virtualized && endIndex < filtered.length && <tr aria-hidden="true"><td colSpan={9} className="p-0" style={{ height: (filtered.length - endIndex) * ROW_HEIGHT }} /></tr>}
              </tbody>
            </table>
          </div>
          {!filtered.length && !isLoading && (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {isError ? "Logs are unavailable until the request succeeds." : "No requests match those filters."}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-5 py-3">
          <p className="text-xs text-muted-foreground">Showing {filtered.length.toLocaleString()} of {data.length.toLocaleString()} loaded requests{hasNextPage ? " · more available" : ""}.</p>
          {hasNextPage && (
            <button type="button" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className="rounded-md px-3 py-1.5 text-sm font-medium text-primary hover:bg-accent disabled:opacity-60">
              {isFetchingNextPage ? "Loading more…" : "Load more"}
            </button>
          )}
        </div>
      </Card>
      {selected && (
        <div className="fixed inset-0 z-40 bg-black/30">
          <button type="button" aria-label="Close details panel" onClick={closePanel} className="absolute inset-0 h-full w-full cursor-default" />
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="log-detail-title" className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto overscroll-contain border-l border-border bg-card p-6">
            <button data-panel-close type="button" aria-label="Close request details" onClick={closePanel} className="float-right rounded p-1 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
            <h2 id="log-detail-title" className="text-lg font-semibold">Request metadata</h2>
            <dl className="mt-8 space-y-4 text-sm">
              {Object.entries({
                "Request ID": selected.id,
                Time: new Date(selected.timestamp).toLocaleString(),
                Provider: selected.provider,
                Method: selected.method ?? "Not provided by API",
                Endpoint: selected.endpoint,
                Status: selected.status,
                Latency: `${selected.latency_ms}ms`,
                "Request size": formatBytes(selected.req_size),
                "Response size": formatBytes(selected.resp_size),
                "Time to first byte": selected.ttfb_ms == null ? "Not provided" : `${selected.ttfb_ms}ms`,
                "Prompt tokens": `${selected.tokens_estimated ? "~" : ""}${selected.prompt_tokens.toLocaleString()}`,
                "Completion tokens": `${selected.tokens_estimated ? "~" : ""}${selected.completion_tokens.toLocaleString()}`,
                "Tokens estimated": selected.tokens_estimated ? "Yes" : "No",
                "Streaming response": selected.stream ? "Yes" : "No",
                [selected.cost_basis === "modelled" ? "Modelled cost" : "Estimated cost"]: `${isApproximateCost(selected.cost_basis) ? "~" : ""}${money(selected.cost_usd)}`,
                "Cost basis": selected.cost_basis,
                "Pricing version": selected.pricing_version ?? "Not provided",
                "Payload hash": selected.req_hash ?? "Not provided by API",
                Caller: selected.caller || "Not provided by API",
                Model: selected.model || "Not provided by API",
                "Idempotency key": selected.has_idempotency_key ? "Present" : "Absent",
                "Error code": selected.error_code ?? "None",
                Origin: selected.origin,
                "Demo data": selected.is_demo ? "Yes" : "No",
                "Flagged by": selected.flagged_issues.map((flag) => flag.rule_id).join(", ") || "None",
              }).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 border-b border-divider pb-3"><dt className="text-muted-foreground">{key}</dt><dd className="max-w-[60%] break-all text-right font-mono text-xs">{value}</dd></div>
              ))}
            </dl>
            {selected.issue_ids?.length ? (
              <div className="mt-6 space-y-2">
                <h3 className="text-sm font-medium">Related issues</h3>
                {selected.issue_ids.map((id) => <Link key={id} to={`/app/issues?open=${encodeURIComponent(id)}`} className="block text-sm text-primary hover:underline">{id}</Link>)}
              </div>
            ) : <p className="mt-6 text-xs text-muted-foreground">No linked issue IDs were returned for this request.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}
