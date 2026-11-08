import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AuthPage from "./AuthPage";

const authState = vi.hoisted(() => ({ demoAvailable: true }));

vi.mock("../auth/authClient", () => ({
  authClient: {
    isDemoModeAvailable: () => authState.demoAvailable,
    isGoogleSignInAvailable: () => false,
    loginWithGoogle: vi.fn().mockRejectedValue(new Error("Google sign-in requires Supabase Auth configuration.")),
  },
}));

describe("auth page", () => {
  beforeEach(() => {
    authState.demoAvailable = true;
  });

  it("presents the login form in a named region with a clear return path", () => {
    render(
      <MemoryRouter>
        <AuthPage mode="login" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("region", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overcall" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Continue as demo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("provides the global skip link with a focusable main landmark target", () => {
    render(
      <MemoryRouter>
        <AuthPage mode="login" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  });

  it("does not offer demo sign-in when Supabase auth is configured", () => {
    authState.demoAvailable = false;
    render(
      <MemoryRouter>
        <AuthPage mode="login" />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Continue as demo" })).not.toBeInTheDocument();
    expect(screen.queryByText(/local demo session/i)).not.toBeInTheDocument();
  });

  it.each(["login", "signup"] as const)("offers Google sign-in on %s and explains when Supabase setup is missing", async (mode) => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthPage mode={mode} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));

    expect(await screen.findByRole("alert"))
      .toHaveTextContent("Google sign-in requires Supabase Auth");
  });
});
