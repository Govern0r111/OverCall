import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let authClient: typeof import("./authClient").authClient;
let hasDemoSession: typeof import("./authClient").hasDemoSession;

beforeEach(async () => {
  localStorage.clear();
  vi.stubEnv("VITE_AUTH_MODE", "mock");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  vi.doUnmock("./supabaseClient");
  vi.resetModules();
  ({ authClient, hasDemoSession } = await import("./authClient"));
});

afterEach(() => {
  vi.doUnmock("./supabaseClient");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("mock auth client", () => {
  it("normalizes email and persists a signup session", async () => {
    expect(authClient.isDemoModeAvailable()).toBe(true);
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

describe("Supabase auth mode", () => {
  it("ignores a stale demo session", async () => {
    localStorage.setItem("overcall-mock-session", JSON.stringify({ email: "demo@example.com" }));
    vi.stubEnv("VITE_AUTH_MODE", "supabase");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
    vi.doMock("./supabaseClient", () => ({
      supabase: {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
      },
    }));
    vi.resetModules();

    const { authClient: supabaseAuthClient, hasDemoSession: hasSupabaseDemoSession } = await import("./authClient");

    expect(supabaseAuthClient.isDemoModeAvailable()).toBe(false);
    expect(await supabaseAuthClient.me()).toBeNull();
    expect(hasSupabaseDemoSession()).toBe(false);
  });
});
