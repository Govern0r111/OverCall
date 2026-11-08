/// <reference types="node" />
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getPreference, resolveTheme, setPreference, THEME_STORAGE_KEY } from "./theme";

const tokenSource = readFileSync("src/styles/tokens.css", "utf8");

function getThemeTokens(theme: "light" | "dark"): Map<string, string> {
  const expression = theme === "light"
    ? /:root,\s*:root\[data-theme="light"\]\s*\{([^}]+)\}/
    : /:root\[data-theme="dark"\]\s*\{([^}]+)\}/;
  const block = tokenSource.match(expression)?.[1];
  if (!block) throw new Error(`Missing ${theme} theme token block`);
  return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]));
}

function contrastRatio(foreground: string, background: string): number {
  const toLinear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance = (color: string) => {
    const match = color.match(/^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/);
    if (!match) throw new Error(`Expected HSL token, received: ${color}`);
    const hue = Number(match[1]) / 360;
    const saturation = Number(match[2]) / 100;
    const lightness = Number(match[3]) / 100;
    const channel = (offset: number) => {
      const k = (offset + hue * 12) % 12;
      const a = saturation * Math.min(lightness, 1 - lightness);
      return toLinear(lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    };
    return 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

describe("theme preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("follows the system theme when no choice is stored", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("uses a saved choice instead of the system theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getPreference()).toBe("light");
    expect(resolveTheme(getPreference(), true)).toBe("light");
  });

  it("falls back to the system setting for corrupted values", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(getPreference()).toBe("system");
  });

  it("persists and applies an explicit choice without leaving transition suppression active", async () => {
    setPreference("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await new Promise<void>((resolve) => {
      if (!window.requestAnimationFrame) {
        resolve();
        return;
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });

    expect(document.documentElement).not.toHaveClass("theme-transition-suppressed");
  });

  it("defines one shared semantic palette and consistent public/app aliases", () => {
    const light = getThemeTokens("light");
    const dark = getThemeTokens("dark");
    const required = [
      "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
      "primary", "primary-foreground", "secondary", "muted", "muted-foreground", "ui-accent",
      "ui-border", "input", "ring", "destructive", "destructive-foreground",
      "positive-hsl", "warning-hsl", "critical-hsl", "bg", "surface", "border", "text",
      "text-muted", "chart-secondary", "accent", "positive", "warning", "critical",
    ];

    for (const role of required) {
      expect(light.has(role), `light theme is missing --${role}`).toBe(true);
      expect(dark.has(role), `dark theme is missing --${role}`).toBe(true);
    }

    for (const tokens of [light, dark]) {
      expect(tokens.get("bg")).toBe("hsl(var(--background))");
      expect(tokens.get("surface")).toBe("hsl(var(--card))");
      expect(tokens.get("border")).toBe("hsl(var(--ui-border))");
      expect(tokens.get("text")).toBe("hsl(var(--foreground))");
      expect(tokens.get("text-muted")).toBe("hsl(var(--muted-foreground))");
      expect(tokens.get("chart-secondary")).toBe("var(--text-muted)");
      expect(tokens.get("accent")).toBe("hsl(var(--primary))");
      expect(tokens.get("positive")).toBe("hsl(var(--positive-hsl))");
      expect(tokens.get("warning")).toBe("hsl(var(--warning-hsl))");
      expect(tokens.get("critical")).toBe("hsl(var(--critical-hsl))");
    }
  });

  it("meets text and focus contrast targets in light and dark themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const tokens = getThemeTokens(theme);
      const background = tokens.get("background")!;
      const card = tokens.get("card")!;
      expect(contrastRatio(tokens.get("foreground")!, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.get("muted-foreground")!, background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.get("primary-foreground")!, tokens.get("primary")!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.get("destructive-foreground")!, tokens.get("destructive")!)).toBeGreaterThanOrEqual(4.5);
      for (const role of ["positive-hsl", "warning-hsl", "critical-hsl"]) {
        expect(contrastRatio(tokens.get(role)!, card)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(tokens.get("ring")!, background)).toBeGreaterThanOrEqual(3);
    }
  });
});
