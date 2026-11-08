import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import settingsDefault from "../../../../contract/fixtures/api/settings.default.json";
import { AppAuthProvider } from "../auth/AuthContext";
import { fromApiSettings, type ApiSettings } from "../lib/api";
import Settings from "./Settings";

const state = vi.hoisted(() => ({
  settings: null as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock("../hooks/queries", () => ({
  useSettings: () => ({
    data: state.settings,
    isLoading: state.isLoading,
    isError: state.isError,
    refetch: state.refetch,
  }),
}));

vi.mock("../context/AppContext", () => ({
  useApp: () => ({ settings: state.settings }),
}));

vi.mock("../components/settings/AppearanceSection", () => ({
  AppearanceSection: () => <p>Appearance settings</p>,
}));
vi.mock("../components/settings/RulesSection", () => ({ RulesSection: () => null }));
vi.mock("../components/settings/WindowsSection", () => ({ WindowsSection: () => null }));
vi.mock("../components/settings/UpstreamSection", () => ({ UpstreamSection: () => null }));
vi.mock("../components/settings/DataSection", () => ({ DataSection: () => null }));
vi.mock("../components/settings/AccuracySection", () => ({
  AccuracySection: () => <p>Accuracy section</p>,
}));

const renderSettings = (isDemo = false) =>
  render(
    <AppAuthProvider
      user={{
        id: isDemo ? "demo-user" : "real-user",
        email: isDemo ? "demo@overcall.local" : "person@example.com",
        isDemo,
      }}
    >
      <Settings />
    </AppAuthProvider>,
  );

describe("Settings page request states", () => {
  beforeEach(() => {
    state.settings = fromApiSettings(settingsDefault as ApiSettings);
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockClear();
  });

  it("shows a retry state for an initial settings failure", () => {
    state.settings = null;
    state.isError = true;
    renderSettings();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Settings");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("keeps loaded settings visible when a background refresh fails", () => {
    state.isError = true;
    renderSettings();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Appearance settings")).toBeInTheDocument();
  });

  it("keeps the Settings heading visible while settings are loading", () => {
    state.settings = null;
    state.isLoading = true;
    renderSettings();

    expect(screen.getByTestId("page-title")).toHaveTextContent("Settings");
    expect(screen.getByRole("status")).toHaveTextContent("Loading settings");
    expect(screen.queryByTestId("page-loading")).not.toBeInTheDocument();
  });

  it("does not show synthetic accuracy data to a real account", () => {
    renderSettings(false);

    expect(screen.queryByText("Accuracy section")).not.toBeInTheDocument();
  });

  it("keeps synthetic accuracy data available in explicit demo mode", () => {
    renderSettings(true);

    expect(screen.getByText("Accuracy section")).toBeInTheDocument();
  });
});
