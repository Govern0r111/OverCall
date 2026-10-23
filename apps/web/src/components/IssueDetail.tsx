import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Issue, SampleRequest } from "../lib/api";
import { formatBytes, formatInt, formatTime } from "../lib/format";
import { useMoney } from "../context/AppContext";
import { copyToClipboard } from "../lib/clipboard";

const Meta = ({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd data-testid={testId} className="mt-1 font-mono text-xs">{value}</dd>
  </div>
);

const SampleTable = ({ rows }: { rows: SampleRequest[] }) => {
  const money = useMoney();
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] font-mono text-xs">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b border-divider">
            {["Time", "Status", "Size", "Payload hash", "Cost"].map((h) => (
              <th key={h} className="px-3 py-2 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-divider last:border-b-0">
              <td title={new Date(r.timestamp).toISOString()} className="whitespace-nowrap px-3 py-2">{formatTime(r.timestamp)}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="px-3 py-2">{formatBytes(r.req_size + r.resp_size)}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.req_hash}</td>
              <td className="px-3 py-2">{money(r.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const IssueDetail = ({ issue, index }: { issue: Issue; index: number }) => {
  const money = useMoney();
  const [copied, setCopied] = useState(false);
  const copyFix = async () => {
    try {
      await copyToClipboard(issue.suggested_fix);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the suggested fix. Select and copy the text instead.");
    }
  };
  return (
    <div data-testid={`issue-detail-${index}`} className="space-y-6 border-t border-divider bg-background/60 px-5 py-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">What we detected</h4>
          <p className="text-sm leading-relaxed">{issue.explanation}</p>
        </div>
        <div>
          <h4 className="mb-2 text-xs text-muted-foreground">Why it costs money</h4>
          <p className="text-sm leading-relaxed">{issue.summary}</p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-xs text-muted-foreground">Suggested fix</h4>
            <button type="button" onClick={() => void copyFix()} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline" aria-label="Copy suggested fix">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p data-testid="issue-suggested-fix" className="text-sm leading-relaxed">{issue.suggested_fix}</p>
        </div>
      </div>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <Meta label="Rule" value={issue.rule_id} />
        <Meta label="Affected requests" value={formatInt(issue.affected_count)} />
        <Meta label="Waste in observed window" value={money(issue.estimated_savings_usd)} />
        <Meta label="Projected monthly" value={money(issue.projected_monthly_usd)} />
        {issue.experimental && <Meta label="Confidence" value={`${Math.round(issue.confidence * 100)}%`} testId="issue-confidence" />}
      </dl>
      <div>
        <h4 className="mb-2 text-xs text-muted-foreground">Sample requests ({issue.sample_requests.length} of {formatInt(issue.affected_count)})</h4>
        <SampleTable rows={issue.sample_requests} />
      </div>
      <Link to={`/app/logs?issue=${encodeURIComponent(issue.id)}`} className="inline-flex text-sm text-primary hover:underline">View matching requests in logs</Link>
    </div>
  );
};
