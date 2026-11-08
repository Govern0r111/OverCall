import { Database, Loader2, Menu, Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { useApp } from "../context/AppContext";
import { useLoadSynthetic, useProviders, useSaveSettings } from "../hooks/queries";
import { Currency } from "../lib/api";
import { cn } from "../lib/utils";
import { SheetTrigger } from "./ui/sheet";
import { useAppAuth } from "../auth/AuthContext";

const CurrencyToggle = () => {
  const { settings } = useApp();
  const save = useSaveSettings();
  if (!settings) return null;
  const active = settings.currency;
  const swap = (currency: Currency) => save.mutate({ ...settings, currency });

  return (
    <div
      role="group"
      aria-label="Currency"
      className="flex items-center rounded-md border border-border bg-card p-0.5"
      data-testid="topbar-currency-switch"
    >
      {(["INR", "USD"] as Currency[]).map((currency) => (
        <Button
          key={currency}
          type="button"
          size="sm"
          variant={active === currency ? "secondary" : "ghost"}
          aria-pressed={active === currency}
          data-testid={`topbar-currency-${currency.toLowerCase()}`}
          onClick={() => swap(currency)}
          className="h-8 min-w-9 px-2 font-mono text-xs"
        >
          {currency}
        </Button>
      ))}
    </div>
  );
};

const ThemeToggle = () => {
  const { theme, setTheme } = useApp();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      data-testid="theme-toggle-button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      aria-pressed={theme === "dark"}
      className="h-10 w-10 border border-border bg-card text-muted-foreground hover:text-foreground"
    >
      {theme === "dark"
        ? <Sun aria-hidden="true" className="h-4 w-4" />
        : <Moon aria-hidden="true" className="h-4 w-4" />}
    </Button>
  );
};

const ProxyStatus = () => {
  const { data } = useProviders();
  const receiving = data?.some((provider) => provider.status === "receiving_traffic") ?? false;
  const demoOnly = Boolean(data?.length) && data?.every((provider) => provider.status === "demo_only" || provider.status === "coming_soon");
  const label = !data ? "Status unavailable" : receiving ? "Receiving traffic" : demoOnly ? "Demo data only" : "Waiting for traffic";
  const compactLabel = !data ? "Unavailable" : receiving ? "Live" : demoOnly ? "Demo" : "Waiting";

  return (
    <div
      role="status"
      aria-label={`Proxy status: ${label}`}
      data-testid="topbar-proxy-status"
      className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs sm:px-3"
    >
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 shrink-0 rounded-full", receiving ? "bg-positive" : "bg-muted-foreground")}
      />
      <span className="text-muted-foreground sm:hidden">{compactLabel}</span>
      <span className="hidden text-muted-foreground sm:inline">{label}</span>
    </div>
  );
};

export const Topbar = () => {
  const { isDemo } = useAppAuth();
  const load = useLoadSynthetic();
  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-height)] items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Open navigation menu"
            className="h-10 w-10 shrink-0 md:hidden"
          >
            <Menu aria-hidden="true" className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <ProxyStatus />
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        {isDemo && (
          <Button
            size="sm"
            variant="outline"
            data-testid="topbar-load-synthetic-button"
            onClick={() => load.mutate(42)}
            disabled={load.isPending}
            aria-label={load.isPending ? "Loading demo data" : "Load demo data"}
            className="h-10 w-10 px-0 sm:h-8 sm:w-auto sm:px-3"
          >
            {load.isPending
              ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin motion-reduce:hidden" />
              : <Database aria-hidden="true" className="h-3.5 w-3.5" />}
            <span className="sr-only sm:not-sr-only">{load.isPending ? "Loading…" : "Load demo data"}</span>
          </Button>
        )}
        <CurrencyToggle />
        <ThemeToggle />
      </div>
    </header>
  );
};
