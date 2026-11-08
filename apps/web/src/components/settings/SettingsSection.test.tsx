import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsSection } from "./SettingsSection";

describe("SettingsSection", () => {
  it("exposes each settings category as a named region", () => {
    render(
      <SettingsSection title="Appearance" testId="settings-appearance">
        <p>Theme controls</p>
      </SettingsSection>,
    );

    expect(screen.getByRole("region", { name: "Appearance" })).toBeInTheDocument();
  });
});
