import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export const useCountUp = (target: number, duration = 900): number => {
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState(() => reducedMotion ? target : 0);
  const frameRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimationFrame(frameRef.current);
      setValue(target);
      return;
    }
    if (target === 0) {
      setValue(0);
      return;
    }
    cancelAnimationFrame(frameRef.current);
    startRef.current = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      setValue(target * easeOutCubic(progress));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, reducedMotion]);

  return value;
};
