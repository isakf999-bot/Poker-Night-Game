import { randomBytes, randomUUID } from "crypto";
import { buildBlindSchedule, getCurrentBlindLevel, getMsUntilNextLevel } from "@/lib/poker/blindSchedule";
import { calculateEquity, type EquityResult } from "@/lib/poker/equity";
import { HAND_CATEGORY_LABELS } from "@/lib/poker/handLabels";
import { applyPlayerAction, canStartHand, getActingSeatId, getLegalActionsForSeat, startHand } from "@/lib/poker/handOrchestrator";
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

/** A disconnected seat stays visible at the table (so it can rejoin later) but is
 *  excluded from being dealt into new hands — no blinds, no cards — until it
 *  reconnects. Mid-hand, the general action timer covers them via auto-call/check. */
export function markDisconnected(gameId: string, playerId: string): void {
  const table = games.get(gameId);
  if (!table) return;
  const seat = table.seats.find((s) => s.playerId === playerId);
  if (!seat) return;
  seat.isConnected = false;
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
}

// --- Staggered community-card reveal -----------------------------------------------
//
// The hand engine computes an entire hand (including an all-in run-out to showdown)
// instantly and synchronously. To make the board feel like it's being dealt one card
// at a time instead of dumped on screen all at once, we hold back how many of the
// engine's already-computed community cards are shown to clients, and reveal one more
// every REVEAL_STEP_MS via `revealNextCommunityCard` (driven by the socket layer).

interface RevealProgress {
  revealedCommunityCount: number;
  handNumberForReveal: number;
}
const revealProgress = new Map<string, RevealProgress>();

function getRevealProgress(table: TableState): RevealProgress {
  let progress = revealProgress.get(table.gameId);
  if (!progress || progress.handNumberForReveal !== table.handNumber) {
    progress = { revealedCommunityCount: 0, handNumberForReveal: table.handNumber };
    revealProgress.set(table.gameId, progress);
  }
  return progress;
}

function visibleCommunityCount(table: TableState): number {
  const hand = table.currentHand;
  if (!hand) return 0;
  return Math.min(getRevealProgress(table).revealedCommunityCount, hand.communityCards.length);
}

/** True while there are more community cards already computed than shown to clients. */
export function hasUnrevealedCommunityCards(table: TableState): boolean {
  const hand = table.currentHand;
  if (!hand) return false;
  return visibleCommunityCount(table) < hand.communityCards.length;
}

/** Reveals one more community card to clients. */
export function revealNextCommunityCard(table: TableState): void {
  const progress = getRevealProgress(table);
  progress.revealedCommunityCount += 1;
}

// --- Per-turn action timer -----------------------------------------------------------
//
// Whoever's turn it is gets ACTION_TIMER_MS to act (this covers both a disconnected
// player, who can never act, and someone simply thinking too long). On expiry we act
// on their behalf with the most passive legal option — call if there's a bet to match,
// otherwise check — never fold, so a brief absence doesn't cost anyone their hand.

const ACTION_TIMER_MS = 20000;

interface ActionTimerState {
  seatId: string;
  deadlineMs: number;
  timer: ReturnType<typeof setTimeout>;
}
const actionTimers = new Map<string, ActionTimerState>();

function clearActionTimer(gameId: string): void {
  const existing = actionTimers.get(gameId);
  if (existing) {
    clearTimeout(existing.timer);
    actionTimers.delete(gameId);
  }
}

function computeTimeoutAction(table: TableState, seatId: string): PlayerAction {
  const actions = getLegalActionsForSeat(table, seatId);
  if (actions.some((a) => a.type === "check")) return { type: "check" };
  if (actions.some((a) => a.type === "call")) return { type: "call" };
  return { type: "fold" }; // only reachable if neither check nor call is legal
}

/** Makes sure a timer is ticking for whoever's turn it currently is. No-ops if a timer
 *  for that exact seat/turn is already running, or if the board is still mid-reveal
 *  (the action bar is hidden client-side until the reveal animation catches up). */
export function ensureActionTimer(table: TableState, onTimeout: () => void): void {
  if (hasUnrevealedCommunityCards(table)) return;

  const actingSeatId = getActingSeatId(table);
  if (!actingSeatId) {
    clearActionTimer(table.gameId);
    return;
  }

  const existing = actionTimers.get(table.gameId);
  if (existing && existing.seatId === actingSeatId) return;

  clearActionTimer(table.gameId);
  const deadlineMs = Date.now() + ACTION_TIMER_MS;
  const timer = setTimeout(() => {
    actionTimers.delete(table.gameId);
    const latest = games.get(table.gameId);
    if (!latest || getActingSeatId(latest) !== actingSeatId) return;
    try {
      applyPlayerAction(latest, actingSeatId, computeTimeoutAction(latest, actingSeatId));
    } catch {
      // Best-effort: if state shifted underneath us, just skip this tick.
    }
    onTimeout();
  }, ACTION_TIMER_MS);
  actionTimers.set(table.gameId, { seatId: actingSeatId, deadlineMs, timer });
}

export function getActionDeadlineMs(gameId: string): number | null {
  return actionTimers.get(gameId)?.deadlineMs ?? null;
}

// --- Win-probability (equity) during an all-in showdown -----------------------------
//
// Once a showdown has genuinely happened (2+ players reached results with hole cards
// shown), everyone's expected share of the pot is public information — recompute it
// each time another community card is revealed, caching per (hand, revealed count) so
// a burst of redundant broadcasts doesn't repeat the same expensive calculation.

interface EquityCacheEntry {
  handNumber: number;
  revealedCount: number;
  result: EquityResult[];
}
const equityCache = new Map<string, EquityCacheEntry>();

function getEquitySnapshot(table: TableState): EquityResult[] | null {
  const hand = table.currentHand;
  if (!hand?.results) return null;
  const participants = hand.results.filter((r) => r.holeCards != null);
  if (participants.length < 2) return null; // a fold-win has nothing to compare

  const revealedCount = visibleCommunityCount(table);
  const cached = equityCache.get(table.gameId);
  if (cached && cached.handNumber === table.handNumber && cached.revealedCount === revealedCount) {
    return cached.result;
  }

  const knownCommunity = hand.communityCards.slice(0, revealedCount);
  const result = calculateEquity(
    participants.map((p) => ({ seatId: p.seatId, holeCards: p.holeCards! })),
    knownCommunity,
  );
  equityCache.set(table.gameId, { handNumber: table.handNumber, revealedCount, result });
  return result;
}

export function buildClientView(table: TableState, viewerPlayerId: string): ClientGameView {
  const hand = table.currentHand;
  const actingSeatId = getActingSeatId(table);
  const dealerSeatIndex = hand ? hand.dealerSeatIndex : table.dealerSeatIndex;
  const revealedCount = visibleCommunityCount(table);
  const boardFullyRevealed = !hand || revealedCount >= hand.communityCards.length;

  const seats: ClientSeatView[] = table.seats.map((seat, index) => {
    const bettingPlayer = hand?.bettingState.players[index];
    const isMe = seat.playerId === viewerPlayerId;
    const showdownEntry = hand?.results?.find((r) => r.seatId === seat.seatId);
    // Showdown hole cards are revealed as soon as they're computed, even before the
    // board finishes dealing out and before the win banner appears — cards go face up
    // first, then the remaining community cards land one by one, then the result shows.
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
    hand?.street === "complete" && hand.results && boardFullyRevealed
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
    communityCards: hand ? hand.communityCards.slice(0, revealedCount) : [],
    pots: hand?.pots ?? [],
    street: hand?.street ?? "waiting",
    actingSeatId,
    legalActionsForViewer: boardFullyRevealed ? getLegalActionsForSeat(table, viewerPlayerId) : [],
    currentBetToMatch: hand?.bettingState.currentBetToMatch ?? 0,
    minRaiseIncrement: hand?.bettingState.minRaiseIncrement ?? table.settings.startingBigBlind,
    lastHandResults,
    handNumber: table.handNumber,
    lastAction: lastActions.get(table.gameId) ?? null,
    actionDeadlineMs: getActionDeadlineMs(table.gameId),
    equity: boardFullyRevealed ? null : getEquitySnapshot(table),
  };
}
