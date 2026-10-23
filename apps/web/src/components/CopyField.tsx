import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { copyToClipboard } from "../lib/clipboard";

export const CopyField = ({ value, testId, className }: { value: string; testId: string; className?: string }) => {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy to the clipboard. Select and copy the value instead.");
    }
  };
  return (
    <div className={cn("flex min-w-0 items-center rounded-md border border-border bg-background", className)}>
      <code data-testid={`${testId}-value`} className="min-w-0 flex-1 truncate px-3 py-2 font-mono text-xs">{value}</code>
      <button
        type="button"
        onClick={onCopy}
        data-testid={testId}
        aria-live="polite"
        className="flex shrink-0 items-center gap-1.5 border-l border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-accent"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};
