import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X } from "lucide-react";
import { PageHeader, Card } from "../components/PageHeader";
import { useLogs } from "../hooks/queries";
import { useMoney } from "../context/AppContext";
import { PageSkeleton } from "./Overview";
import type { LogEntry } from "../lib/api";

type TimeRange = "all" | "15m" | "1h" | "24h" | "7d" | "30d";
const RANGE_MS: Record<Exclude<TimeRange, "all">, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
  "30d": 30 * 24 * 60 * 60_000,
};

export default function Logs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [searchDraft, setSearchDraft] = useState(query);
  const selectedRange = (searchParams.get("range") as TimeRange | null) ?? "all";
  const provider = searchParams.get("provider") ?? "";
  const statusClass = searchParams.get("status") ?? "";
  const issueId = searchParams.get("issue");
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const { data, isLoading, isError, refetch } = useLogs({ provider });
  const money = useMoney();

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

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
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
    const cutoff = selectedRange === "all" ? 0 : Date.now() - RANGE_MS[selectedRange];
    return rows.filter((row) =>
      (!term || row.endpoint.toLowerCase().includes(term) || row.provider.toLowerCase().includes(term) ||
        (row.caller ?? "").toLowerCase().includes(term) || (row.model ?? "").toLowerCase().includes(term) ||
        (row.req_hash ?? "").toLowerCase().includes(term)) &&
      (!statusClass || `${Math.floor(row.status / 100)}xx` === statusClass) &&
      (!issueId || row.issue_ids?.includes(issueId)) &&
      (!cutoff || new Date(row.timestamp).getTime() >= cutoff)
    );
  }, [data, issueId, query, selectedRange, statusClass]);

  if (isLoading && !data) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="Logs" description="Raw request metadata flowing through the proxy. Request bodies are never shown." />
      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search endpoint, provider, model or hash" aria-label="Search logs" className="h-10 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm" />
        </label>
        <select value={provider} onChange={(event) => updateParam("provider", event.target.value)} aria-label="Filter logs by provider" className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">All providers</option><option value="openai">OpenAI</option><option value="stripe">Stripe</option><option value="aws">AWS</option>
        </select>
        <select value={statusClass} onChange={(event) => updateParam("status", event.target.value)} aria-label="Filter logs by status" className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="">All statuses</option><option value="2xx">2xx success</option><option value="4xx">4xx client error</option><option value="5xx">5xx server error</option>
        </select>
        <select value={selectedRange} onChange={(event) => updateParam("range", event.target.value)} aria-label="Filter logs by time range" className="h-10 rounded-md border border-input bg-card px-3 text-sm">
          <option value="all">Any time</option><option value="15m">Last 15 minutes</option><option value="1h">Last hour</option><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
        </select>
      </div>
      {issueId && <p className="mb-3 text-sm text-muted-foreground">Filtered to issue <span className="font-mono">{issueId}</span> · <button type="button" onClick={() => updateParam("issue", "")} className="text-primary hover:underline">Clear issue filter</button></p>}
      {isError && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">Could not load request logs. No sample data is being shown.</p>
          <button type="button" onClick={() => void refetch()} className="text-primary hover:underline">Try again</button>
        </div>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="pointer-events-none sticky top-14 border-b border-divider bg-card text-xs text-muted-foreground">
              <tr>{["Time", "Provider", "Endpoint", "Status", "Latency", "Size", "Tokens", "Cost", "Flagged by"].map((heading) => <th key={heading} scope="col" className="px-5 py-3 font-medium">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-divider last:border-0 hover:bg-accent/50">
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">
                    <button type="button" onClick={(event) => openPanel(row, event.currentTarget)} aria-label={`Open metadata for ${row.provider} ${row.endpoint} at ${new Date(row.timestamp).toLocaleString()}`} title={new Date(row.timestamp).toISOString()} className="scroll-mt-24 text-left hover:text-foreground">
                      {new Date(row.timestamp).toLocaleTimeString()}
                    </button>
                  </td>
                  <td className="px-5 py-4 capitalize">{row.provider}</td>
                  <td className="max-w-[320px] break-all px-5 py-4 font-mono text-xs">{row.endpoint}</td>
                  <td className="px-5 py-4 font-mono text-xs">{row.status}</td>
                  <td className="px-5 py-4 font-mono text-xs">{row.latency_ms}ms</td>
                  <td className="px-5 py-4 font-mono text-xs">{formatBytes(row.req_size + row.resp_size)}</td>
                  <td className="px-5 py-4 font-mono text-xs">{(row.prompt_tokens + row.completion_tokens).toLocaleString()}</td>
                  <td className="px-5 py-4 font-mono text-xs">{money(row.cost_usd)}</td>
                  <td className="px-5 py-4 text-xs text-warning">{row.flagged_by.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">{isError ? "Logs are unavailable until the API can be reached." : "No requests match those filters."}</p>}
        </div>
        <p className="border-t border-divider px-5 py-3 text-xs text-muted-foreground">Showing the newest {data?.length ?? 0} requests available from the API (up to 200).</p>
      </Card>
      {selected && (
        <div className="fixed inset-0 z-40 bg-black/30" onMouseDown={(event) => { if (event.target === event.currentTarget) closePanel(); }}>
          <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="log-detail-title" className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border bg-card p-6">
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
                "Prompt tokens": selected.prompt_tokens.toLocaleString(),
                "Completion tokens": selected.completion_tokens.toLocaleString(),
                "Estimated cost": `~${money(selected.cost_usd)}`,
                "Payload hash": selected.req_hash ?? "Not provided by API",
                Caller: selected.caller || "Not provided by API",
                Model: selected.model || "Not provided by API",
                "Flagged by": selected.flagged_by.join(", ") || "None",
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
