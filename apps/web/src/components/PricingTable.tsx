import type { Provider } from "../lib/api";

const Row = ({ cells }: { cells: React.ReactNode[] }) => (
  <tr className="border-b border-divider last:border-b-0">
    {cells.map((c, i) => <td key={i} className="px-3 py-2">{c}</td>)}
  </tr>
);

const Table = ({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) => (
  <div className="overflow-x-auto rounded-md border border-border">
    <table className="w-full min-w-[480px] font-mono text-xs">
      <thead>
        <tr className="border-b border-divider text-left text-muted-foreground">
          {head.map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}
        </tr>
      </thead>
      <tbody>{rows.map((r, i) => <Row key={i} cells={r} />)}</tbody>
    </table>
  </div>
);

export const PricingTable = ({ provider }: { provider: Provider }) => (
  <details data-testid={`provider-${provider.id}-pricing`} className="border-t border-divider pt-4">
    <summary className="cursor-pointer text-sm font-medium">Pricing details</summary>
    <div className="mt-4">
      {provider.pricing ? (
        <>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Pricing · version{" "}
              <span data-testid={`provider-${provider.id}-pricing-version`} className="font-mono text-foreground">{provider.pricing.version}</span>
            </p>
            <a href={provider.pricing.source_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              Pricing source
            </a>
          </div>
          <Table
            head={["Item", "USD / 1M"]}
            rows={provider.pricing.rows.map((row) => [row.label, `$${row.usd_per_1m}`])}
          />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No pricing table is available for this provider.</p>
      )}
      {provider.notes && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{provider.notes}</p>}
    </div>
  </details>
);
