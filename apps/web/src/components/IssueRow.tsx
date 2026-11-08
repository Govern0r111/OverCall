import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import type { Issue } from "../lib/api";
import { PROVIDER_NAME, formatInt } from "../lib/format";
import { useMoney } from "../context/AppContext";
import { SeverityBadge, TierBadge } from "./Badges";
import { IssueDetail } from "./IssueDetail";

const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-critical",
  warning: "bg-warning",
  info: "bg-muted-foreground",
};

export const IssueRow = ({ issue, index, open, onToggle, issueHref }: {
  issue: Issue;
  index: number;
  open?: boolean;
  onToggle?: () => void;
  issueHref?: string;
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const expanded = open ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen((current) => !current));
  const money = useMoney();
  return (
    <li data-testid={`issue-row-${index}`} className="border-b border-divider last:border-b-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        data-testid={`issue-row-expand-button-${index}`}
        className="group flex w-full min-w-0 items-start gap-2 px-3 py-4 text-left transition-colors hover:bg-accent/50 sm:gap-4 sm:px-5 sm:py-5"
      >
        <span className={cn("mt-2 h-8 w-0.5 shrink-0 rounded-full", SEVERITY_BAR[issue.severity])} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={issue.severity} testId={`issue-severity-${index}`} />
            <span className="text-sm font-medium">{issue.title}</span>
          </div>
          <p className="mt-2 max-w-3xl break-words text-sm leading-relaxed text-muted-foreground">{issue.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <span>{PROVIDER_NAME[issue.provider]}</span>
            <span className="text-divider">·</span>
            <span className="break-all font-mono">{issue.endpoint}</span>
            <span className="text-divider">·</span>
            <span className="font-mono">{formatInt(issue.affected_count)} requests</span>
            <TierBadge tier={issue.tier} confidence={issue.experimental ? issue.confidence : undefined} testId={`issue-tier-${index}`} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div data-testid={`issue-savings-${index}`} className="font-mono text-sm font-medium text-savings">
            {money(issue.projected_monthly_usd)}
            <span className="text-muted-foreground">/mo</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">projected</div>
        </div>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none group-hover:text-foreground", expanded && "rotate-180")} />
      </button>
      {issueHref && (
        <div className="-mt-2 flex justify-end px-5 pb-4">
          <Link
            to={issueHref}
            aria-label={`View in Issues: ${issue.title}`}
            className="text-xs font-medium text-primary hover:underline"
          >
            View in Issues
          </Link>
        </div>
      )}
      <div className={cn("grid motion-safe:transition-[grid-template-rows] motion-reduce:transition-none duration-200 ease-out", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">{expanded && <IssueDetail issue={issue} index={index} />}</div>
      </div>
    </li>
  );
};
