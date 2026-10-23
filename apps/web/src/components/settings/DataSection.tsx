import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useClearData, useLoadSynthetic } from "../../hooks/queries";
import { SettingRow, SettingsSection } from "./SettingsSection";

export const DataSection = () => {
  const [seed, setSeed] = useState("42");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const load = useLoadSynthetic();
  const clear = useClearData();
  const validSeed = Number.isSafeInteger(Number(seed)) && seed.trim() !== "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (confirmOpen && dialog && !dialog.open) dialog.showModal();
    if (!confirmOpen && dialog?.open) dialog.close();
  }, [confirmOpen]);

  return (
    <SettingsSection testId="settings-data" title="Data" description="Request logs expire after 30 days automatically.">
      <SettingRow
        label="Synthetic demo data"
        help="Replaces existing synthetic logs with 7 days of realistic traffic. The same seed always produces the same data."
        control={
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">seed</span>
            <Input data-testid="synthetic-seed-input" type="number" step="1" aria-label="Synthetic data seed" value={seed} onChange={(e) => setSeed(e.target.value)} className="h-8 w-20 font-mono text-xs" />
            <Button size="sm" variant="outline" data-testid="settings-load-synthetic-button" disabled={load.isPending || !validSeed} onClick={() => load.mutate(Number(seed))}>
              {load.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Load
            </Button>
          </div>
        }
      />
      <SettingRow
        label="Clear all data"
        help="Deletes every logged request (synthetic and proxied) and all detected issues."
        control={
          <>
            <Button size="sm" variant="outline" data-testid="clear-data-button" disabled={clear.isPending} onClick={() => { setConfirmation(""); setConfirmOpen(true); }}>
              Clear data
            </Button>
            <dialog
              ref={dialogRef}
              aria-labelledby="clear-data-title"
              onCancel={(event) => { event.preventDefault(); setConfirmOpen(false); }}
              onClose={() => setConfirmOpen(false)}
              className="w-[min(92vw,32rem)] rounded-lg border border-border bg-card p-6 text-foreground backdrop:bg-black/40"
            >
              <h3 id="clear-data-title" className="text-lg font-semibold">Clear all request data?</h3>
              <p className="mt-2 text-sm text-muted-foreground">This permanently deletes synthetic and proxied request logs and all detected issues. This action cannot be undone.</p>
              <label htmlFor="clear-data-confirmation" className="mt-5 block text-sm">
                Type <code className="font-mono">delete my data</code> to confirm
                <Input id="clear-data-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2" />
              </label>
              {clear.isError && <p role="alert" className="mt-3 text-sm text-destructive">Couldn't clear the data. Please try again.</p>}
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={confirmation !== "delete my data" || clear.isPending}
                  onClick={() => clear.mutate(undefined, { onSuccess: () => setConfirmOpen(false) })}
                >
                  {clear.isPending ? "Clearing…" : "Delete data"}
                </Button>
              </div>
            </dialog>
          </>
        }
      />
    </SettingsSection>
  );
};
