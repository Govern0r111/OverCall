import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safeRedirect";

describe("safeRedirect", () => {
  it("allows same-origin paths and keeps their query and hash", () => {
    expect(safeRedirect("/app/issues?severity=warning#top")).toBe("/app/issues?severity=warning#top");
  });

  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "rejects unsafe destination %s",
    (candidate) => {
      expect(safeRedirect(candidate)).toBe("/app");
    },
  );

  it("uses the fallback when no destination is supplied", () => {
    expect(safeRedirect(null, "/login")).toBe("/login");
  });
});
