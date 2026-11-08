import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppAuthProvider } from "../auth/AuthContext";
import type { AuthUser } from "../auth/authClient";
import Profile from "./Profile";

const logout = vi.hoisted(() => vi.fn());

vi.mock("../auth/authClient", () => ({
  authClient: { logout },
}));

const renderProfile = (email = "person@example.com") => {
  const user: AuthUser = { id: "user-1", email, isDemo: false };
  return render(
    <MemoryRouter initialEntries={["/app/profile"]}>
      <AppAuthProvider user={user}>
        <Routes>
          <Route path="/app/profile" element={<Profile />} />
          <Route path="/login" element={<p>Signed out</p>} />
        </Routes>
      </AppAuthProvider>
    </MemoryRouter>,
  );
};

describe("Profile page", () => {
  beforeEach(() => {
    logout.mockReset().mockResolvedValue(undefined);
  });

  it("shows the authenticated email and links to password reset", () => {
    renderProfile();

    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reset password" })).toHaveAttribute("href", "/forgot");
  });

  it("shows an explicit fallback when email is unavailable", () => {
    renderProfile("");

    expect(screen.getByText("Email address unavailable")).toBeInTheDocument();
  });

  it("signs out and returns to login", async () => {
    renderProfile();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Signed out")).toBeInTheDocument();
    expect(logout).toHaveBeenCalledOnce();
  });
});
