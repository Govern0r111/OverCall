import { Database, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { CopyField } from "./CopyField";
import { useLoadSynthetic } from "../hooks/queries";
import { PROXY_URLS } from "../lib/api";

const SNIPPETS = {
  openai: `from openai import OpenAI\n\nclient = OpenAI(base_url="${PROXY_URLS.openai}")`,
  stripe: `import stripe\n\nstripe.api_key = "sk_test_..."\nstripe.api_base = "${PROXY_URLS.stripe}"`,
};

const Step = ({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) => (
  <li className="grid grid-cols-[28px_1fr] gap-3">
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border font-mono text-xs text-muted-foreground">{n}</span>
    <div className="min-w-0 space-y-3">
      <p className="pt-0.5 text-sm font-medium">{title}</p>
      {children}
    </div>
  </li>
);

export const EmptyState = () => {
  const load = useLoadSynthetic();
  return (
    <section data-testid="empty-state" className="max-w-3xl rounded-lg border border-border bg-card p-8 lg:p-10">
      <h2 className="text-2xl font-semibold tracking-tight">Nothing to show yet</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Once requests flow through API Cost Guard, this page shows how much you could save each month, a daily cost trend,
        and the most expensive wasteful patterns — each with a plain-language fix.
      </p>
      <Tabs defaultValue="openai" className="mt-8">
        <ol className="space-y-7">
          <Step n={1} title="Copy your proxy URL">
            <TabsList data-testid="empty-state-provider-tabs">
              <TabsTrigger value="openai" data-testid="empty-state-tab-openai">OpenAI</TabsTrigger>
              <TabsTrigger value="stripe" data-testid="empty-state-tab-stripe">Stripe (test mode)</TabsTrigger>
            </TabsList>
            {(["openai", "stripe"] as const).map((p) => (
              <TabsContent key={p} value={p} className="mt-0 space-y-3">
                <CopyField value={PROXY_URLS[p]} testId={p === "openai" ? "copy-proxy-url-button" : "copy-stripe-proxy-url-button"} />
                <pre className="overflow-x-auto rounded-md border border-border bg-background p-4 font-mono text-xs leading-relaxed">{SNIPPETS[p]}</pre>
              </TabsContent>
            ))}
          </Step>
          <Step n={2} title="Use it as your SDK's base URL, then make a request as usual" />
          <Step n={3} title="Come back here — requests appear within about 15 seconds" />
        </ol>
      </Tabs>
      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-6">
        <p className="max-w-md text-sm text-muted-foreground">
          No traffic handy? Load a realistic 7-day demo dataset with known waste patterns.
        </p>
        <Button data-testid="load-synthetic-data-button" onClick={() => load.mutate(42)} disabled={load.isPending}>
          {load.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
          {load.isPending ? "Loading demo data…" : "Load synthetic data"}
        </Button>
      </div>
    </section>
  );
};
