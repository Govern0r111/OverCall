import axios from "axios";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { PageHeader, Card } from "../components/PageHeader";
import { PageErrorState } from "../components/PageErrorState";
import { CopyField } from "../components/CopyField";
import { PricingTable } from "../components/PricingTable";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  useCreateIngestKey,
  useIngestKeys,
  useProviders,
  useRevokeIngestKey,
} from "../hooks/queries";
import type { ApiIngestKey, ApiIngestKeyCreated, Provider } from "../lib/api";
import { PROVIDER_NAME, formatInt, timeAgo } from "../lib/format";
import { copyToClipboard } from "../lib/clipboard";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const STATUS: Record<Provider["status"], { label: string; dot: string }> = {
  receiving_traffic: { label: "Receiving traffic", dot: "bg-savings" },
  demo_only: { label: "Demo data only", dot: "bg-muted-foreground" },
  waiting: { label: "Waiting for first request", dot: "border border-muted-foreground" },
  coming_soon: { label: "Coming soon", dot: "border border-muted-foreground" },
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
  const status = STATUS[p.status];
  const [selectedSnippetId, setSelectedSnippetId] = useState(p.snippets[0]?.id ?? "");
  const [snippetCopied, setSnippetCopied] = useState(false);
  const selectedSnippet = p.snippets.find((snippet) => snippet.id === selectedSnippetId) ?? p.snippets[0];
  const baseUrl = p.proxy_base_url.replace(/\/+$/, "");

  const selectSnippet = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % p.snippets.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + p.snippets.length) % p.snippets.length;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = p.snippets[nextIndex];
    setSelectedSnippetId(next.id);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-snippet-index="${nextIndex}"]`)?.focus();
  };

  const copySnippet = async () => {
    if (!selectedSnippet) return;
    try {
      await copyToClipboard(selectedSnippet.code);
      setSnippetCopied(true);
      window.setTimeout(() => setSnippetCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the setup snippet. Select and copy it instead.");
    }
  };

  return (
    <Card testId={`provider-card-${p.id}`}>
      <section aria-labelledby={`provider-${p.id}-title`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-accent font-mono text-sm text-muted-foreground">
              {PROVIDER_ICON[p.id]}
            </div>
            <h2 id={`provider-${p.id}-title`} className="text-base font-semibold tracking-tight">{PROVIDER_NAME[p.id]}</h2>
          </div>
          <span
            data-testid={`provider-status-${p.id}`}
            className={cn(
              "flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground",
              p.status === "receiving_traffic" && "border-savings/20 bg-savings/[0.06] text-savings",
            )}
          >
            {p.status === "receiving_traffic" ? (
              <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-savings opacity-60 motion-safe:animate-ping motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-savings" />
              </span>
            ) : (
              <span className={cn("h-2 w-2 rounded-full", status.dot)} />
            )}
            {status.label}
          </span>
        </div>
        <div className="space-y-6 px-6 py-6">
          {p.id !== "aws" ? (
            <>
            <div>
              <p className="mb-2 text-xs text-muted-foreground">Proxy base URL · upstream: {UPSTREAM[p.upstream_mode ?? "test"]}</p>
              <CopyField value={baseUrl} testId={`provider-${p.id}-copy-url-button`} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-xs font-medium">Quick start</h3>
                {selectedSnippet && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => void copySnippet()} aria-live="polite">
                    {snippetCopied ? "Copied" : "Copy snippet"}
                  </Button>
                )}
              </div>
              {p.snippets.length > 0 && selectedSnippet ? (
                <>
                  <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label={`${p.name} setup language`}>
                    {p.snippets.map((snippet, index) => (
                      <button
                        key={`${snippet.id}-${index}`}
                        type="button"
                        role="tab"
                        id={`provider-${p.id}-snippet-tab-${index}`}
                        aria-controls={`provider-${p.id}-snippet-panel`}
                        aria-selected={selectedSnippet.id === snippet.id}
                        tabIndex={selectedSnippet.id === snippet.id ? 0 : -1}
                        data-snippet-index={index}
                        onClick={() => setSelectedSnippetId(snippet.id)}
                        onKeyDown={(event) => selectSnippet(event, index)}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                          selectedSnippet.id === snippet.id && "bg-accent text-foreground",
                        )}
                      >
                        {snippet.label}
                      </button>
                    ))}
                  </div>
                  <div
                    id={`provider-${p.id}-snippet-panel`}
                    role="tabpanel"
                    aria-labelledby={`provider-${p.id}-snippet-tab-${p.snippets.findIndex((snippet) => snippet.id === selectedSnippet.id)}`}
                    tabIndex={0}
                  >
                    <textarea
                      readOnly
                      aria-label={`${p.name} ${selectedSnippet.label} setup snippet`}
                      value={selectedSnippet.code}
                      rows={Math.min(8, Math.max(1, selectedSnippet.code.split(/\r?\n/).length))}
                      wrap="off"
                      spellCheck={false}
                      className="block w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed"
                    />
                  </div>
                </>
              ) : (
                <p role="alert" className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
                  Setup snippets are unavailable for this provider.
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Provider credentials are read from your environment and forwarded, never stored by Overcall.
                {p.id === "stripe" && <> <span className="font-medium text-foreground">Stripe test keys only.</span> Stripe does not bill per call; cost is a modelled overhead.</>}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label="Via proxy" value={formatInt(p.traffic.proxy)} testId={`provider-${p.id}-proxy-count`} />
              <Stat label="Demo data" value={formatInt(p.traffic.demo)} testId={`provider-${p.id}-synthetic-count`} />
              <Stat label="Last proxied" value={timeAgo(p.traffic.last_request_at)} testId={`provider-${p.id}-last-seen`} />
            </dl>
          </>
          ) : (
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-medium">AWS support is coming soon.</p>
              {p.notes && <p className="mt-1 text-sm text-muted-foreground">{p.notes}</p>}
            </div>
          )}
          <PricingTable provider={p} />
        </div>
      </section>
    </Card>
  );
};

const createErrorMessage = (error: unknown) =>
  axios.isAxiosError(error) && error.response?.status === 409
    ? "You have reached the five-key limit. Revoke an unused key before creating another."
    : "Couldn't create an ingest key. Check your connection and try again.";

const IngestKeyCard = () => {
  const keysQuery = useIngestKeys();
  const createKey = useCreateIngestKey();
  const revoke = useRevokeIngestKey();
  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<ApiIngestKeyCreated | null>(null);
  const [createError, setCreateError] = useState("");
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiIngestKey | null>(null);

  const openCreateDialog = () => {
    setKeyName("");
    setCreateError("");
    setCreatedKey(null);
    setCopied(false);
    setCreateOpen(true);
  };

  const handleCreateDialogChange = (open: boolean) => {
    if (!open && createdKey) return;
    setCreateOpen(open);
    if (!open) {
      setKeyName("");
      setCreateError("");
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = keyName.trim();
    if (!name || name.length > 60) {
      setCreateError("Enter a key name between 1 and 60 characters.");
      return;
    }
    setCreateError("");
    try {
      setCreatedKey(await createKey(name));
    } catch (error) {
      setCreateError(createErrorMessage(error));
    }
  };

  const copyCreatedKey = async () => {
    if (!createdKey) return;
    try {
      await copyToClipboard(createdKey.key);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy the key. Focus the field and select the value to copy it manually.");
    }
  };

  const acknowledgeSavedKey = () => {
    setCreatedKey(null);
    setCreateOpen(false);
    setCopied(false);
  };

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    revoke.mutate(revokeTarget.id, { onSuccess: () => setRevokeTarget(null) });
  };

  return (
    <Card testId="ingest-key-card">
      <section className="space-y-4 p-6" aria-labelledby="ingest-keys-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="ingest-keys-heading" className="text-sm font-medium">Overcall ingest keys</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Use these keys in the <code className="font-mono">X-Overcall-Key</code> header. Plaintext is shown once; only a one-way hash is stored.
            </p>
          </div>
          <Button type="button" size="sm" onClick={openCreateDialog} disabled={keysQuery.isLoading}>
            Create ingest key
          </Button>
        </div>

        {keysQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading ingest keys…</p>
        ) : keysQuery.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <span>Couldn't load ingest keys. Please try again.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void keysQuery.refetch()}>Retry</Button>
          </div>
        ) : keysQuery.data?.length ? (
          <ul className="divide-y divide-divider rounded-md border border-divider">
            {keysQuery.data.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {key.prefix} · Created {timeAgo(key.created_at)} · Last used {key.last_used_at ? timeAgo(key.last_used_at) : "Never"}
                  </p>
                </div>
                {key.revoked_at ? (
                  <span className="text-xs text-muted-foreground">Revoked</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Revoke ${key.name}`}
                    disabled={revoke.isPending}
                    onClick={() => {
                      revoke.reset();
                      setRevokeTarget(key);
                    }}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed border-divider p-4 text-sm text-muted-foreground">
            No ingest keys yet. Create one to connect an application.
          </p>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={handleCreateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ingest key</DialogTitle>
            <DialogDescription>
              {createdKey ? "Copy this key now. Overcall will not show the plaintext again." : "Choose a name so you can identify where this key is used."}
            </DialogDescription>
          </DialogHeader>
          {createdKey ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="created-ingest-key" className="mb-2 block text-sm font-medium">Your ingest key</label>
                <div className="flex gap-2">
                  <Input
                    id="created-ingest-key"
                    aria-label="Your ingest key"
                    readOnly
                    value={createdKey.key}
                    onFocus={(event) => event.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={() => void copyCreatedKey()}>
                    {copied ? "Copied" : "Copy key"}
                  </Button>
                </div>
              </div>
              <p role="status" className="text-sm text-muted-foreground">Keep this key in a secret manager, not in source control.</p>
              <DialogFooter>
                <Button type="button" onClick={acknowledgeSavedKey}>I have saved it</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={(event) => void handleCreate(event)} className="space-y-4">
              <div>
                <label htmlFor="ingest-key-name" className="mb-2 block text-sm font-medium">Key name</label>
                <Input
                  id="ingest-key-name"
                  aria-label="Key name"
                  value={keyName}
                  maxLength={60}
                  autoComplete="off"
                  onChange={(event) => setKeyName(event.target.value)}
                />
              </div>
              {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
              <DialogFooter>
                <Button type="submit" disabled={!keyName.trim() || keyName.trim().length > 60}>
                  Create key
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(revokeTarget)} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke ingest key?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget ? `“${revokeTarget.name}” will stop authenticating immediately. This cannot be undone.` : "This key will stop authenticating immediately."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revoke.isError && <p role="alert" className="text-sm text-destructive">Couldn't revoke the key. Please try again.</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Keep key</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={revoke.isPending} onClick={confirmRevoke}>
              {revoke.isPending ? "Revoking…" : "Revoke key"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default function Providers() {
  const { data, isLoading, isError, refetch } = useProviders();
  return (
    <div>
      <PageHeader
        title="Providers"
        description="Connect supported traffic and manage the Overcall keys used by your apps."
      />
      <p className="-mt-5 mb-7 max-w-[70ch] text-sm leading-6 text-muted-foreground">
        Provider credentials are forwarded, not stored. Ingest keys are stored only as one-way hashes.
      </p>
      {isLoading && !data && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading provider configuration…</p>}
      {isError && <PageErrorState message="Provider configuration could not be loaded." onRetry={() => void refetch()} />}
      <div className="space-y-6">
        {(data ?? []).map((provider) => <ProviderCard key={provider.id} p={provider} />)}
        <IngestKeyCard />
      </div>
    </div>
  );
}
