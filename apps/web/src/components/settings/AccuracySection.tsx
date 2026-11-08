import { useEvaluation, useProviders, useRules } from "../../hooks/queries";
import { SettingsSection } from "./SettingsSection";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export const AccuracySection = () => {
  const { data } = useEvaluation();
  const { data: providers } = useProviders();
  const { data: rules } = useRules();
  const ruleNames = new Map((rules ?? []).map((rule) => [rule.id, rule.name]));

  return (
    <SettingsSection
      testId="settings-accuracy"
      title="Pricing and accuracy"
      description="Pricing tables are versioned config files. Accuracy results stay separate by dataset; synthetic ground truth is circular and is not a measure of real-world performance."
    >
      <ul className="mb-6 space-y-1.5 text-xs">
        {providers?.map((provider) => provider.pricing && (
          <li key={provider.id} data-testid={`pricing-version-${provider.id}`} className="flex justify-between gap-4 font-mono">
            <span>{provider.name}</span>
            <span className="text-muted-foreground">v{provider.pricing.version}</span>
          </li>
        ))}
      </ul>
      {data?.datasets.map((dataset) => (
        <section
          key={dataset.id}
          aria-labelledby={`${dataset.id}-accuracy-title`}
          data-testid={`accuracy-dataset-${dataset.id}`}
          className="mb-5 rounded-md border border-border p-4"
        >
          <h3 id={`${dataset.id}-accuracy-title`} className="text-sm font-medium">{dataset.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {dataset.requests.toLocaleString()} requests · {dataset.note}
          </p>
          {dataset.rules.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-md border border-border">
              <table data-testid={`accuracy-table-${dataset.id}`} className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="border-b border-divider text-left text-muted-foreground">
                    {["Rule", "Known waste", "Flagged", "Precision", "Recall", "Hard-negative false positives"].map((heading) => (
                      <th key={heading} className="px-3 py-2 font-normal">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {dataset.rules.map((rule) => (
                    <tr key={rule.rule_id} data-testid={`accuracy-row-${dataset.id}-${rule.rule_id}`} className="border-b border-divider last:border-b-0">
                      <td className="px-3 py-2 font-sans">{ruleNames.get(rule.rule_id) ?? rule.rule_id}</td>
                      <td className="px-3 py-2">{rule.positives}</td>
                      <td className="px-3 py-2">{rule.flagged}</td>
                      <td className="px-3 py-2">{pct(rule.precision)}</td>
                      <td className="px-3 py-2">{pct(rule.recall)}</td>
                      <td className="px-3 py-2">{rule.false_positives_on_hard_negatives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {!data && <p className="text-xs text-muted-foreground">Accuracy data is unavailable.</p>}
    </SettingsSection>
  );
};
