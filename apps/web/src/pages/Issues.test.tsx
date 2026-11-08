import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import overviewDemo from "../../../../contract/fixtures/api/overview.demo.json";
import type { Issue } from "../lib/api";
import { fromApiOverview } from "../lib/api";
import Issues from "./Issues";

const state = vi.hoisted(() => ({
  issues: [] as unknown[],
  issuesUnavailable: false,
  overview: null as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  overviewError: false,
  overviewRefetch: vi.fn(),
  experimentalEnabled: false,
}));

const tier3Issue = {
  id: "99999999-9999-4999-8999-999999999999",
  rule_id: "experimental_rule",
  rule_name: "Experimental rule",
  tier: 3,
  experimental: true,
  provider: "openai",
  endpoint: "/v1/chat/completions",
  severity: "warning",
  impact_kind: "spend",
  title: "Experimental check",
  summary: "An experimental pattern was detected.",
  explanation: "This pattern is under evaluation.",
  suggested_fix: "Review the request pattern.",
  affected_count: 2,
  estimated_savings_usd: 1,
  projected_monthly_usd: 4,
  confidence: 0.7,
  is_demo_data: true,
  sample_requests: [],
  detected_at: "2026-11-07T08:30:00Z",
} satisfies Issue;

vi.mock("../hooks/queries", () => ({
  useIssues: () => ({
    data: state.issuesUnavailable ? undefined : state.issues,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
  useOverview: () => ({
    data: state.overview,
    isLoading: false,
    isError: state.overviewError,
    refetch: state.overviewRefetch,
  }),
}));

vi.mock("../context/AppContext", () => ({
  useApp: () => ({ settings: { experimental_enabled: state.experimentalEnabled } }),
  useMoney: () => (value: number) => `$${value.toFixed(2)}`,
}));

const renderIssues = () => render(
  <MemoryRouter initialEntries={["/app/issues"]}>
    <Issues />
  </MemoryRouter>,
);

describe("issues page", () => {
  beforeEach(() => {
    state.issues = [tier3Issue];
    state.issuesUnavailable = false;
    state.overview = fromApiOverview(overviewDemo);
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockClear();
    state.overviewError = false;
    state.overviewRefetch.mockClear();
    state.experimentalEnabled = false;
  });

  it("shows a loading message while issues are loading", () => {
    state.isLoading = true;
    state.issuesUnavailable = true;
    renderIssues();

    expect(screen.getByText("Loading issues…")).toBeInTheDocument();
  });

  it("shows a retry state when the overview request fails", () => {
    state.overview = null;
    state.overviewError = true;
    renderIssues();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Issues");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.overviewRefetch).toHaveBeenCalledOnce();
  });

  it("keeps loaded issues visible when the issues request fails", () => {
    state.experimentalEnabled = true;
    state.isError = true;
    renderIssues();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Experimental check")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("shows a retry state for an initial issues request failure", () => {
    state.issuesUnavailable = true;
    state.isError = true;
    renderIssues();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Issues");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("hides Tier 3 issues while experimental checks are disabled", () => {
    renderIssues();

    expect(screen.queryByText("Experimental check")).not.toBeInTheDocument();
    expect(screen.getByTestId("experimental-off-hint")).toBeInTheDocument();
  });

  it("shows enabled Tier 3 issues with an experimental badge and confidence", () => {
    state.experimentalEnabled = true;
    renderIssues();

    expect(screen.getByText("Experimental check")).toBeInTheDocument();
    expect(screen.getByTestId("issue-tier-0")).toHaveTextContent("Experimental");
    expect(screen.getByTestId("issue-tier-0")).toHaveTextContent("Confidence 70%");
  });

  it("labels missing Tier 3 confidence as unknown", () => {
    state.experimentalEnabled = true;
    state.issues = [{ ...tier3Issue, confidence: null }];
    renderIssues();

    expect(screen.getByTestId("issue-tier-0")).toHaveTextContent("Confidence unknown");
  });

  it("exposes provider, severity, and detection tier as named filters", () => {
    renderIssues();

    expect(screen.getByRole("group", { name: "Issue filters" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Severity" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Detection tier" })).toBeInTheDocument();
  });

  it("keeps a clear-filters action available when filters still have results", () => {
    state.experimentalEnabled = true;
    render(
      <MemoryRouter initialEntries={["/app/issues?provider=openai"]}>
        <Issues />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });
});
