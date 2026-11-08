import { PageHeader } from "../components/PageHeader";
import { AppearanceSection } from "../components/settings/AppearanceSection";
import { RulesSection } from "../components/settings/RulesSection";
import { WindowsSection } from "../components/settings/WindowsSection";
import { UpstreamSection } from "../components/settings/UpstreamSection";
import { DataSection } from "../components/settings/DataSection";
import { AccuracySection } from "../components/settings/AccuracySection";
import { PageErrorState } from "../components/PageErrorState";
import { useAppAuth } from "../auth/AuthContext";
import { useSettings } from "../hooks/queries";

export default function Settings() {
  const { data: settings, isLoading, isError, refetch } = useSettings();
  const { isDemo } = useAppAuth();
  return (
    <div>
      <PageHeader title="Settings" description="Choose which checks run, tune their thresholds, and control how things look." />
      {isError && <PageErrorState message="Settings could not be loaded." onRetry={() => void refetch()} />}
      {isLoading && !settings && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading settings…</p>}
      {settings && (
        <div className="space-y-6">
          <AppearanceSection />
          <RulesSection />
          <WindowsSection />
          <UpstreamSection />
          <DataSection />
          {isDemo && <AccuracySection />}
        </div>
      )}
    </div>
  );
}
