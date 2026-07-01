import { randomBytes, randomUUID } from "crypto";
import { buildBlindSchedule, getCurrentBlindLevel, getMsUntilNextLevel } from "@/lib/poker/blindSchedule";
import { HAND_CATEGORY_LABELS } from "@/lib/poker/handLabels";
import { applyPlayerAction, canStartHand, forceFold, getActingSeatId, getLegalActionsForSeat, startHand } from "@/lib/poker/handOrchestrator";
import { PokerEngineError } from "@/lib/poker/handOrchestrator";
import type { BlindScheduleConfig, PlayerAction, Seat, TableState } from "@/lib/poker/types";
import type { ClientGameView, ClientHandResult, ClientSeatView } from "@/lib/socketEvents";

const games = new Map<string, TableState>();

const GAME_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no ambiguous chars

function generateGameId(): string {
  const bytes = randomBytes(8);
  let id = "";
  for (const b of bytes) id += GAME_ID_ALPHABET[b % GAME_ID_ALPHABET.length];
  return id;
}

export { PokerEngineError };

export function createGame(hostName: string, settings: BlindScheduleConfig): { gameId: string; playerId: string } {
  const gameId = generateGameId();
  const hostPlayerId = randomUUID();

  const hostSeat: Seat = {
    seatId: hostPlayerId,
    playerId: hostPlayerId,
    displayName: hostName,
    stack: settings.startingChips,
    isSittingOut: false,
    isConnected: true,
  };

  const table: TableState = {
    gameId,
    hostPlayerId,
    settings,
    blindSchedule: buildBlindSchedule(settings),
    gameStartedAtMs: null,
    seats: [hostSeat],
    dealerSeatIndex: -1,
    handNumber: 0,
    status: "waiting",
    currentHand: null,
  };

  games.set(gameId, table);
  return { gameId, playerId: hostPlayerId };
}

export function getGame(gameId: string): TableState | undefined {
  return games.get(gameId);
}

export function joinGame(gameId: string, name: string, existingPlayerId?: string): { playerId: string } {
  const table = games.get(gameId);
  if (!table) throw new PokerEngineError("Game not found");

  if (existingPlayerId) {
    const seat = table.seats.find((s) => s.playerId === existingPlayerId);
    if (seat) {
      seat.isConnected = true;
      cancelPendingDisconnectFold(gameId, existingPlayerId);
      return { playerId: seat.playerId };
    }
  }

  if (table.status !== "waiting") {
    throw new PokerEngineError("The game has already started, you can't join now");
  }

  const playerId = randomUUID();
  const seat: Seat = {
    seatId: playerId,
    playerId,
    displayName: name.slice(0, 24) || "Player",
    stack: table.settings.startingChips,
    isSittingOut: false,
    isConnected: true,
  };
  table.seats.push(seat);
  return { playerId };
}

/** If the player whose turn it currently is has disconnected, auto-fold them (and keep
 *  doing so for consecutive disconnected players) so the table never stalls waiting
 *  for someone who isn't there. */
function settleDisconnectedAutoActions(table: TableState): void {
  let guard = 0;
  while (table.currentHand && table.currentHand.street !== "complete" && guard++ < 100) {
    const actingSeatId = getActingSeatId(table);
    if (!actingSeatId) break;
    const seat = table.seats.find((s) => s.playerId === actingSeatId);
    if (!seat || seat.isConnected) break;
    forceFold(table, actingSeatId);
  }
}

// A brief network blip or backgrounded mobile tab shouldn't cost someone their hand —
// give a reconnecting player a grace period before actually auto-folding them.
const DISCONNECT_GRACE_MS = 20000;
const pendingDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

function disconnectTimerKey(gameId: string, playerId: string): string {
  return `${gameId}:${playerId}`;
}

function cancelPendingDisconnectFold(gameId: string, playerId: string): void {
  const key = disconnectTimerKey(gameId, playerId);
  const pending = pendingDisconnectTimers.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingDisconnectTimers.delete(key);
  }
}

/** Marks a player disconnected and, unless they reconnect within the grace period,
 *  auto-folds them if it's their turn. `onGraceExpired` lets the caller broadcast the
 *  updated state after the delayed fold actually happens. */
export function markDisconnected(gameId: string, playerId: string, onGraceExpired: () => void): void {
  const table = games.get(gameId);
  if (!table) return;
  const seat = table.seats.find((s) => s.playerId === playerId);
  if (!seat) return;
  seat.isConnected = false;

  cancelPendingDisconnectFold(gameId, playerId);
  const key = disconnectTimerKey(gameId, playerId);
  const timer = setTimeout(() => {
    pendingDisconnectTimers.delete(key);
    const latestTable = games.get(gameId);
    const latestSeat = latestTable?.seats.find((s) => s.playerId === playerId);
    if (!latestTable || !latestSeat || latestSeat.isConnected) return; // reconnected in time
    settleDisconnectedAutoActions(latestTable);
    onGraceExpired();
  }, DISCONNECT_GRACE_MS);
  pendingDisconnectTimers.set(key, timer);
}

export function startGame(gameId: string, requestingPlayerId: string): void {
  const table = games.get(gameId);
  if (!table) throw new PokerEngineError("Game not found");
  if (table.hostPlayerId !== requestingPlayerId) throw new PokerEngineError("Only the host can start the game");
  if (table.status !== "waiting") throw new PokerEngineError("The game has already started");
  if (!canStartHand(table)) throw new PokerEngineError("At least 2 players with chips are required to start");

  table.status = "in-progress";
  table.gameStartedAtMs = Date.now();
  startNextHand(table);
}

export function startNextHand(table: TableState): void {
  const level = getCurrentBlindLevel(table.blindSchedule, table.gameStartedAtMs ?? Date.now(), Date.now(), table.settings.minutesPerLevel);
  if (!canStartHand(table)) {
    table.status = "complete";
    return;
  }
  startHand(table, level.bigBlind, level.smallBlind);
  settleDisconnectedAutoActions(table);
}

/** Resets every seat back to the starting stack, restarts the blind schedule from
 *  level 0, and deals a fresh first hand — used to kick off a brand new round once a
 *  finished game's post-game pause has elapsed. */
export function restartGame(table: TableState): void {
  for (const seat of table.seats) {
    seat.stack = table.settings.startingChips;
    seat.isSittingOut = false;
  }
  table.dealerSeatIndex = -1;
  table.handNumber = 0;
  table.gameStartedAtMs = Date.now();
  table.status = "in-progress";
  table.currentHand = null;
  startNextHand(table);
}

interface LastActionInfo {
  type: PlayerAction["type"];
  seatId: string;
  seq: number;
}

const lastActions = new Map<string, LastActionInfo>();
const actionSeqCounters = new Map<string, number>();

export function submitAction(gameId: string, playerId: string, action: PlayerAction): void {
  const table = games.get(gameId);
  if (!table) throw new PokerEngineError("Game not found");
  applyPlayerAction(table, playerId, action);
  const seq = (actionSeqCounters.get(gameId) ?? 0) + 1;
  actionSeqCounters.set(gameId, seq);
  lastActions.set(gameId, { type: action.type, seatId: playerId, seq });
  settleDisconnectedAutoActions(table);
}

export function buildClientView(table: TableState, viewerPlayerId: string): ClientGameView {
  const hand = table.currentHand;
  const actingSeatId = getActingSeatId(table);
  const dealerSeatIndex = hand ? hand.dealerSeatIndex : table.dealerSeatIndex;

  const seats: ClientSeatView[] = table.seats.map((seat, index) => {
    const bettingPlayer = hand?.bettingState.players[index];
    const isMe = seat.playerId === viewerPlayerId;
    const showdownEntry = hand?.results?.find((r) => r.seatId === seat.seatId);
    const holeCardsForViewer = isMe ? hand?.holeCards.get(seat.seatId) : showdownEntry?.holeCards;

    return {
      seatId: seat.seatId,
      displayName: seat.displayName,
      stack: bettingPlayer ? bettingPlayer.stack : seat.stack,
      isSittingOut: seat.isSittingOut,
      isConnected: seat.isConnected,
      isDealer: index === dealerSeatIndex,
      isActing: seat.seatId === actingSeatId,
      betThisStreet: bettingPlayer?.betThisStreet ?? 0,
      hasFolded: bettingPlayer?.status === "folded",
      isAllIn: bettingPlayer?.status === "all-in",
      holeCards: holeCardsForViewer,
    };
  });

  const lastHandResults: ClientHandResult[] | null =
    hand?.street === "complete" && hand.results
      ? hand.results.map((r) => ({
          seatId: r.seatId,
          amountWon: r.amountWon,
          hand: r.hand ? { categoryLabel: HAND_CATEGORY_LABELS[r.hand.rank.category] } : undefined,
          holeCards: r.holeCards,
        }))
      : null;

  const currentBlindLevel = getCurrentBlindLevel(
    table.blindSchedule,
    table.gameStartedAtMs ?? Date.now(),
    Date.now(),
    table.settings.minutesPerLevel,
  );
  const msUntilNextBlindLevel = table.gameStartedAtMs
    ? getMsUntilNextLevel(table.blindSchedule, table.gameStartedAtMs, Date.now(), table.settings.minutesPerLevel)
    : null;

  return {
    gameId: table.gameId,
    status: table.status,
    hostPlayerId: table.hostPlayerId,
    viewerPlayerId,
    settings: table.settings,
    currentBlindLevel,
    msUntilNextBlindLevel,
    seats,
    communityCards: hand?.communityCards ?? [],
    pots: hand?.pots ?? [],
    street: hand?.street ?? "waiting",
    actingSeatId,
    legalActionsForViewer: getLegalActionsForSeat(table, viewerPlayerId),
    currentBetToMatch: hand?.bettingState.currentBetToMatch ?? 0,
    minRaiseIncrement: hand?.bettingState.minRaiseIncrement ?? table.settings.startingBigBlind,
    lastHandResults,
    handNumber: table.handNumber,
    lastAction: lastActions.get(table.gameId) ?? null,
  };
}
