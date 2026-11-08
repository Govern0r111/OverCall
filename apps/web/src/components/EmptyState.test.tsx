import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppAuthProvider } from "../auth/AuthContext";
import { EmptyState } from "./EmptyState";

vi.mock("../hooks/queries", () => ({
  useLoadSynthetic: () => ({ mutate: vi.fn(), isPending: false }),
}));

const renderEmptyState = (isDemo: boolean) =>
  render(
    <AppAuthProvider
      user={{
        id: isDemo ? "demo-user" : "real-user",
        email: isDemo ? "demo@overcall.local" : "person@example.com",
        isDemo,
      }}
    >
      <MemoryRouter>
        <EmptyState />
      </MemoryRouter>
    </AppAuthProvider>,
  );

describe("EmptyState demo controls", () => {
  it("does not offer synthetic data to a real account", () => {
    renderEmptyState(false);

    expect(screen.queryByRole("button", { name: "Load demo data" })).not.toBeInTheDocument();
    expect(screen.queryByText(/load a 7-day demo dataset/i)).not.toBeInTheDocument();
  });

  it("offers synthetic data in explicit demo mode", () => {
    renderEmptyState(true);

    expect(screen.getByRole("button", { name: "Load demo data" })).toBeInTheDocument();
  });
});
