import type { Server, Socket } from "socket.io";
import {
  buildClientView,
  createGame,
  ensureActionTimer,
  getGame,
  hasUnrevealedCommunityCards,
  joinGame,
  markDisconnected,
  PokerEngineError,
  restartGame,
  revealNextCommunityCard,
  startGame,
  startNextHand,
  submitAction,
} from "./gameManager";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/socketEvents";

const HAND_RESULT_DISPLAY_MS = 6500;
const GAME_RESTART_DELAY_MS = 15000;
const REVEAL_STEP_MS = 650;

// Guards against scheduling more than one reveal chain per game — broadcastGameState
// can be triggered from several places (an action, a disconnect, a reveal step itself)
// while a reveal is still catching up, and we only want a single ticking chain.
const revealInFlight = new Set<string>();

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents> & {
  data: { gameId?: string; playerId?: string };
};

function errorMessage(err: unknown): string {
  if (err instanceof PokerEngineError) return err.message;
  return "Something went wrong";
}

export function broadcastGameState(io: Server<ClientToServerEvents, ServerToClientEvents>, gameId: string): void {
  const table = getGame(gameId);
  if (!table) return;

  // Must run before building client views below, so the deadline it sets (or refreshes)
  // is actually included in this broadcast instead of only showing up on the next one.
  ensureActionTimer(table, () => broadcastGameState(io, gameId));

  const sockets = io.sockets.adapter.rooms.get(gameId);
  if (!sockets) return;
  for (const socketId of sockets) {
    const socket = io.sockets.sockets.get(socketId) as AppSocket | undefined;
    if (!socket?.data.playerId) continue;
    socket.emit("game_state", buildClientView(table, socket.data.playerId));
  }

  // Deal out any still-hidden community cards one at a time (dramatic reveal) instead
  // of dumping the whole board on screen the instant the engine finishes computing it.
  if (hasUnrevealedCommunityCards(table) && !revealInFlight.has(gameId)) {
    revealInFlight.add(gameId);
    setTimeout(() => {
      revealInFlight.delete(gameId);
      const latest = getGame(gameId);
      if (!latest) return;
      revealNextCommunityCard(latest);
      broadcastGameState(io, gameId);
    }, REVEAL_STEP_MS);
  }

  if (table.currentHand?.street === "complete" && table.status === "in-progress" && !hasUnrevealedCommunityCards(table)) {
    setTimeout(() => {
      const latest = getGame(gameId);
      if (!latest || latest.currentHand?.street !== "complete") return;
      startNextHand(latest);
      broadcastGameState(io, gameId);
    }, HAND_RESULT_DISPLAY_MS);
  }

  if (table.status === "complete") {
    setTimeout(() => {
      const latest = getGame(gameId);
      if (!latest || latest.status !== "complete") return;
      restartGame(latest);
      broadcastGameState(io, gameId);
    }, GAME_RESTART_DELAY_MS);
  }
}

export function registerSocketHandlers(io: Server<ClientToServerEvents, ServerToClientEvents>): void {
  io.on("connection", (socket: AppSocket) => {
    socket.on("create_game", ({ hostName, settings }, ack) => {
      try {
        const { gameId, playerId } = createGame(hostName.slice(0, 24) || "Host", settings);
        socket.data.gameId = gameId;
        socket.data.playerId = playerId;
        socket.join(gameId);
        ack({ gameId, playerId });
        broadcastGameState(io, gameId);
      } catch (err) {
        ack({ error: errorMessage(err) });
      }
    });

    socket.on("join_game", ({ gameId, name, existingPlayerId }, ack) => {
      try {
        const { playerId } = joinGame(gameId, name, existingPlayerId);
        socket.data.gameId = gameId;
        socket.data.playerId = playerId;
        socket.join(gameId);
        ack({ playerId });
        broadcastGameState(io, gameId);
      } catch (err) {
        ack({ error: errorMessage(err) });
      }
    });

    socket.on("start_game", ({ gameId, playerId }, ack) => {
      try {
        startGame(gameId, playerId);
        ack({ ok: true });
        broadcastGameState(io, gameId);
      } catch (err) {
        ack({ error: errorMessage(err) });
      }
    });

    socket.on("player_action", ({ gameId, playerId, action }, ack) => {
      try {
        submitAction(gameId, playerId, action);
        ack({ ok: true });
        broadcastGameState(io, gameId);
      } catch (err) {
        ack({ error: errorMessage(err) });
      }
    });

    socket.on("disconnect", () => {
      const { gameId, playerId } = socket.data;
      if (!gameId || !playerId) return;
      markDisconnected(gameId, playerId);
      broadcastGameState(io, gameId);
    });
  });
}
