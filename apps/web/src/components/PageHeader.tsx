import { ReactNode } from "react";
import { cn } from "../lib/utils";
import { Card as ShadcnCard } from "./ui/card";

interface Props {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export const PageHeader = ({ title, description, actions }: Props) => (
  <header className="mb-9 flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div className="min-w-0">
      <h1 data-testid="page-title" className="text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 max-w-[68ch] text-pretty text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>}
    </div>
    {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
  </header>
);

export const Card = ({ children, className = "", testId }: { children: ReactNode; className?: string; testId?: string }) => (
  <ShadcnCard data-testid={testId} className={cn("border-border bg-card shadow-none", className)}>{children}</ShadcnCard>
);
