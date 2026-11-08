import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Provider } from "../lib/api";
import Providers from "./Providers";

type KeyRecord = {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const state = vi.hoisted(() => ({
  providers: [] as Provider[],
  providerDataUnavailable: false,
  loading: false,
  error: false,
  refetch: vi.fn(),
  keys: [] as KeyRecord[],
  createKey: vi.fn(),
  revokeKey: vi.fn(),
}));

vi.mock("../hooks/queries", () => ({
  useProviders: () => ({
    data: state.providerDataUnavailable ? undefined : state.providers,
    isLoading: state.loading,
    isError: state.error,
    refetch: state.refetch,
  }),
  useIngestKeys: () => ({ data: state.keys, isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateIngestKey: () => state.createKey,
  useRevokeIngestKey: () => ({
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      state.revokeKey(id);
      options?.onSuccess?.();
    },
    isPending: false,
    isError: false,
    reset: vi.fn(),
  }),
}));

const provider = (id: Provider["id"], name: string, snippet: string): Provider => ({
  id,
  name,
  status: id === "aws" ? "coming_soon" : "waiting",
  proxy_base_url: `https://proxy.example/proxy/${id}/v1`,
  snippets: [
    { id: "curl", label: "cURL", code: snippet },
    { id: "python", label: "Python", code: "requests.request('POST', '/chat/completions')" },
    { id: "node", label: "Node", code: "await fetch('/chat/completions')" },
  ],
  traffic: { proxy: 0, demo: 0, last_request_at: null },
  upstream_mode: id === "openai" ? "mock" : id === "stripe" ? "test" : null,
  pricing: null,
  notes: id === "stripe" ? "Stripe does not bill per call. Savings are a modelled overhead." : null,
});

const createdKey = {
  id: "new-key-id",
  name: "local dev",
  prefix: "oc_test_",
  key: "oc_test_secret_once",
  created_at: "2026-11-07T10:00:00Z",
};

const renderProviders = () => render(<Providers />);
const stripeAuthOption = "-u " + "\"$STRIPE_TEST_KEY:\"";

describe("providers page", () => {
  beforeEach(() => {
    state.providers = [
      provider("openai", "OpenAI", "curl -X POST 'https://proxy.example/proxy/openai/v1/chat/completions' -H 'X-Overcall-Key: YOUR_OVERCALL_KEY'"), // gitleaks:allow
      provider(
        "stripe",
        "Stripe",
        `curl -X GET 'https://proxy.example/proxy/stripe/v1/customers' ${stripeAuthOption} -H 'X-Overcall-Key: YOUR_OVERCALL_KEY'`, // gitleaks:allow
      ),
      provider("aws", "AWS", ""),
    ];
    state.providerDataUnavailable = false;
    state.loading = false;
    state.error = false;
    state.refetch.mockClear();
    state.keys = [];
    state.createKey.mockReset().mockResolvedValue(createdKey);
    state.revokeKey.mockReset().mockResolvedValue(undefined);
  });

  it("shows a retry state for an initial provider request failure", () => {
    state.providerDataUnavailable = true;
    state.error = true;
    renderProviders();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Providers");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("keeps loaded providers visible when a background refresh fails", () => {
    state.error = true;
    renderProviders();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "OpenAI" })).toBeInTheDocument();
  });

  it("keeps the Providers frame visible while provider data is loading", () => {
    state.providerDataUnavailable = true;
    state.loading = true;
    renderProviders();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Providers");
    expect(screen.getByRole("status")).toHaveTextContent("Loading provider configuration");
    expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument();
  });

  it("shows each API-provided setup snippet in an accessible tab", async () => {
    const user = userEvent.setup();
    renderProviders();

    expect(screen.getByRole("region", { name: "OpenAI" })).toBeInTheDocument();
    const openaiCard = screen.getByTestId("provider-card-openai");
    await user.click(within(openaiCard).getByRole("tab", { name: "Python" }));

    expect(within(openaiCard).getByRole("tabpanel")).toHaveTextContent("requests.request('POST', '/chat/completions')");
    const snippet = within(openaiCard).getByRole("textbox", { name: "OpenAI Python setup snippet" });
    expect(snippet.tagName).toBe("TEXTAREA");
    expect(snippet).toHaveAttribute("readonly");

    await user.click(within(openaiCard).getByRole("tab", { name: "cURL" }));
    expect(within(openaiCard).getByRole("tabpanel")).toHaveTextContent("YOUR_OVERCALL_KEY");
    expect(screen.getByText(/Stripe test keys only/)).toBeInTheDocument();
    expect(screen.getByText("AWS support is coming soon.")).toBeInTheDocument();
  });

  it("keeps revoked key details fully legible", () => {
    state.keys = [{
      id: "revoked-key",
      name: "retired server",
      prefix: "oc_old1",
      created_at: "2026-11-01T10:00:00Z",
      last_used_at: null,
      revoked_at: "2026-11-07T10:00:00Z",
    }];
    renderProviders();

    expect(screen.getByText("Revoked").closest("li")).not.toHaveClass("opacity-60");
  });

  it("keeps the receiving-traffic pulse out of reduced-motion mode", () => {
    state.providers[0] = { ...state.providers[0], status: "receiving_traffic" };
    renderProviders();

    expect(screen.getByTestId("provider-status-openai").textContent).toContain("Receiving traffic");
    expect(screen.getByTestId("provider-status-openai").querySelector("span span span")?.className)
      .toContain("motion-safe:animate-ping");
  });

  it("shows the created key once and removes it after save confirmation", async () => {
    const user = userEvent.setup();
    renderProviders();

    await user.click(screen.getByRole("button", { name: "Create ingest key" }));
    const dialog = screen.getByRole("dialog", { name: "New ingest key" });
    await user.type(within(dialog).getByRole("textbox", { name: "Key name" }), "local dev");
    await user.click(within(dialog).getByRole("button", { name: "Create key" }));

    expect(await screen.findByRole("textbox", { name: "Your ingest key" })).toHaveValue(createdKey.key);
    expect(state.createKey).toHaveBeenCalledWith("local dev");

    await user.click(screen.getByRole("button", { name: "I have saved it" }));
    expect(screen.queryByRole("textbox", { name: "Your ingest key" })).not.toBeInTheDocument();
  });

  it("requires confirmation before revoking an ingest key", async () => {
    const user = userEvent.setup();
    state.keys = [{
      id: "key-to-revoke",
      name: "server",
      prefix: "oc_ab12",
      created_at: "2026-11-01T10:00:00Z",
      last_used_at: null,
      revoked_at: null,
    }];
    renderProviders();

    await user.click(screen.getByRole("button", { name: "Revoke server" }));
    const dialog = screen.getByRole("alertdialog", { name: "Revoke ingest key?" });
    expect(state.revokeKey).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Revoke key" }));
    expect(state.revokeKey).toHaveBeenCalledWith("key-to-revoke");
  });
});
