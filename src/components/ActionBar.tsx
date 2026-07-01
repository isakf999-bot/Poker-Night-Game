"use client";

import { useState } from "react";
import type { LegalAction, PlayerAction } from "@/lib/poker/types";

const ACTION_LABELS: Record<PlayerAction["type"], string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  bet: "Bet",
  raise: "Raise",
  "all-in": "All-in",
};

export function ActionBar({
  legalActions,
  viewerBetThisStreet,
  onAction,
}: {
  legalActions: LegalAction[];
  viewerBetThisStreet: number;
  onAction: (action: PlayerAction) => void;
}) {
  const betOrRaise = legalActions.find((a) => a.type === "bet" || a.type === "raise");
  // null = no manual override yet; falls back to the current minAmount each render.
  // ActionBar remounts each time it becomes the viewer's turn (parent only renders it
  // conditionally), so this naturally resets between turns without needing an effect.
  const [userAmount, setUserAmount] = useState<number | null>(null);
  const amount = userAmount ?? betOrRaise?.minAmount ?? 0;

  if (legalActions.length === 0) return null;

  const callAction = legalActions.find((a) => a.type === "call");

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl bg-zinc-900/90 p-5 shadow-xl ring-1 ring-zinc-800">
      {betOrRaise && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={betOrRaise.minAmount}
            max={betOrRaise.maxAmount}
            value={amount}
            onChange={(e) => setUserAmount(Number(e.target.value))}
            className="flex-1 accent-emerald-500"
          />
          <span className="w-24 text-right font-mono text-lg text-zinc-100">{amount.toLocaleString("en-US")}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {legalActions.map((action) => (
          <button
            key={action.type}
            onClick={() => onAction({ type: action.type, amount: action.type === "bet" || action.type === "raise" ? amount : undefined })}
            className={buttonClass(action.type)}
          >
            {ACTION_LABELS[action.type]}
            {action.type === "call" && callAction?.minAmount
              ? ` ${(callAction.minAmount - viewerBetThisStreet).toLocaleString("en-US")}`
              : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

function buttonClass(type: PlayerAction["type"]): string {
  const base = "flex-1 min-w-[100px] rounded-lg px-4 py-3 text-lg font-semibold text-white transition";
  switch (type) {
    case "fold":
      return `${base} bg-zinc-700 hover:bg-zinc-600`;
    case "check":
      return `${base} bg-zinc-600 hover:bg-zinc-500`;
    case "call":
      return `${base} bg-blue-600 hover:bg-blue-500`;
    case "bet":
    case "raise":
      return `${base} bg-emerald-600 hover:bg-emerald-500`;
    case "all-in":
      return `${base} bg-red-600 hover:bg-red-500`;
  }
}
