import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";

const authState = vi.hoisted(() => ({
  user: { id: "demo-user", email: "demo@overcall.local", isDemo: true } as {
    id: string;
    email: string;
    isDemo: boolean;
  } | null,
  listener: null as ((user: { id: string; email: string; isDemo: boolean } | null) => void) | null,
}));

vi.mock("./authClient", () => ({
  authClient: {
    me: vi.fn(async () => authState.user),
    onAuthStateChange: vi.fn((callback: typeof authState.listener) => {
      authState.listener = callback;
      return () => {
        authState.listener = null;
      };
    }),
  },
}));

beforeEach(() => {
  authState.user = { id: "demo-user", email: "demo@overcall.local", isDemo: true };
  authState.listener = null;
});

describe("ProtectedRoute", () => {
  it("settles initial auth state when StrictMode replays effects", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/app"]}>
            <Routes>
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <p>Protected workspace</p>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
  });

  it("clears tenant query data when the authenticated identity changes", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <p>Protected workspace</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
    queryClient.setQueryData(["tenant", "issues"], ["demo-issue"]);
    expect(queryClient.getQueryData(["tenant", "issues"])).toEqual(["demo-issue"]);

    act(() => {
      authState.user = { id: "real-user", email: "person@example.com", isDemo: true };
      authState.listener?.(authState.user);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(["tenant", "issues"])).toBeUndefined();
    });
  });

  it("clears tenant query data when the same user switches between demo and live mode", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <p>Protected workspace</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
    queryClient.setQueryData(["tenant", "issues"], ["demo-issue"]);

    act(() => {
      authState.user = { id: "demo-user", email: "person@example.com", isDemo: false };
      authState.listener?.(authState.user);
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(["tenant", "issues"])).toBeUndefined();
    });
  });

  it("keeps tenant query data when a token refresh preserves the user identity", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <p>Protected workspace</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
    queryClient.setQueryData(["tenant", "issues"], ["demo-issue"]);

    act(() => {
      authState.user = { id: "demo-user", email: "updated@example.com", isDemo: true };
      authState.listener?.(authState.user);
    });

    expect(queryClient.getQueryData(["tenant", "issues"])).toEqual(["demo-issue"]);
  });

  it("hides the previous workspace while tenant data is being cleared", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let finishCancellation: (() => void) | undefined;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <p>Protected workspace</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
    vi.spyOn(queryClient, "cancelQueries").mockImplementation(
      () =>
        new Promise((resolve) => {
          finishCancellation = resolve;
        }),
    );
    queryClient.setQueryData(["tenant", "issues"], ["demo-issue"]);

    act(() => {
      authState.user = { id: "real-user", email: "person@example.com", isDemo: false };
      authState.listener?.(authState.user);
    });

    expect(screen.queryByText("Protected workspace")).not.toBeInTheDocument();
    expect(screen.getByText("Loading your workspace…")).toBeInTheDocument();

    act(() => finishCancellation?.());

    expect(await screen.findByText("Protected workspace")).toBeInTheDocument();
    expect(queryClient.getQueryData(["tenant", "issues"])).toBeUndefined();
  });
});
