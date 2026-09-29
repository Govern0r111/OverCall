import { Link } from "react-router-dom";
import { Database } from "lucide-react";

export const DemoBanner = () => (
  <div
    data-testid="demo-data-banner"
    className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-5 py-3 text-sm"
  >
    <span className="flex items-center gap-2.5 text-muted-foreground">
      <Database className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      You're looking at synthetic demo data. Point your app at the proxy to see your own traffic.
    </span>
    <Link to="/providers" data-testid="demo-banner-proxy-link" className="text-sm font-medium text-primary hover:underline">
      Get proxy URL
    </Link>
  </div>
);
