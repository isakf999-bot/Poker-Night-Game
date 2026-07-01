"use client";

import { useEffect, useRef, useState } from "react";

/** Small countdown pill shown above the seat whose turn it currently is. */
export function ActionCountdown({ deadlineMs }: { deadlineMs: number }) {
  const deadlineRef = useRef(deadlineMs);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, deadlineMs - Date.now()));

  useEffect(() => {
    deadlineRef.current = deadlineMs;
  }, [deadlineMs]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const seconds = Math.ceil(remainingMs / 1000);
  const urgent = seconds <= 5;

  return (
    <div
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold ${
        urgent ? "border-red-400 bg-red-500/30 text-red-100" : "border-amber-400 bg-amber-500/20 text-amber-100"
      }`}
    >
      {seconds}
    </div>
  );
}
