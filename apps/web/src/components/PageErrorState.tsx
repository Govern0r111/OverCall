import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";

export const PageErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex items-start justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);
