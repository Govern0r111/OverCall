import { Database, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppAuth } from "../auth/AuthContext";
import { useLoadSynthetic } from "../hooks/queries";
import { Button } from "./ui/button";

interface EmptyStateProps {
  hasProxyTraffic?: boolean;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;
}

export const EmptyState = ({
  hasProxyTraffic = false,
  isAnalyzing = false,
  onAnalyze,
}: EmptyStateProps) => {
  const { isDemo } = useAppAuth();
  const load = useLoadSynthetic();

  return (
    <section
      data-testid="empty-state"
      className="mb-7 flex flex-col gap-5 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.06]">
          <ShieldCheck aria-hidden="true" className="h-5 w-5 text-primary" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">
            {hasProxyTraffic ? "Traffic is ready to analyze" : "Waiting for your first request"}
          </h2>
          <p className="mt-1 max-w-[64ch] text-sm leading-6 text-muted-foreground">
            {hasProxyTraffic
              ? "Your request metadata is flowing through Overcall. Run detection to review spend, reliability findings, and practical fixes."
              : "Route real requests through an Overcall provider to see spend, reliability findings, and practical fixes. Request bodies are never shown."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {hasProxyTraffic ? (
          <Button
            type="button"
            size="sm"
            data-testid="analyze-traffic-button"
            onClick={onAnalyze}
            disabled={isAnalyzing || !onAnalyze}
            className="gap-2"
          >
            {isAnalyzing && (
              <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin motion-reduce:hidden" />
            )}
            {isAnalyzing ? "Analyzing traffic…" : "Analyze traffic"}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link to="/app/providers">Set up a provider</Link>
          </Button>
        )}
        {isDemo && (
          <Button
            data-testid="load-synthetic-data-button"
            variant="outline"
            size="sm"
            onClick={() => load.mutate(42)}
            disabled={load.isPending}
            className="gap-2"
          >
            {load.isPending ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin motion-reduce:hidden" />
            ) : (
              <Database aria-hidden="true" className="h-4 w-4" />
            )}
            {load.isPending ? "Loading demo data…" : "Load demo data"}
          </Button>
        )}
      </div>
    </section>
  );
};
