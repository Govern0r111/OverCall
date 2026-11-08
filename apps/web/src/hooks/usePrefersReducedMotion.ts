import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

const getPreference = () =>
  typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

export const usePrefersReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(getPreference);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(QUERY);
    const updatePreference = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    setReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
};
