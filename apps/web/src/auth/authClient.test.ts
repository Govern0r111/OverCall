import { beforeEach, describe, expect, it } from "vitest";
import { authClient, hasDemoSession } from "./authClient";

beforeEach(() => {
  localStorage.clear();
});

describe("mock auth client", () => {
  it("normalizes email and persists a signup session", async () => {
    const result = await authClient.signup("  Person@Example.com  ", "secure-password");

    expect(result).toEqual({
      user: { id: "demo-user", email: "person@example.com", isDemo: true },
      needsEmailConfirmation: false,
    });
    expect(await authClient.me()).toEqual(result.user);
    expect(hasDemoSession()).toBe(true);
  });

  it("returns useful errors for the deterministic mock accounts", async () => {
    await expect(authClient.signup("taken@example.com", "secure-password")).rejects.toThrow(/already registered/i);
    await expect(authClient.login("wrong@example.com", "secure-password")).rejects.toThrow(/invalid login credentials/i);
  });

  it("logs in and clears the local session on logout", async () => {
    const user = await authClient.login("person@example.com", "secure-password");
    expect(user.email).toBe("person@example.com");
    expect(await authClient.getAccessToken()).toBeNull();
    await authClient.logout();
    expect(await authClient.me()).toBeNull();
    expect(hasDemoSession()).toBe(false);
  });
});
