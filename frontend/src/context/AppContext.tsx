import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useSettings } from "../hooks/queries";
import type { Currency, Settings } from "../lib/api";
import { formatMoney } from "../lib/format";

type Theme = "light" | "dark";

interface AppCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  settings?: Settings;
  currency: Currency;
  money: (usd: number, short?: boolean) => string;
}

const Ctx = createContext<AppCtx | null>(null);

const initialTheme = (): Theme => {
  const saved = localStorage.getItem("cg-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const { data: settings } = useSettings();
  const currency: Currency = settings?.currency ?? "INR";
  const rate = settings?.usd_inr_rate ?? 83.5;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("cg-theme", theme);
  }, [theme]);

  const money = useCallback((usd: number, short = false) => formatMoney(usd, currency, rate, short), [currency, rate]);

  return <Ctx.Provider value={{ theme, setTheme: setThemeState, settings, currency, money }}>{children}</Ctx.Provider>;
};

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
};
