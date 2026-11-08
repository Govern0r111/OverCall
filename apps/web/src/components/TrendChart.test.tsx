import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrendChart } from "./TrendChart";

const state = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("../hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => state.reducedMotion,
}));

vi.mock("../context/AppContext", () => ({
  useMoney: () => (value: number) => `$${value.toFixed(2)}`,
}));

vi.mock("recharts", async () => {
  const React = await import("react");
  type TooltipContentProps = {
    active?: boolean;
    payload?: Array<{ dataKey: string; color: string; value: number }>;
    label?: string;
  };
  type AnimationProps = { isAnimationActive?: boolean };
  return {
    Area: ({ isAnimationActive }: AnimationProps) => React.createElement("span", {
      "data-testid": "trend-area-animation",
      "data-active": String(isAnimationActive),
    }),
    AreaChart: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    CartesianGrid: () => null,
    Line: ({ isAnimationActive }: AnimationProps) => React.createElement("span", {
      "data-testid": "trend-line-animation",
      "data-active": String(isAnimationActive),
    }),
    ResponsiveContainer: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
    Tooltip: ({ content }: { content: ReactNode }) => {
      if (!React.isValidElement<TooltipContentProps>(content)) return null;
      return React.cloneElement(content, {
        active: true,
        payload: [{ dataKey: "cost_usd", color: "var(--accent)", value: Number.NaN }],
        label: "2026-11-07",
      });
    },
    XAxis: () => null,
    YAxis: () => null,
  };
});

describe("trend chart", () => {
  beforeEach(() => {
    state.reducedMotion = false;
  });

  it("provides an accessible name and a screen-reader data table", () => {
    render(
      <TrendChart
        data={[
          { date: "2026-11-07", cost_usd: 10, waste_usd: 0 },
        ]}
      />,
    );

    expect(screen.getByRole("group", { name: "Daily spend and avoidable spend" })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Daily spend and avoidable spend by day" });
    expect(table).toHaveTextContent("2026-11-07");
    expect(table).toHaveTextContent("$10.00");
    expect(table).toHaveTextContent("$0.00");
    expect(screen.getByText("Nov 7")).toBeInTheDocument();
    expect(screen.getByText("Nov 7").parentElement?.textContent).toContain("$0.00");
    expect(screen.queryByText("$NaN")).not.toBeInTheDocument();
  });

  it("explains that the chart is waiting for data when there is no traffic", () => {
    render(<TrendChart data={[]} />);

    expect(screen.getByTestId("trend-chart-card")).toBeInTheDocument();
    expect(screen.getByText("Waiting for first traffic")).toBeInTheDocument();
  });

  it("disables chart motion when reduced motion is preferred", () => {
    state.reducedMotion = true;
    render(<TrendChart data={[{ date: "2026-11-07", cost_usd: 10, waste_usd: 0 }]} />);

    expect(screen.getByTestId("trend-area-animation")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("trend-line-animation")).toHaveAttribute("data-active", "false");
  });
});
