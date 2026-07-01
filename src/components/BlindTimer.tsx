"use client";

import { useEffect, useRef, useState } from "react";
import type { BlindLevel } from "@/lib/poker/types";

function formatMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function BlindTimer({ level, msUntilNext }: { level: BlindLevel; msUntilNext: number | null }) {
  const targetRef = useRef<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(msUntilNext);

  useEffect(() => {
    targetRef.current = msUntilNext == null ? null : Date.now() + msUntilNext;
  }, [msUntilNext]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingMs(targetRef.current == null ? null : Math.max(0, targetRef.current - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-xl bg-zinc-900/80 px-4 py-2 text-center shadow ring-1 ring-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-400">Blinds</div>
      <div className="font-mono text-lg font-bold text-zinc-50">
        {level.smallBlind}/{level.bigBlind}
      </div>
      {remainingMs != null && <div className="text-xs text-zinc-400">Next level in {formatMs(remainingMs)}</div>}
    </div>
  );
}
