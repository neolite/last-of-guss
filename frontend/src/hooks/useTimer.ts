import { useState, useEffect, useRef, useCallback } from "react";

export function useTimer(targetTime: Date | null) {
  const [remaining, setRemaining] = useState<number>(0);
  const rafRef = useRef<number>(0);
  const prevSecondRef = useRef<number>(-1);

  const update = useCallback(() => {
    if (!targetTime) {
      setRemaining(0);
      return;
    }

    const now = Date.now();
    const target = targetTime.getTime();
    const diff = Math.max(0, target - now);
    const currentSecond = Math.floor(diff / 1000);

    // Only update state when second changes
    if (currentSecond !== prevSecondRef.current) {
      prevSecondRef.current = currentSecond;
      setRemaining(diff);
    }

    if (diff > 0) {
      rafRef.current = requestAnimationFrame(update);
    }
  }, [targetTime]);

  useEffect(() => {
    if (!targetTime) return;

    prevSecondRef.current = -1;
    rafRef.current = requestAnimationFrame(update);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [targetTime, update]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return {
    remaining,
    minutes,
    seconds,
    formatted: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    isFinished: remaining <= 0,
  };
}
