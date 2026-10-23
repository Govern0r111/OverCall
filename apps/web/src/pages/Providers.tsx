import { PageHeader, Card } from "../components/PageHeader";
import { CopyField } from "../components/CopyField";
import { PricingTable } from "../components/PricingTable";
import { useProviders } from "../hooks/queries";
import { PROXY_URLS, Provider } from "../lib/api";
import { PROVIDER_NAME, formatInt, timeAgo } from "../lib/format";
import { cn } from "../lib/utils";
import { PageSkeleton } from "./Overview";
import { useState } from "react";
import { copyToClipboard } from "../lib/clipboard";
import { toast } from "sonner";

const STATUS: Record<Provider["status"], { label: string; dot: string; ring: string }> = {
  receiving_traffic: { label: "Receiving traffic", dot: "bg-savings", ring: "ring-savings/20" },
  demo_only: { label: "Demo data only", dot: "bg-muted-foreground", ring: "" },
  waiting: { label: "Waiting for first request", dot: "border border-muted-foreground", ring: "" },
  stubbed: { label: "Coming soon", dot: "border border-muted-foreground", ring: "" },
};

const UPSTREAM: Record<string, string> = {
  mock: "Local mock LLM server",
  real: "api.openai.com (pass-through)",
  test: "Stripe test mode",
};

const PROVIDER_ICON: Record<string, string> = { openai: "AI", stripe: "$", aws: "☁" };

const Stat = ({ label, value, testId }: { label: string; value: string; testId: string }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd data-testid={testId} className="mt-1 font-mono text-sm">{value}</dd>
  </div>
);

const ProviderCard = ({ p }: { p: Provider }) => {
  const s = STATUS[p.status];
  const [snippetCopied, setSnippetCopied] = useState(false);
  const baseUrl = PROXY_URLS[p.id];
  const snippet = p.id === "openai"
    ? `curl "${baseUrl}/chat/completions" \\\n  -H "Authorization: Bearer $OPENAI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'`
    : `curl "${baseUrl}/v1/payment_intents" \\\n  -u "$STRIPE_TEST_KEY:"`;
  const copySnippet = async () => {
    try {
      await copyToClipboard(snippet);
      setSnippetCopied(true);
      window.setTimeout(() => setSnippetCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the setup snippet. Select and copy it instead.");
    }
  };
  return (
    <Card testId={`provider-card-${p.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-accent font-mono text-sm text-muted-foreground">
            {PROVIDER_ICON[p.id]}
          </div>
          <h2 className="text-sm font-medium">{PROVIDER_NAME[p.id]}</h2>
        </div>
        <span
          data-testid={`provider-status-${p.id}`}
          className={cn(
            "flex items-center gap-2 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground",
            p.status === "receiving_traffic" && "border-savings/20 bg-savings/[0.06] text-savings",
          )}
        >
          {p.status === "receiving_traffic" ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-savings opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-savings" />
            </span>
          ) : (
            <span className={cn("h-2 w-2 rounded-full", s.dot)} />
          )}
          {s.label}
        </span>
      </div>
      <div className="space-y-6 px-6 py-6">
        {p.id !== "aws" ? (
          <>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Proxy base URL · upstream: {UPSTREAM[p.upstream_mode ?? "test"]}</p>
              <CopyField value={PROXY_URLS[p.id]} testId={`provider-${p.id}-copy-url-button`} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium">Quick start · cURL</h3>
                <button type="button" onClick={() => void copySnippet()} className="text-xs text-primary hover:underline" aria-live="polite">{snippetCopied ? "Copied" : "Copy snippet"}</button>
              </div>
              <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed"><code>{snippet}</code></pre>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Use your own provider key in the environment variable shown. Overcall forwards it to the provider and does not store it.
                {p.id === "stripe" && " Use a Stripe test key only; live keys are rejected."}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label="Via proxy" value={formatInt(p.counts.proxy)} testId={`provider-${p.id}-proxy-count`} />
              <Stat label="Demo data" value={formatInt(p.counts.demo)} testId={`provider-${p.id}-synthetic-count`} />
              <Stat label="Open issues" value={formatInt(p.issue_count)} testId={`provider-${p.id}-issue-count`} />
              <Stat label="Last proxied" value={timeAgo(p.last_proxy_request_at)} testId={`provider-${p.id}-last-seen`} />
            </dl>
          </>
        ) : (
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-sm font-medium">AWS support is coming soon.</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.pricing.notes}</p>
          </div>
        )}
        <PricingTable provider={p} />
        {p.id !== "aws" && (
          <section className="border-t border-divider pt-5" aria-labelledby={`provider-${p.id}-keys`}>
            <h3 id={`provider-${p.id}-keys`} className="text-sm font-medium">{PROVIDER_NAME[p.id]} ingest keys</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This API version does not provide ingest-key creation, listing, or revocation endpoints. Provider credentials in the setup snippet are forwarded only; they are not Overcall ingest keys.
            </p>
          </section>
        )}
      </div>
    </Card>
  );
};

export default function Providers() {
  const { data, isLoading } = useProviders();
  if (isLoading || !data) return <PageSkeleton />;
  return (
    <div>
      <PageHeader
        title="Providers"
        description="Where your traffic goes, whether we're seeing it, and the pricing we use to estimate cost. API keys are forwarded to the provider and never stored."
      />
      <div className="space-y-6">{data.map((p) => <ProviderCard key={p.id} p={p} />)}</div>
    </div>
  );
}
