"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getSocket } from "@/lib/socketClient";
import type { ClientGameView } from "@/lib/socketEvents";
import { Lobby } from "@/components/Lobby";
import { Table } from "@/components/Table";
import { ActionBar } from "@/components/ActionBar";
import { BlindTimer } from "@/components/BlindTimer";
import { useGameSounds } from "@/lib/useGameSounds";
import { unlockAudio } from "@/lib/sounds";

export default function GamePage() {
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId;

  const [view, setView] = useState<ClientGameView | null>(null);
  const [name, setName] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [hasStoredPlayer, setHasStoredPlayer] = useState(
    () => typeof window !== "undefined" && !!sessionStorage.getItem(`poker:playerId:${gameId}`),
  );

  useEffect(() => {
    const socket = getSocket();

    function onState(v: ClientGameView) {
      setView(v);
    }
    socket.on("game_state", onState);

    // Re-join on every (re)connect, not just on mount — a dropped WebSocket (mobile
    // tab backgrounded, brief network blip) reconnects with a fresh server-side socket
    // that has no idea which player/game it belongs to until we tell it again.
    function rejoin() {
      const storedPlayerId = sessionStorage.getItem(`poker:playerId:${gameId}`);
      if (!storedPlayerId) return;
      socket.emit("join_game", { gameId, name: "", existingPlayerId: storedPlayerId }, (res) => {
        if ("error" in res) {
          sessionStorage.removeItem(`poker:playerId:${gameId}`);
          setHasStoredPlayer(false);
        }
      });
    }
    socket.on("connect", rejoin);
    if (socket.connected) rejoin();

    return () => {
      socket.off("game_state", onState);
      socket.off("connect", rejoin);
    };
  }, [gameId]);

  useEffect(() => {
    function unlockOnce() {
      unlockAudio();
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    }
    window.addEventListener("pointerdown", unlockOnce);
    window.addEventListener("keydown", unlockOnce);
    return () => {
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    };
  }, []);

  useGameSounds(view);

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setJoinError("Enter your name");
      return;
    }
    setJoining(true);
    setJoinError(null);
    getSocket().emit("join_game", { gameId, name: name.trim() }, (res) => {
      setJoining(false);
      if ("error" in res) {
        setJoinError(res.error);
        return;
      }
      sessionStorage.setItem(`poker:playerId:${gameId}`, res.playerId);
      setHasStoredPlayer(true);
    });
  }

  if (!view) {
    if (hasStoredPlayer) {
      return <Centered>Connecting...</Centered>;
    }
    return (
      <Centered>
        <form onSubmit={handleJoin} className="flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-zinc-900/60 p-6 shadow-xl ring-1 ring-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-50">Join the game</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            placeholder="Your name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
          />
          {joinError && <p className="text-sm text-red-400">{joinError}</p>}
          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </form>
      </Centered>
    );
  }

  if (view.status === "waiting") {
    return <Centered>{<Lobby view={view} />}</Centered>;
  }

  return (
    <div className="flex h-screen flex-col items-center gap-2 overflow-hidden bg-zinc-950 px-4 py-3">
      <div className="flex w-full max-w-6xl shrink-0 items-center justify-between">
        <BlindTimer level={view.currentBlindLevel} msUntilNext={view.msUntilNextBlindLevel} />
        {view.status === "complete" && (
          <span className="text-sm font-semibold text-amber-300">Game over! New round starting soon...</span>
        )}
      </div>

      <div className="flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center">
        <Table view={view} />
      </div>

      {view.lastHandResults && (
        <div className="w-full max-w-2xl shrink-0 rounded-xl bg-zinc-900/80 p-4 text-center shadow ring-1 ring-zinc-800">
          {view.lastHandResults.map((r) => (
            <div key={r.seatId} className={r.amountWon > 0 ? "font-semibold text-emerald-400" : "text-zinc-100"}>
              {r.amountWon > 0 && "🏆 "}
              {view.seats.find((s) => s.seatId === r.seatId)?.displayName} won {r.amountWon.toLocaleString("en-US")}
              {r.hand ? ` with ${r.hand.categoryLabel}` : ""}
            </div>
          ))}
        </div>
      )}

      {view.legalActionsForViewer.length > 0 && (
        <ActionBar
          legalActions={view.legalActionsForViewer}
          viewerBetThisStreet={view.seats.find((s) => s.seatId === view.viewerPlayerId)?.betThisStreet ?? 0}
          onAction={(action) => getSocket().emit("player_action", { gameId, playerId: view.viewerPlayerId, action }, () => {})}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-zinc-950 px-4 py-16">{children}</div>;
}
