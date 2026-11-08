import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("formatMoney", () => {
  it("converts INR values, groups lakhs, and keeps very small USD values readable", () => {
    expect(formatMoney(0.1, "INR", 83.5)).toBe("₹8.35");
    expect(formatMoney(12_345_678, "INR", 1)).toBe("₹1,23,45,678");
    expect(formatMoney(0.0004, "USD", 83.5)).toBe("$0.0004");
  });
});
