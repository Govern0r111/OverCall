export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const THEME_STORAGE_KEY = "overcall-theme";
export const THEME_CHANGE_EVENT = "overcall-theme-change";
const THEME_TRANSITION_CLASS = "theme-transition-suppressed";

let transitionFrame: number | undefined;
let transitionReleaseFrame: number | undefined;

function suppressThemeTransitions(root: HTMLElement, updateTheme: () => void): void {
  root.classList.add(THEME_TRANSITION_CLASS);
  updateTheme();
  void root.offsetHeight;

  if (typeof window.requestAnimationFrame !== "function") {
    root.classList.remove(THEME_TRANSITION_CLASS);
    return;
  }

  if (transitionFrame !== undefined) window.cancelAnimationFrame(transitionFrame);
  if (transitionReleaseFrame !== undefined) window.cancelAnimationFrame(transitionReleaseFrame);

  transitionFrame = window.requestAnimationFrame(() => {
    transitionReleaseFrame = window.requestAnimationFrame(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
      transitionFrame = undefined;
      transitionReleaseFrame = undefined;
    });
  });
}

export function getPreference(): ThemePreference {
  try {
    const preference = window.localStorage.getItem(THEME_STORAGE_KEY);
    return preference === "light" || preference === "dark" ? preference : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false,
): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference);
  const root = document.documentElement;
  suppressThemeTransitions(root, () => {
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  });
  return theme;
}

export function setPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The visual preference still applies for this session when storage is unavailable.
  }
  applyTheme(preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeToSystemTheme(onChange: () => void): () => void {
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!media) return () => undefined;
  const handleChange = () => {
    if (getPreference() === "system") {
      applyTheme("system");
      onChange();
    }
  };
  media.addEventListener?.("change", handleChange);
  return () => media.removeEventListener?.("change", handleChange);
}
