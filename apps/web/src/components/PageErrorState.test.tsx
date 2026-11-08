import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageErrorState } from "./PageErrorState";

describe("PageErrorState", () => {
  it("announces the failure and retries the failed request", () => {
    const retry = vi.fn();
    render(<PageErrorState message="Could not load metrics." onRetry={retry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load metrics.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
