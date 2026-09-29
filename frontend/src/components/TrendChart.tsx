import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendPoint } from "../lib/api";
import { formatDay } from "../lib/format";
import { useApp } from "../context/AppContext";
import { Card } from "./PageHeader";

const PALETTE = {
  light: { accent: "#35507A", savings: "#2F7D5A", grid: "#ECECEA", muted: "#6B6F76" },
  dark: { accent: "#7C9CC4", savings: "#5FB98A", grid: "#252830", muted: "#9A9DA6" },
};

const ChartTooltip = ({ active, payload, label }: any) => {
  const { money } = useApp();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 text-muted-foreground">{formatDay(label)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-6">
          <span>{p.dataKey === "cost_usd" ? "Total spend" : "Avoidable"}</span>
          <span className="font-mono">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
};

const Legend = ({ c }: { c: typeof PALETTE.light }) => (
  <div className="flex items-center gap-5 text-xs text-muted-foreground">
    <span className="flex items-center gap-2"><span className="h-0.5 w-4" style={{ background: c.accent }} />Total spend</span>
    <span className="flex items-center gap-2"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: c.savings }} />Avoidable</span>
  </div>
);

export const TrendChart = ({ data, className = "" }: { data: TrendPoint[]; className?: string }) => {
  const { theme, money } = useApp();
  const c = PALETTE[theme];
  const tick = { fill: c.muted, fontSize: 12, fontFamily: "JetBrains Mono, monospace" };
  return (
    <Card testId="trend-chart-card" className={`flex flex-col p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Daily spend and avoidable spend</h2>
        <Legend c={c} />
      </div>
      <div data-testid="trend-chart" className="mt-6 h-[260px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDay} tick={tick} axisLine={false} tickLine={false} dy={8} />
            <YAxis tickFormatter={(v) => money(v, true)} tick={tick} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.grid }} />
            <Line type="monotone" dataKey="cost_usd" stroke={c.accent} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="waste_usd" stroke={c.savings} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
