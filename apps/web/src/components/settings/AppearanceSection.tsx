import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { useApp } from "../../context/AppContext";
import { useSaveSettings } from "../../hooks/queries";
import { Currency } from "../../lib/api";
import { Segmented, SettingRow, SettingsSection } from "./SettingsSection";

export const AppearanceSection = () => {
  const { themePreference, setThemePreference, settings } = useApp();
  const save = useSaveSettings();
  const [rate, setRate] = useState(String(settings!.usd_inr_rate));
  const [rateError, setRateError] = useState("");
  useEffect(() => {
    setRate(String(settings!.usd_inr_rate));
    setRateError("");
  }, [settings]);

  const commitRate = () => {
    const v = Number(rate);
    if (!Number.isFinite(v) || v <= 0) {
      setRateError("Enter an exchange rate greater than zero.");
      return;
    }
    setRateError("");
    if (v !== settings!.usd_inr_rate) save.mutate({ ...settings!, usd_inr_rate: v });
  };

  return (
    <SettingsSection testId="settings-appearance" title="Appearance" description="How the dashboard looks and which currency costs are shown in.">
      <SettingRow
        label="Theme"
        help="Choose a fixed theme or follow your device setting."
        control={
          <Segmented
            testIdPrefix="settings-theme"
            value={themePreference}
            options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]}
            onChange={setThemePreference}
          />
        }
      />
      <SettingRow
        label="Currency"
        help="Pricing tables are in USD; savings are converted for display."
        control={
          <Segmented<Currency>
            testIdPrefix="currency-switch"
            value={settings!.currency}
            options={[{ value: "INR", label: "₹ INR" }, { value: "USD", label: "$ USD" }]}
            onChange={(c) => save.mutate({ ...settings!, currency: c })}
          />
        }
      />
      <SettingRow
        label="Exchange rate"
        help="Rupees per US dollar. Update it when rates move."
        control={
          <div className="flex items-center gap-2">
            <label htmlFor="usd-inr-rate-input" className="font-mono text-xs text-muted-foreground">$1 = ₹</label>
            <Input
              data-testid="usd-inr-rate-input"
              id="usd-inr-rate-input"
              type="number"
              step="0.1"
              min="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={commitRate}
              onKeyDown={(e) => e.key === "Enter" && commitRate()}
              aria-invalid={Boolean(rateError)}
              aria-describedby={rateError ? "usd-inr-rate-error" : undefined}
              className="h-8 w-24 font-mono text-xs"
            />
          </div>
        }
      />
      {rateError && <p id="usd-inr-rate-error" role="alert" className="text-xs text-destructive">{rateError}</p>}
    </SettingsSection>
  );
};
