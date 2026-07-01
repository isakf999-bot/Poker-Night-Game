import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildClientView,
  createGame,
  ensureActionTimer,
  getActionDeadlineMs,
  getGame,
  hasUnrevealedCommunityCards,
  joinGame,
  markDisconnected,
  restartGame,
  revealNextCommunityCard,
  startGame,
  startNextHand,
  submitAction,
} from "../gameManager";
import { getActingSeatId, getLegalActionsForSeat } from "@/lib/poker/handOrchestrator";
import type { BlindScheduleConfig, TableState } from "@/lib/poker/types";

const SETTINGS: BlindScheduleConfig = {
  startingChips: 5000,
  startingBigBlind: 20,
  minutesPerLevel: 10,
  increaseMode: "fixed",
  increaseValue: 10,
  maxBigBlind: null,
};

function setUpTwoPlayerGame() {
  const { gameId, playerId: hostId } = createGame("Alice", SETTINGS);
  const { playerId: guestId } = joinGame(gameId, "Bob");
  startGame(gameId, hostId);
  return { gameId, hostId, guestId };
}

/** Drives the current actor to check if possible, otherwise call. */
function actPassively(table: TableState, gameId: string): void {
  const seatId = getActingSeatId(table)!;
  const actions = getLegalActionsForSeat(table, seatId);
  const action = actions.find((a) => a.type === "check") ?? actions.find((a) => a.type === "call");
  submitAction(gameId, seatId, { type: action!.type });
}

describe("connection-based hand eligibility", () => {
  it("excludes a disconnected seat from the next hand, and re-includes it after reconnecting", () => {
    const { gameId, playerId: hostId } = createGame("Alice", SETTINGS);
    const { playerId: bobId } = joinGame(gameId, "Bob");
    const { playerId: charlieId } = joinGame(gameId, "Charlie");
    startGame(gameId, hostId);
    const table = getGame(gameId)!;

    markDisconnected(gameId, bobId);
    table.currentHand = null;
    startNextHand(table);

    expect(table.status).toBe("in-progress"); // Alice + Charlie are still eligible
    const handAfterDisconnect = getGame(gameId)!.currentHand!;
    expect(handAfterDisconnect.holeCards.has(bobId)).toBe(false);
    expect(handAfterDisconnect.holeCards.has(hostId)).toBe(true);
    expect(handAfterDisconnect.holeCards.has(charlieId)).toBe(true);

    joinGame(gameId, "", bobId); // reconnect
    table.currentHand = null;
    startNextHand(table);
    const handAfterReconnect = getGame(gameId)!.currentHand!;
    expect(handAfterReconnect.holeCards.has(bobId)).toBe(true);
  });
});

describe("restartGame", () => {
  it("resets stacks and the dealer/blind schedule, then deals a fresh hand once the game is over", () => {
    const { gameId, hostId, guestId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;

    // Simulate the guest busting out entirely (host scoops all the chips).
    const hostSeat = table.seats.find((s) => s.playerId === hostId)!;
    const guestSeat = table.seats.find((s) => s.playerId === guestId)!;
    guestSeat.stack = 0;
    hostSeat.stack = SETTINGS.startingChips * 2;
    table.currentHand = null;
    startNextHand(table);
    expect(table.status).toBe("complete");

    restartGame(table);

    expect(table.status).toBe("in-progress");
    expect(table.handNumber).toBe(1);
    expect(table.currentHand).not.toBeNull();
    expect(hostSeat.stack).toBe(SETTINGS.startingChips);
    expect(guestSeat.stack).toBe(SETTINGS.startingChips);
  });
});

describe("ensureActionTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-acts (check/call, never fold) for the acting player once the timer expires", () => {
    const { gameId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;
    const actingSeatId = getActingSeatId(table)!;

    let timeouts = 0;
    ensureActionTimer(table, () => timeouts++);
    expect(getActingSeatId(table)).toBe(actingSeatId); // no action taken yet

    vi.advanceTimersByTime(20001);

    expect(timeouts).toBe(1);
    expect(getActingSeatId(table)).not.toBe(actingSeatId); // engine advanced past their turn
  });

  it("does not restart the countdown when called again mid-turn", () => {
    const { gameId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;

    ensureActionTimer(table, () => {});
    const firstDeadline = getActionDeadlineMs(gameId);

    vi.advanceTimersByTime(5000);
    ensureActionTimer(table, () => {}); // e.g. triggered by an unrelated broadcast
    expect(getActionDeadlineMs(gameId)).toBe(firstDeadline);
  });

  it("does not start a timer while the board still has unrevealed community cards", () => {
    const { gameId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;
    actPassively(table, gameId); // dealer/SB calls
    actPassively(table, gameId); // BB checks, closing preflop — 3 flop cards computed but not yet revealed
    expect(hasUnrevealedCommunityCards(table)).toBe(true);

    ensureActionTimer(table, () => {});
    expect(getActionDeadlineMs(gameId)).toBeNull();
  });
});

describe("staggered community card reveal", () => {
  it("reveals community cards one at a time instead of all at once", () => {
    const { gameId, hostId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;

    actPassively(table, gameId); // dealer/SB calls
    actPassively(table, gameId); // BB checks, closing preflop
    expect(table.currentHand?.street).toBe("flop");
    expect(table.currentHand?.communityCards).toHaveLength(3);

    expect(buildClientView(table, hostId).communityCards).toHaveLength(0);
    expect(hasUnrevealedCommunityCards(table)).toBe(true);

    revealNextCommunityCard(table);
    expect(buildClientView(table, hostId).communityCards).toHaveLength(1);

    revealNextCommunityCard(table);
    revealNextCommunityCard(table);
    expect(buildClientView(table, hostId).communityCards).toHaveLength(3);
    expect(hasUnrevealedCommunityCards(table)).toBe(false);
  });

  it("shows all-in showdown hole cards immediately but hides the win banner until the board catches up", () => {
    const { gameId, hostId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;

    const firstActor = getActingSeatId(table)!;
    submitAction(gameId, firstActor, { type: "all-in" });
    const secondActor = getActingSeatId(table)!;
    submitAction(gameId, secondActor, { type: "all-in" });

    expect(table.currentHand?.street).toBe("complete");
    expect(hasUnrevealedCommunityCards(table)).toBe(true); // engine resolved instantly, board not shown yet

    const midView = buildClientView(table, hostId);
    expect(midView.lastHandResults).toBeNull(); // banner withheld
    const opponentSeat = midView.seats.find((s) => s.seatId !== hostId)!;
    expect(opponentSeat.holeCards).toBeDefined(); // but hands are already face-up

    while (hasUnrevealedCommunityCards(table)) revealNextCommunityCard(table);
    const finalView = buildClientView(table, hostId);
    expect(finalView.lastHandResults).not.toBeNull();
  });
});
