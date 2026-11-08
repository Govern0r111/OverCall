import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { useCreateIngestKey } from "./queries";

const created = {
  id: "created-id",
  name: "next",
  prefix: "oc_next_",
  key: "oc_full_secret",
  created_at: "2026-11-07T10:00:00Z",
};

const existing = {
  id: "existing-id",
  name: "existing",
  prefix: "oc_existing",
  created_at: "2026-11-06T10:00:00Z",
  last_used_at: null,
  revoked_at: null,
};

describe("ingest-key queries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the one-time secret without putting it in the query cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["ingestKeys"], [existing]);
    vi.spyOn(api, "post").mockResolvedValue({ data: created } as never);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result, unmount } = renderHook(() => useCreateIngestKey(), { wrapper });
    let response: typeof created | undefined;

    await act(async () => {
      response = await result.current("next");
    });

    expect(response).toEqual(created);
    expect(api.post).toHaveBeenCalledWith("/ingest-keys", { name: "next" });
    expect(queryClient.getQueryData(["ingestKeys"])).toEqual([
      {
        id: "created-id",
        name: "next",
        prefix: "oc_next_",
        created_at: "2026-11-07T10:00:00Z",
        last_used_at: null,
        revoked_at: null,
      },
      existing,
    ]);
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.state.data)))
      .not.toContain(created.key);

    unmount();
    queryClient.clear();
  });
});
