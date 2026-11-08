import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppAuthProvider } from "../../auth/AuthContext";
import { DataSection } from "./DataSection";

vi.mock("../../hooks/queries", () => ({
  useClearData: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useLoadSynthetic: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderDataSection = (isDemo: boolean) =>
  render(
    <AppAuthProvider
      user={{
        id: isDemo ? "demo-user" : "real-user",
        email: isDemo ? "demo@overcall.local" : "person@example.com",
        isDemo,
      }}
    >
      <DataSection />
    </AppAuthProvider>,
  );

describe("DataSection demo controls", () => {
  it("hides synthetic-data controls from a real account", () => {
    renderDataSection(false);

    expect(screen.queryByText("Synthetic demo data")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear data" })).toBeInTheDocument();
  });

  it("shows synthetic-data controls in explicit demo mode", () => {
    renderDataSection(true);

    expect(screen.getByText("Synthetic demo data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  });
});
