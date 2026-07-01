"use client";

import { useState } from "react";
import type { ClientGameView } from "@/lib/socketEvents";
import { getSocket } from "@/lib/socketClient";

export function Lobby({ view }: { view: ClientGameView }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHost = view.hostPlayerId === view.viewerPlayerId;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  function handleStart() {
    setStarting(true);
    setError(null);
    getSocket().emit("start_game", { gameId: view.gameId, playerId: view.viewerPlayerId }, (res) => {
      setStarting(false);
      if ("error" in res) setError(res.error);
    });
  }

  function copyLink() {
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl bg-zinc-900/60 p-6 shadow-xl ring-1 ring-zinc-800">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">Waiting for players</h2>
        <p className="text-sm text-zinc-400">Share the link below so others can join.</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={shareUrl} className="flex-1 truncate rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300" />
          <button onClick={copyLink} className="rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600">
            Copy
          </button>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {view.seats.map((seat) => (
          <li key={seat.seatId} className="flex items-center justify-between rounded-lg bg-zinc-800/60 px-3 py-2">
            <span className="text-zinc-100">
              {seat.displayName}
              {seat.seatId === view.hostPlayerId && <span className="ml-2 text-xs text-emerald-400">Host</span>}
            </span>
            <span className="text-sm text-zinc-400">{seat.stack.toLocaleString("en-US")} chips</span>
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {isHost ? (
        <button
          onClick={handleStart}
          disabled={starting || view.seats.length < 2}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {view.seats.length < 2 ? "Waiting for more players..." : starting ? "Starting..." : "Start game"}
        </button>
      ) : (
        <p className="text-center text-sm text-zinc-400">Waiting for the host to start the game...</p>
      )}
    </div>
  );
}
