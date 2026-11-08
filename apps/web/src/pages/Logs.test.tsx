import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../lib/api";
import Logs from "./Logs";

const state = vi.hoisted(() => ({
  filters: null as unknown,
  logs: [] as unknown[],
  noPages: false,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  hasNextPage: false,
  fetchNextPage: vi.fn(),
}));

const sampleLog = {
  id: "33333333-3333-4333-8333-333333333333",
  timestamp: "2026-11-07T08:30:00Z",
  provider: "openai",
  endpoint: "/v1/chat/completions",
  method: "POST",
  status: 200,
  latency_ms: 240,
  ttfb_ms: null,
  req_size: 640,
  resp_size: 910,
  prompt_tokens: 240,
  completion_tokens: 80,
  tokens_estimated: true,
  stream: false,
  cost_usd: 0.01,
  cost_basis: "modelled",
  pricing_version: "2026-01-15",
  has_idempotency_key: false,
  error_code: null,
  origin: "demo",
  is_demo: true,
  flagged_by: ["duplicate_calls"],
  flagged_issues: [{
    issue_id: "11111111-1111-4111-8111-111111111111",
    rule_id: "duplicate_calls",
    title: "Repeated requests",
    severity: "warning",
  }],
  issue_ids: ["11111111-1111-4111-8111-111111111111"],
  caller: "checkout",
  model: "gpt-4o-mini",
  req_hash: "sha256:example",
} satisfies LogEntry;

vi.mock("../hooks/queries", () => ({
  useLogs: (filters: unknown) => {
    state.filters = filters;
    return {
      data: state.noPages ? undefined : { pages: [{ items: state.logs, next_cursor: null }] },
      isLoading: state.isLoading,
      isError: state.isError,
      refetch: state.refetch,
      hasNextPage: state.hasNextPage,
      fetchNextPage: state.fetchNextPage,
      isFetchingNextPage: false,
    };
  },
  useLogFacets: () => ({
    data: {
      providers: ["openai"],
      endpoints: [{ value: "/v1/chat/completions", count: 1 }],
      callers: ["checkout"],
      models: ["gpt-4o-mini"],
    },
    isError: false,
  }),
}));

vi.mock("../context/AppContext", () => ({
  useMoney: () => (value: number) => `$${value.toFixed(2)}`,
}));

describe("logs page", () => {
  beforeEach(() => {
    state.filters = null;
    state.logs = [];
    state.noPages = false;
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockClear();
    state.hasNextPage = false;
    state.fetchNextPage.mockClear();
  });

  it("keeps the Logs frame visible while the first log page is loading", () => {
    state.isLoading = true;
    state.noPages = true;
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("page-title")).toHaveTextContent("Logs");
    expect(screen.getByRole("status")).toHaveTextContent("Loading request logs");
    expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument();
  });

  it("keeps the Logs heading and offers retry after an initial request failure", () => {
    state.noPages = true;
    state.isError = true;
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("page-title")).toHaveTextContent("Logs");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("passes URL search and all selected filters to the query", async () => {
    const issueId = "11111111-1111-4111-8111-111111111111";
    const from = "2026-11-06T00:00:00.000Z";
    const to = "2026-11-07T00:00:00.000Z";
    render(
      <MemoryRouter initialEntries={[`/app/logs?q=gpt-4o&provider=openai&status=4xx&endpoint=%2Fv1%2Fchat%2Fcompletions&caller=checkout&model=gpt-4o-mini&issue=${issueId}&range=custom&from=${from}&to=${to}`]}>
        <Logs />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(state.filters).toEqual({
        search: "gpt-4o",
        provider: "openai",
        status_class: "4xx",
        endpoint: "/v1/chat/completions",
        caller: "checkout",
        model: "gpt-4o-mini",
        issue_id: issueId,
        from,
        to,
      });
    });
    expect(screen.getByRole("combobox", { name: "Filter logs by provider" })).toHaveValue("openai");
    expect(screen.getByRole("combobox", { name: "Filter logs by time range" })).toHaveValue("custom");
  });

  it("uses facets and marks modelled cost and estimated tokens", () => {
    state.logs = [sampleLog];
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    expect(screen.getByRole("group", { name: "Log filters" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "/v1/chat/completions (1)" })).toBeInTheDocument();
    expect(screen.getByText("~320")).toHaveAttribute("title", "Estimated tokens");
    expect(within(screen.getByTestId("desktop-log-results")).getByText("~$0.01")).toHaveAttribute("title", "Modelled cost");
  });

  it("presents log search and filters as a distinct control group", () => {
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    expect(screen.getByRole("group", { name: "Log filters" })).toHaveTextContent("Search and filter");
  });

  it("shows all available metadata and links the related issue", () => {
    state.logs = [sampleLog];
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    fireEvent.click(within(screen.getByTestId("desktop-log-results")).getByRole("button", { name: /Open metadata for openai/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Time to first byte");
    expect(screen.getByRole("dialog")).toHaveTextContent("Not provided");
    expect(screen.getByRole("dialog")).toHaveTextContent("Modelled cost");
    expect(screen.getByRole("dialog")).toHaveTextContent("Pricing version");
    expect(screen.getByRole("dialog")).toHaveTextContent("Idempotency key");
    expect(screen.getByRole("link", { name: sampleLog.issue_ids?.[0] })).toHaveAttribute(
      "href",
      `/app/issues?open=${sampleLog.issue_ids?.[0]}`,
    );
  });

  it("virtualizes a 5,000-row result and renders the scrolled window", () => {
    state.logs = Array.from({ length: 5_000 }, (_, index) => ({
      ...sampleLog,
      id: `${index}`.padStart(36, "0"),
      endpoint: `/v1/logs/${index}`,
    }));
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("row").length).toBeLessThan(50);
    fireEvent.scroll(screen.getByTestId("logs-table-viewport"), { target: { scrollTop: 500 * 56 } });
    expect(within(screen.getByTestId("desktop-log-results")).getByText("/v1/logs/500")).toBeInTheDocument();
  });

  it("offers cursor pagination when another page is available", () => {
    state.hasNextPage = true;
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(state.fetchNextPage).toHaveBeenCalledOnce();
  });

  it("keeps loaded rows visible when another query page fails", () => {
    state.logs = [sampleLog];
    state.isError = true;
    render(
      <MemoryRouter>
        <Logs />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("No sample data is being shown.");
    expect(within(screen.getByTestId("desktop-log-results")).getByText("/v1/chat/completions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
