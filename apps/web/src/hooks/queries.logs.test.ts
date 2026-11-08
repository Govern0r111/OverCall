import { describe, expect, it } from "vitest";
import { buildLogQueryParams } from "./queries";

describe("buildLogQueryParams", () => {
  it("maps search and all shareable filters to the logs API", () => {
    expect(buildLogQueryParams({
      search: "  gpt-4o  ",
      provider: "openai",
      status_class: "4xx",
      endpoint: "/v1/chat/completions",
      caller: "checkout",
      model: "gpt-4o",
      issue_id: "11111111-1111-4111-8111-111111111111",
      from: "2026-11-06T00:00:00.000Z",
      to: "2026-11-07T00:00:00.000Z",
    }, "next-cursor")).toEqual({
      limit: 200,
      q: "gpt-4o",
      provider: "openai",
      status_class: "4xx",
      endpoint: "/v1/chat/completions",
      caller: "checkout",
      model: "gpt-4o",
      issue_id: "11111111-1111-4111-8111-111111111111",
      from: "2026-11-06T00:00:00.000Z",
      to: "2026-11-07T00:00:00.000Z",
      cursor: "next-cursor",
    });
  });

  it("does not send API searches shorter than four characters", () => {
    expect(buildLogQueryParams({ search: "ab", provider: "openai" })).toEqual({
      limit: 200,
      provider: "openai",
    });
  });
});
