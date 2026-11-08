import { ReactNode } from "react";
import { cn } from "../../lib/utils";

export const SettingsSection = ({ title, description, children, testId }: { title: string; description?: ReactNode; children: ReactNode; testId: string }) => {
  const headingId = `settings-section-title-${testId}`;
  return (
  <section
    data-testid={testId}
    aria-labelledby={headingId}
    className="grid gap-4 border-t border-divider py-6 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,1.7fr)] lg:gap-10"
  >
    <div>
      <h2 id={headingId} className="text-base font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-2 max-w-[34ch] text-sm leading-6 text-muted-foreground">{description}</p>}
    </div>
    <div className="min-w-0">{children}</div>
  </section>
  );
};

export const SettingRow = ({ label, help, control, className }: { label: ReactNode; help?: ReactNode; control: ReactNode; className?: string }) => (
  <div className={cn("grid min-w-0 grid-cols-1 gap-3 border-b border-divider py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start", className)}>
    <div className="min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {help && <p className="mt-1 max-w-[56ch] text-sm leading-6 text-muted-foreground">{help}</p>}
    </div>
    <div className="min-w-0 sm:justify-self-end">{control}</div>
  </div>
);

export const Segmented = <T extends string>({ value, options, onChange, testIdPrefix }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testIdPrefix: string;
}) => (
  <div role="radiogroup" data-testid={testIdPrefix} className="inline-flex rounded-md border border-border p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        data-testid={`${testIdPrefix}-${o.value.toLowerCase()}`}
        onClick={() => onChange(o.value)}
        className={cn(
          "rounded px-3 py-1 text-xs font-medium transition-colors",
          value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);
