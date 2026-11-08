import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppAuthProvider } from "../auth/AuthContext";
import { Sheet } from "./ui/sheet";
import { Topbar } from "./Topbar";

const state = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("../hooks/queries", () => ({
  useLoadSynthetic: () => ({ mutate: state.load, isPending: false }),
  useProviders: () => ({ data: [] }),
  useSaveSettings: () => ({ mutate: vi.fn() }),
}));

vi.mock("../context/AppContext", () => ({
  useApp: () => ({ theme: "light", setTheme: vi.fn(), settings: { currency: "USD" } }),
}));

const renderTopbar = (isDemo: boolean) => {
  render(
    <AppAuthProvider
      user={{
        id: isDemo ? "demo-user" : "real-user",
        email: isDemo ? "demo@overcall.local" : "person@example.com",
        isDemo,
      }}
    >
      <Sheet open={false} onOpenChange={vi.fn()}>
        <Topbar />
      </Sheet>
    </AppAuthProvider>,
  );
};

describe("Topbar demo controls", () => {
  beforeEach(() => {
    state.load.mockClear();
  });

  it("does not offer demo data to a real account", () => {
    renderTopbar(false);

    expect(screen.queryByRole("button", { name: "Load demo data" })).not.toBeInTheDocument();
  });

  it("offers demo data in explicit demo mode", () => {
    renderTopbar(true);

    expect(screen.getByRole("button", { name: "Load demo data" })).toBeInTheDocument();
  });
});
