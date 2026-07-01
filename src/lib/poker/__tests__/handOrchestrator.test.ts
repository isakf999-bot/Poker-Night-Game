import { describe, expect, it } from "vitest";
import { getActingSeatId, getLegalActionsForSeat, applyPlayerAction, canStartHand, startHand } from "../handOrchestrator";
import type { Seat, TableState } from "../types";

function makeSeats(ids: string[], stack = 5000): Seat[] {
  return ids.map((id) => ({ seatId: id, playerId: id, displayName: id, stack, isSittingOut: false, isConnected: true }));
}

function makeTable(seatIds: string[], stack = 5000): TableState {
  return {
    gameId: "g1",
    hostPlayerId: seatIds[0],
    settings: {
      startingChips: stack,
      startingBigBlind: 20,
      minutesPerLevel: 10,
      increaseMode: "fixed",
      increaseValue: 10,
      maxBigBlind: null,
    },
    blindSchedule: [],
    gameStartedAtMs: null,
    seats: makeSeats(seatIds, stack),
    dealerSeatIndex: -1,
    handNumber: 0,
    status: "in-progress",
    currentHand: null,
  };
}

// Deterministic "no swap" shuffle so tests are reproducible.
const noShuffle = () => 0;

function playPassiveHandToCompletion(table: TableState): void {
  let guard = 0;
  while (table.currentHand && table.currentHand.street !== "complete") {
    if (guard++ > 10000) throw new Error("infinite loop guard tripped");
    const seatId = getActingSeatId(table);
    if (!seatId) break;
    const actions = getLegalActionsForSeat(table, seatId);
    const action = actions.find((a) => a.type === "check") ?? actions.find((a) => a.type === "call");
    if (!action) throw new Error("no passive action available");
    applyPlayerAction(table, seatId, { type: action.type });
  }
}

describe("startHand", () => {
  it("requires at least 2 players with chips", () => {
    const table = makeTable(["A"]);
    expect(canStartHand(table)).toBe(false);
  });

  it("posts blinds and deals two hole cards to every active seat", () => {
    const table = makeTable(["A", "B", "C"]);
    const hand = startHand(table, 20, 10, noShuffle);
    expect(hand.holeCards.size).toBe(3);
    for (const cards of hand.holeCards.values()) expect(cards).toHaveLength(2);
    const totalCommitted = hand.bettingState.players.reduce((s, p) => s + p.totalCommittedThisHand, 0);
    expect(totalCommitted).toBe(30); // 10 SB + 20 BB, nothing else posted yet
  });

  it("rotates the dealer button to the next eligible seat each hand", () => {
    const table = makeTable(["A", "B", "C"]);
    startHand(table, 20, 10, noShuffle);
    const firstDealer = table.dealerSeatIndex;
    playPassiveHandToCompletion(table);
    startHand(table, 20, 10, noShuffle);
    const secondDealer = table.dealerSeatIndex;
    expect(secondDealer).toBe((firstDealer + 1) % 3);
  });

  it("heads-up: dealer is the small blind and acts first preflop", () => {
    const table = makeTable(["A", "B"]);
    const hand = startHand(table, 20, 10, noShuffle);
    expect(hand.smallBlindSeatIndex).toBe(hand.dealerSeatIndex);
    expect(getActingSeatId(table)).toBe(table.seats[hand.dealerSeatIndex].seatId);
  });

  it("house rule: whoever acts first preflop (under the gun) also acts first on every later street", () => {
    const table = makeTable(["A", "B", "C"]);
    const hand = startHand(table, 20, 10, noShuffle);
    const utgSeatId = table.seats[hand.firstToActSeatIndex].seatId;
    expect(getActingSeatId(table)).toBe(utgSeatId);

    // Everyone checks/calls through to the flop — UTG should be acting again, not the small blind.
    applyPlayerAction(table, getActingSeatId(table)!, { type: "call" });
    applyPlayerAction(table, getActingSeatId(table)!, { type: "call" });
    applyPlayerAction(table, getActingSeatId(table)!, { type: "check" });

    expect(table.currentHand!.street).toBe("flop");
    expect(getActingSeatId(table)).toBe(utgSeatId);
  });

  it("ends the hand immediately without showdown when all but one player folds", () => {
    const table = makeTable(["A", "B", "C"]);
    const totalBefore = table.seats.reduce((s, seat) => s + seat.stack, 0);
    startHand(table, 20, 10, noShuffle);

    applyPlayerAction(table, getActingSeatId(table)!, { type: "fold" });
    applyPlayerAction(table, getActingSeatId(table)!, { type: "fold" });

    expect(table.currentHand!.street).toBe("complete");
    expect(table.currentHand!.results).toHaveLength(1);

    const totalAfter = table.seats.reduce((s, seat) => s + seat.stack, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it("conserves total chips across a fully played-out hand (preflop through river showdown)", () => {
    const table = makeTable(["A", "B", "C"], 5000);
    const totalBefore = table.seats.reduce((s, seat) => s + seat.stack, 0);
    startHand(table, 20, 10, noShuffle);
    playPassiveHandToCompletion(table);
    expect(table.currentHand!.street).toBe("complete");
    const totalAfter = table.seats.reduce((s, seat) => s + seat.stack, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it("does not skip the other player's call/fold decision when someone goes all-in for less than their stack", () => {
    const table = makeTable(["A", "B"], 5000);
    table.seats[1].stack = 2500; // B has less than A
    startHand(table, 20, 10, noShuffle);
    // Preflop: dealer/SB (A) calls, BB (B) checks to reach the flop.
    applyPlayerAction(table, getActingSeatId(table)!, { type: "call" });
    applyPlayerAction(table, getActingSeatId(table)!, { type: "check" });
    expect(table.currentHand!.street).toBe("flop");

    // On the flop, A shoves all-in for less than B's remaining stack.
    const shover = getActingSeatId(table)!;
    applyPlayerAction(table, shover, { type: "all-in" });

    // The hand must NOT jump straight to showdown — B still needs to decide.
    expect(table.currentHand!.street).toBe("flop");
    expect(table.currentHand!.results).toBeUndefined();
    const responder = getActingSeatId(table);
    expect(responder).not.toBeNull();
    expect(responder).not.toBe(shover);
    const actions = getLegalActionsForSeat(table, responder!);
    expect(actions.some((a) => a.type === "fold")).toBe(true);
    expect(actions.some((a) => a.type === "call")).toBe(true);
  });

  it("refunds the uncalled excess so nobody can win more than 2x their all-in amount", () => {
    // A shoves all-in for 2500 total; B shoves all-in for 2600 total (100 more than A can ever match).
    // That extra 100 was never at risk and must come straight back to B regardless of the showdown result.
    const table = makeTable(["A", "B"], 5000);
    table.seats[0].stack = 2500;
    table.seats[1].stack = 2600;
    const totalBefore = table.seats.reduce((s, seat) => s + seat.stack, 0);
    startHand(table, 20, 10, noShuffle);
    applyPlayerAction(table, getActingSeatId(table)!, { type: "call" });
    applyPlayerAction(table, getActingSeatId(table)!, { type: "check" });

    const shover = getActingSeatId(table)!; // A, all-in for their remaining 2480 on the flop
    applyPlayerAction(table, shover, { type: "all-in" });
    const responder = getActingSeatId(table)!; // B, also shoves all-in (2580 remaining) rather than just calling
    applyPlayerAction(table, responder, { type: "all-in" });

    expect(table.currentHand!.street).toBe("complete");
    const totalAfter = table.seats.reduce((s, seat) => s + seat.stack, 0);
    expect(totalAfter).toBe(totalBefore); // no chips created or destroyed

    const results = table.currentHand!.results!;
    const totalWon = results.reduce((s, r) => s + r.amountWon, 0);
    expect(totalWon).toBe(5000); // the full 2500+2500 main pot; the extra 100 was refunded, not won
  });

  it("allows a short-stacked player to post an all-in blind below the full blind amount", () => {
    const table = makeTable(["A", "B", "C"], 5000);
    table.seats[1].stack = 5; // will be the small blind, short-stacked
    const hand = startHand(table, 20, 10, noShuffle);
    const sbPlayer = hand.bettingState.players[hand.smallBlindSeatIndex];
    expect(sbPlayer.totalCommittedThisHand).toBe(5);
    expect(sbPlayer.status).toBe("all-in");
  });
});
