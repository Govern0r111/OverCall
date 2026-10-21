import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
    <div className="rounded-md border border-border bg-popover px-3 py-2.5 text-xs shadow-md">
      <p className="mb-2 font-medium">{formatDay(label)}</p>
      <div className="space-y-1">
        {payload.map((p: any) => (
          <p key={p.dataKey} className="flex items-center justify-between gap-8">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-1.5 w-3 rounded-full" style={{ background: p.color }} />
              {p.dataKey === "cost_usd" ? "Total spend" : "Avoidable"}
            </span>
            <span className="font-mono font-medium">{money(p.value)}</span>
          </p>
        ))}
      </div>
    </div>
  );
};

const Legend = ({ c }: { c: typeof PALETTE.light }) => (
  <div className="flex items-center gap-5 text-xs text-muted-foreground">
    <span className="flex items-center gap-2">
      <span className="h-2 w-4 rounded-sm" style={{ background: c.accent, opacity: 0.18 }} />
      <span className="h-0.5 w-4 -ml-[18px]" style={{ background: c.accent }} />
      Total spend
    </span>
    <span className="flex items-center gap-2">
      <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: c.savings }} />
      Avoidable
    </span>
  </div>
);

export const TrendChart = ({ data, className = "" }: { data: TrendPoint[]; className?: string }) => {
  const { theme, money } = useApp();
  const c = PALETTE[theme];
  const tick = { fill: c.muted, fontSize: 12, fontFamily: "JetBrains Mono, monospace" };
  const accentId = `grad-cost-${theme}`;
  return (
    <Card testId="trend-chart-card" className={`flex flex-col p-6 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Daily spend and avoidable spend</h2>
        <Legend c={c} />
      </div>
      <div data-testid="trend-chart" className="mt-6 h-[260px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={accentId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.accent} stopOpacity={0.18} />
                <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDay} tick={tick} axisLine={false} tickLine={false} dy={8} />
            <YAxis tickFormatter={(v) => money(v, true)} tick={tick} axisLine={false} tickLine={false} width={72} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.grid, strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="cost_usd"
              stroke={c.accent}
              strokeWidth={2}
              fill={`url(#${accentId})`}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="waste_usd"
              stroke={c.savings}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
