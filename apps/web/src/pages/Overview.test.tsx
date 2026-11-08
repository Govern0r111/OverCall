import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppAuthProvider } from "../auth/AuthContext";
import overviewDemo from "../../../../contract/fixtures/api/overview.demo.json";
import overviewEmpty from "../../../../contract/fixtures/api/overview.empty.json";
import overviewLive from "../../../../contract/fixtures/api/overview.live.json";
import { fromApiOverview } from "../lib/api";
import type { ApiIssue, ApiOverview } from "../lib/api";
import Overview from "./Overview";

const state = vi.hoisted(() => ({
  overview: null as unknown,
  me: null as unknown,
  meLoading: false,
  meError: false,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  meRefetch: vi.fn(),
  mutate: vi.fn(),
}));

const demoIssue = {
  id: "88888888-8888-4888-8888-888888888888",
  rule_id: "duplicate_calls",
  rule_name: "Duplicate calls",
  tier: 1,
  experimental: false,
  provider: "openai",
  endpoint: "/v1/chat/completions",
  severity: "warning",
  impact_kind: "spend",
  title: "Repeated chat request",
  summary: "The same request was sent more than once.",
  explanation: "Matching request metadata was seen.",
  suggested_fix: "Cache the result.",
  affected_count: 2,
  window_savings_usd: "1.00",
  projected_monthly_usd: "4.00",
  confidence: null,
  is_demo_data: true,
  detected_at: "2026-11-07T08:30:00Z",
  sample_requests: [],
} satisfies ApiIssue;

vi.mock("../hooks/queries", () => ({
  useMe: () => ({
    data: state.me,
    isLoading: state.meLoading,
    isError: state.meError,
    refetch: state.meRefetch,
  }),
  useOverview: () => ({
    data: state.overview,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
  useRerun: () => ({ mutate: state.mutate, isPending: false }),
  useLoadSynthetic: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../context/AppContext", () => ({
  useApp: () => ({ settings: { experimental_enabled: true } }),
  useMoney: () => (value: number) => `$${value.toFixed(2)}`,
}));

vi.mock("../hooks/useCountUp", () => ({
  useCountUp: (target: number) => target,
}));

vi.mock("../components/TrendChart", () => ({
  TrendChart: ({ data }: { data: unknown[] }) => (
    <section data-testid="trend-chart-card">
      {data.length === 0 && <p>Waiting for first traffic</p>}
    </section>
  ),
}));

const renderOverviewState = (isDemo = false) => {
  return render(
    <AppAuthProvider
      user={{
        id: isDemo ? "demo-user" : "real-user",
        email: isDemo ? "demo@overcall.local" : "person@example.com",
        isDemo,
      }}
    >
      <MemoryRouter>
        <Overview />
      </MemoryRouter>
    </AppAuthProvider>,
  );
};

const renderOverview = (fixture: ApiOverview) => {
  state.overview = fromApiOverview(fixture);
  return renderOverviewState(fixture.is_demo_data);
};

describe("overview dashboard", () => {
  beforeEach(() => {
    state.overview = null;
    state.me = null;
    state.meLoading = false;
    state.meError = false;
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockClear();
    state.meRefetch.mockClear();
    state.mutate.mockClear();
  });

  it("keeps the dashboard frame visible while first measurements are loading", () => {
    state.isLoading = true;
    renderOverviewState();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Overview");
    expect(screen.getByRole("status")).toHaveTextContent("Loading your live overview");
    expect(screen.getByTestId("hero-savings-card")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart-card")).toBeInTheDocument();
    expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument();
  });

  it.each([
    ["demo", overviewDemo, "$13.90", "5", "$0.92/mo", "14.82", true],
    ["live", overviewLive, "$32.14", "3", "$0.42/mo", "32.56", false],
  ] as const)(
    "renders the %s spend and reliability figures separately",
    (_label, fixture, spendSavings, reliabilityCount, overhead, sum, isDemo) => {
      const { container } = renderOverview(fixture);

      expect(screen.getByTestId("hero-projected-savings")).toHaveTextContent(spendSavings);
      expect(screen.getByTestId("hero-supporting-line")).toHaveTextContent(
        "Based on the last 7 days of traffic. This is an estimate, not a bill.",
      );
      expect(screen.getByTestId("reliability-count")).toHaveTextContent(reliabilityCount);
      expect(screen.getByTestId("reliability-overhead")).toHaveTextContent(overhead);
      expect(container.textContent).not.toContain(sum);
      expect(screen.getByRole("button", { name: "About reliability findings" })).toBeInTheDocument();

      if (isDemo) {
        expect(screen.getByTestId("demo-data-banner")).toBeInTheDocument();
        expect(screen.getByTestId("hero-trust-note")).toHaveTextContent(
          "Up to $2.10 more from experimental checks (not included).",
        );
      } else {
        expect(screen.queryByTestId("demo-data-banner")).not.toBeInTheDocument();
      }

      if (fixture.window.low_confidence_projection) {
        expect(screen.getByTestId("low-confidence-projection-note")).toHaveTextContent(
          "Based on less than a day of traffic, so this projection may swing a lot.",
        );
      } else {
        expect(screen.queryByTestId("low-confidence-projection-note")).not.toBeInTheDocument();
      }
    },
  );

  it("shows provider setup without demo controls when live data is empty", () => {
    renderOverview(overviewEmpty);

    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up a provider" })).toHaveAttribute("href", "/app/providers");
    expect(screen.queryByRole("button", { name: "Load demo data" })).not.toBeInTheDocument();
    expect(screen.getByTestId("hero-projected-savings")).toBeInTheDocument();
    expect(screen.getByTestId("reliability-figure-card")).toBeInTheDocument();
  });

  it("offers detection when live requests exist before the first run", () => {
    state.me = { has_data: true };
    renderOverview(overviewEmpty);

    expect(screen.getByRole("heading", { name: "Traffic is ready to analyze" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Analyze traffic" }));
    expect(state.mutate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: "Set up a provider" })).not.toBeInTheDocument();
  });

  it("waits for live traffic status before showing the empty state", () => {
    state.meLoading = true;
    renderOverview(overviewEmpty);

    expect(screen.getByRole("status")).toHaveTextContent("Checking for recent traffic");
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
  });

  it("surfaces an account-status failure instead of assuming there is no traffic", () => {
    state.meError = true;
    renderOverview(overviewEmpty);

    expect(screen.getByRole("alert")).toHaveTextContent("Your traffic status could not be loaded.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.meRefetch).toHaveBeenCalledOnce();
  });

  it("renders a complete dashboard frame without live traffic", () => {
    renderOverview(overviewEmpty);

    expect(screen.getByTestId("page-title")).toHaveTextContent("Overview");
    expect(screen.getByTestId("hero-savings-card")).toBeInTheDocument();
    expect(screen.getByTestId("reliability-figure-card")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart-card")).toBeInTheDocument();
    expect(screen.getByTestId("top-issues-card")).toBeInTheDocument();
    expect(screen.getByTestId("overview-traffic-summary")).toHaveTextContent("Waiting for first traffic");
    for (const testId of [
      "hero-projected-savings",
      "hero-monthly-spend",
      "hero-waste-pct",
      "hero-flagged-requests",
      "hero-issue-count",
      "reliability-count",
      "reliability-overhead",
    ]) {
      expect(screen.getByTestId(testId)).toHaveTextContent("—");
    }
    expect(screen.getByRole("link", { name: "Set up a provider" })).toHaveAttribute("href", "/app/providers");
    expect(screen.queryByTestId("demo-data-banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load demo data" })).not.toBeInTheDocument();
  });

  it("shows a retry state for an initial overview error", () => {
    state.isError = true;
    renderOverviewState();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Overview");
    expect(screen.getByRole("alert")).toHaveTextContent("The overview could not be loaded.");
    expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("links top issues to their expanded detail in the Issues page", () => {
    renderOverview({ ...overviewDemo, top_issues: [demoIssue] });

    expect(screen.getByRole("link", { name: "View in Issues: Repeated chat request" }))
      .toHaveAttribute("href", `/app/issues?open=${demoIssue.id}`);
  });

  it("groups impact metrics and traffic trends into named dashboard sections", () => {
    renderOverview(overviewDemo);

    expect(screen.getByRole("region", { name: "Impact summary" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Traffic trends" })).toBeInTheDocument();
  });

  it("shows a clear zero-savings message without implying a positive projection", () => {
    renderOverview({
      ...overviewLive,
      spend_savings: { window_usd: "0", projected_monthly_usd: "0", percent_of_spend: 0 },
      reliability_findings: { count: 0, modelled_overhead_monthly_usd: "0" },
      severity_breakdown: { critical: 0, warning: 0, info: 0 },
    });

    expect(screen.getByTestId("hero-projected-savings")).toHaveTextContent("$0.00");
    expect(screen.getByTestId("no-waste-message")).toHaveTextContent("No waste found. Nice.");
    expect(screen.queryByText(/avoidable$/)).not.toBeInTheDocument();
  });

  it("explains a projection based on less than one day of traffic", () => {
    renderOverview({
      ...overviewDemo,
      window: { ...overviewDemo.window, days: 0.5, low_confidence_projection: true },
    });

    expect(screen.getByTestId("overview-traffic-summary"))
      .toHaveTextContent("0.5 days of traffic");
    expect(screen.getByTestId("page-title").parentElement)
      .toHaveTextContent("See estimated savings, reliability findings, and the most important issues.");
    expect(screen.getByTestId("low-confidence-projection-note")).toBeInTheDocument();
  });
});
