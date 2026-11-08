import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "../auth/authClient";
import AuthCallback from "./AuthCallback";

vi.mock("../auth/authClient", () => ({
  authClient: { me: vi.fn() },
}));

describe("auth callback page", () => {
  beforeEach(() => {
    vi.mocked(authClient.me).mockResolvedValue(null);
  });

  it("explains an invalid callback and provides a sign-in recovery path", async () => {
    render(
      <MemoryRouter initialEntries={["/auth/callback"]}>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("The sign-in link is invalid or has expired.");
    expect(screen.getByRole("heading", { name: "Unable to complete sign-in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to sign in" })).toHaveAttribute("href", "/login");
  });

  it("uses a reduced-motion-safe indicator while verifying a sign-in link", () => {
    vi.mocked(authClient.me).mockImplementation(() => new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/auth/callback"]}>
        <AuthCallback />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status").querySelector("svg")?.classList)
      .toContain("motion-safe:animate-spin");
  });
});
