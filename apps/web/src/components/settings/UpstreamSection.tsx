import { useEffect, useRef, useState } from "react";
import { useApp } from "../../context/AppContext";
import { useSaveSettings } from "../../hooks/queries";
import { Segmented, SettingRow, SettingsSection } from "./SettingsSection";
import { Button } from "../ui/button";

export const UpstreamSection = () => {
  const { settings } = useApp();
  const save = useSaveSettings();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const s = settings!;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog?.open) dialog.close();
  }, [confirmOpen]);

  const changeUpstream = (value: "mock" | "real") => {
    if (value === "real") {
      setAcknowledged(false);
      setConfirmOpen(true);
      return;
    }
    save.mutate({ ...s, openai_upstream: value });
  };

  return (
    <SettingsSection
      testId="settings-upstream"
      title="Proxy upstreams"
      description="Your API keys travel in the Authorization header, are forwarded to the provider, and are never stored or logged. We keep metadata and payload hashes only."
    >
      <SettingRow
        label="OpenAI requests go to"
        help={
          s.openai_upstream === "mock"
            ? "The built-in mock LLM server. No real calls, no cost — good for trying things out."
            : "api.openai.com using the key your app sends. Real calls, real cost. Streaming responses are buffered in v1."
        }
        control={
          <Segmented<"mock" | "real">
            testIdPrefix="openai-upstream"
            value={s.openai_upstream}
            options={[{ value: "mock", label: "Local mock" }, { value: "real", label: "Real OpenAI" }]}
            onChange={changeUpstream}
          />
        }
      />
      <dialog
        ref={dialogRef}
        aria-labelledby="real-upstream-title"
        onCancel={(event) => { event.preventDefault(); setConfirmOpen(false); }}
        onClose={() => setConfirmOpen(false)}
        className="w-[min(92vw,34rem)] rounded-lg border border-border bg-card p-6 text-foreground backdrop:bg-black/40"
      >
        <h3 id="real-upstream-title" className="text-lg font-semibold">Use the real OpenAI API?</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Requests will be sent to OpenAI using the provider key your app supplies. These calls may incur real charges. The current API does not report whether real-upstream access is enabled in this deployment.</p>
        <label className="mt-5 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />
          <span>I understand that requests go to OpenAI and may cost money.</span>
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!acknowledged || save.isPending} onClick={() => {
            save.mutate({ ...s, openai_upstream: "real" }, { onSuccess: () => setConfirmOpen(false) });
          }}>
            Enable real upstream
          </Button>
        </div>
      </dialog>
      <SettingRow
        label="Stripe requests go to"
        help="Stripe test mode. Live keys (sk_live_…) are rejected by the proxy in v1."
        control={<span className="font-mono text-xs text-muted-foreground">test mode</span>}
      />
      <SettingRow
        label="AWS"
        help="Stubbed. The pricing slot exists but requests aren't forwarded yet."
        control={<span className="font-mono text-xs text-muted-foreground">stub</span>}
      />
    </SettingsSection>
  );
};
