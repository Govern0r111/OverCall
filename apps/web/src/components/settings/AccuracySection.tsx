import { useEvaluation, useProviders } from "../../hooks/queries";
import { SettingsSection } from "./SettingsSection";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const AccuracySection = () => {
  const { data } = useEvaluation();
  const { data: providers } = useProviders();
  return (
    <SettingsSection
      testId="settings-accuracy"
      title="Pricing and accuracy"
      description="Pricing tables are versioned config files. Accuracy results stay separate by dataset; synthetic ground truth is circular and is not a measure of real-world performance."
    >
      <ul className="mb-6 space-y-1.5 text-xs">
        {providers?.map((p) => (
          <li key={p.id} data-testid={`pricing-version-${p.id}`} className="flex justify-between gap-4 font-mono">
            <span>pricing/{p.id}.json</span>
            <span className="text-muted-foreground">v{p.pricing.version}</span>
          </li>
        ))}
      </ul>
      <section aria-labelledby="synthetic-accuracy-title" className="mb-5 rounded-md border border-border p-4">
        <h3 id="synthetic-accuracy-title" className="text-sm font-medium">Synthetic data <span className="text-xs text-muted-foreground">(circular ground truth)</span></h3>
        {data?.has_data ? (
          <p className="mt-1 text-xs text-muted-foreground">{data.requests?.toLocaleString() ?? "Unknown"} synthetic requests evaluated.</p>
        ) : <p className="mt-1 text-xs text-muted-foreground">Load synthetic data to evaluate rules against its generated ground truth.</p>}
      </section>
      <section aria-labelledby="real-accuracy-title" className="mb-5 rounded-md border border-border p-4">
        <h3 id="real-accuracy-title" className="text-sm font-medium">Real-traffic fixtures</h3>
        <p className="mt-1 text-xs text-muted-foreground">Not measured yet. This API does not provide a real-traffic fixture evaluation or a 95% confidence interval.</p>
      </section>
      {data?.has_data && !data.using_default_windows && (
        <p data-testid="accuracy-custom-windows-note" className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Measured with your custom thresholds. The ground truth assumes the defaults, so lower recall here means your
          thresholds are stricter than the patterns in the demo data.
        </p>
      )}
      {data?.has_data ? (
        <div className="overflow-x-auto rounded-md border border-border">
          <table data-testid="accuracy-table" className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-divider text-left text-muted-foreground">
                {["Rule", "Known waste", "Flagged", "Precision", "Recall"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}
              </tr>
            </thead>
            <tbody className="font-mono">
              {data.rules.map((r) => (
                <tr key={r.rule_id} data-testid={`accuracy-row-${r.rule_id}`} className="border-b border-divider last:border-b-0">
                  <td className="px-3 py-2 font-sans">{r.rule_name}</td>
                  <td className="px-3 py-2">{r.ground_truth}</td>
                  <td className="px-3 py-2">{r.flagged}</td>
                  <td className="px-3 py-2">{pct(r.precision)}</td>
                  <td className="px-3 py-2">{pct(r.recall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Load synthetic data to see how accurately each rule detects known waste.</p>
      )}
    </SettingsSection>
  );
};
