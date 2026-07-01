import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, getGame, joinGame, markDisconnected, startGame } from "../gameManager";
import { getActingSeatId } from "@/lib/poker/handOrchestrator";
import type { BlindScheduleConfig } from "@/lib/poker/types";

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

describe("disconnect grace period", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fold the acting player immediately on disconnect", () => {
    const { gameId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;
    const actingSeatId = getActingSeatId(table)!;

    let graceExpired = 0;
    markDisconnected(gameId, actingSeatId, () => graceExpired++);

    expect(getActingSeatId(table)).toBe(actingSeatId); // still their turn, not folded yet
    expect(graceExpired).toBe(0);
  });

  it("cancels the pending fold if the player reconnects within the grace period", () => {
    const { gameId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;
    const actingSeatId = getActingSeatId(table)!;

    let graceExpired = 0;
    markDisconnected(gameId, actingSeatId, () => graceExpired++);

    vi.advanceTimersByTime(10000); // well under the grace period
    joinGame(gameId, "", actingSeatId); // reconnect

    vi.advanceTimersByTime(60000); // now run well past the original grace period
    expect(graceExpired).toBe(0);
    expect(getActingSeatId(table)).toBe(actingSeatId); // never got auto-folded
  });

  it("auto-folds the acting player once the grace period elapses without reconnecting", () => {
    const { gameId } = setUpTwoPlayerGame();
    const table = getGame(gameId)!;
    const actingSeatId = getActingSeatId(table)!;

    let graceExpired = 0;
    markDisconnected(gameId, actingSeatId, () => graceExpired++);

    vi.advanceTimersByTime(20001);

    expect(graceExpired).toBe(1);
    // The hand should have ended immediately in the other player's favor (heads-up fold).
    expect(table.currentHand?.street).toBe("complete");
  });
});
