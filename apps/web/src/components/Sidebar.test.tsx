import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { Sheet, SheetTrigger } from "./ui/sheet";

const state = vi.hoisted(() => ({
  overview: {
    has_data: false,
    issue_counts: { critical: 0, warning: 0, info: 0 },
  },
}));

vi.mock("../hooks/queries", () => ({
  useOverview: () => ({ data: state.overview }),
}));

vi.mock("../auth/authClient", () => ({
  authClient: { logout: vi.fn() },
}));

const renderSidebar = (path = "/app/issues", onClose = vi.fn(), mobileOpen = false) => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Sheet open={mobileOpen} onOpenChange={onClose}>
        <Sidebar onClose={onClose} />
      </Sheet>
    </MemoryRouter>,
  );
  return onClose;
};

const SidebarHarness = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <MemoryRouter initialEntries={["/app/issues"]}>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <button type="button" aria-label="Open navigation menu">
            Open navigation menu
          </button>
        </SheetTrigger>
        <Sidebar onClose={() => setMobileOpen(false)} />
      </Sheet>
    </MemoryRouter>
  );
};

describe("Sidebar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("announces the current route as the active navigation link", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Issues" })).toHaveAttribute("aria-current", "page");
  });

  it("uses the brand as a direct path back to the overview", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "Overcall API spend monitor" })).toHaveAttribute("href", "/app");
  });

  it("names the primary route list as workspace navigation", () => {
    renderSidebar();

    expect(screen.getByRole("navigation", { name: "Workspace" })).toBeInTheDocument();
  });

  it("shows Profile as an active workspace destination", () => {
    renderSidebar("/app/profile");

    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/app/profile");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps navigation names available when the sidebar is collapsed", () => {
    window.localStorage.setItem("cg-sidebar", "1");
    renderSidebar();

    expect(screen.getByRole("link", { name: "Overcall overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Issues" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Logs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Providers" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("closes the mobile navigation when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = renderSidebar("/app/issues", vi.fn(), true);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns focus to the menu trigger after Escape closes navigation", async () => {
    const user = userEvent.setup();
    render(<SidebarHarness />);
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(trigger).toHaveFocus();
  });
});
