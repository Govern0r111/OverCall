import { Info } from "lucide-react";
import type { Overview } from "../lib/api";
import { formatInt } from "../lib/format";
import { useMoney } from "../context/AppContext";
import { Card } from "./PageHeader";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

export const ReliabilityFigure = ({ data, hasMeasurements = true }: { data: Overview; hasMeasurements?: boolean }) => {
  const money = useMoney();

  return (
    <Card testId="reliability-figure-card" className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="reliability-figure-title" className="text-sm font-medium">Reliability findings</h2>
          <p data-testid="reliability-count" className="mt-3 font-mono text-4xl font-medium tracking-tight tabular-nums">
            {hasMeasurements ? formatInt(data.reliability_count) : "—"}
          </p>
        </div>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About reliability findings"
                className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <Info aria-hidden="true" className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-left">
              Reliability findings are performance signals, not cash savings. Their modelled overhead is not billed by Stripe, so it stays separate from estimated spend savings.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <p data-testid="reliability-overhead" className="mt-4 text-sm text-muted-foreground">
        Modelled overhead: <span className="font-mono tabular-nums">{hasMeasurements ? `${money(data.reliability_overhead_monthly_usd)}/mo` : "—"}</span>
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {hasMeasurements
          ? "Not billed by Stripe or included in estimated spend savings."
          : "Waiting for first traffic. Reliability estimates appear after requests are analyzed."}
      </p>
    </Card>
  );
};
