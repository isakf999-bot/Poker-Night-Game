import { describe, expect, it } from "vitest";
import { applyAction, createBettingRound, isRoundComplete, legalActions } from "../bettingEngine";
import type { PlayerBettingState } from "../types";

function makePlayer(seatId: string, stack: number): PlayerBettingState {
  return { seatId, stack, status: "active", betThisStreet: 0, totalCommittedThisHand: 0, hasActedThisStreet: false };
}

describe("bettingEngine", () => {
  it("requires a full raise to be at least the previous raise increment", () => {
    const players = [makePlayer("A", 1000), makePlayer("B", 1000), makePlayer("C", 1000)];
    const state = createBettingRound("flop", players, 20, 0);
    applyAction(state, { type: "bet", amount: 100 }); // A bets 100, increment = 100
    const actions = legalActions(state); // B to act
    const raise = actions.find((a) => a.type === "raise")!;
    expect(raise.minAmount).toBe(200); // must raise to at least 100+100
  });

  it("a short all-in raise does not reopen betting for players who already acted", () => {
    const players2 = [makePlayer("A", 1000), makePlayer("B", 1000), makePlayer("C", 130)];
    const state2 = createBettingRound("flop", players2, 20, 0);
    applyAction(state2, { type: "bet", amount: 100 }); // A bets 100, increment 100, minRaiseIncrement=100
    applyAction(state2, { type: "call", amount: 100 }); // B calls
    // C raises all-in to 130 — increment is only 30, less than minRaiseIncrement(100) — short raise, doesn't reopen
    applyAction(state2, { type: "all-in", amount: 130 });
    expect(state2.minRaiseIncrement).toBe(100); // unchanged, short all-in didn't become the new standard
    expect(state2.players[0].hasActedThisStreet).toBe(true); // A already acted and should not be forced to act again as a "reopened" raise
    // currentBetToMatch should still rise to 130 so A/B must call the extra if they want in
    expect(state2.currentBetToMatch).toBe(130);
  });

  it("a full all-in raise (>= minRaiseIncrement) does reopen betting", () => {
    const players = [makePlayer("A", 1000), makePlayer("B", 1000), makePlayer("C", 300)];
    const state = createBettingRound("flop", players, 20, 0);
    applyAction(state, { type: "bet", amount: 100 }); // A bets 100, increment 100
    applyAction(state, { type: "call", amount: 100 }); // B calls
    applyAction(state, { type: "all-in", amount: 300 }); // C raises to 300, increment 200 >= 100: full raise
    expect(state.minRaiseIncrement).toBe(200);
    expect(state.players[0].hasActedThisStreet).toBe(false); // A must act again
    expect(state.players[1].hasActedThisStreet).toBe(false); // B must act again
  });

  it("gives the big blind the option to act even if everyone just calls", () => {
    const players = [makePlayer("UTG", 1000), makePlayer("SB", 990), makePlayer("BB", 980)];
    // preflop: SB posted 10, BB posted 20 already (simulate)
    players[1].betThisStreet = 10;
    players[1].totalCommittedThisHand = 10;
    players[2].betThisStreet = 20;
    players[2].totalCommittedThisHand = 20;
    players[1].hasActedThisStreet = false;
    players[2].hasActedThisStreet = false;
    const state = createBettingRound("preflop", players, 20, 0, 20);
    // restore the pre-posted bets that createBettingRound would not know about in a real flow
    state.players[1].betThisStreet = 10;
    state.players[2].betThisStreet = 20;

    applyAction(state, { type: "call", amount: 20 }); // UTG calls 20
    applyAction(state, { type: "call", amount: 20 }); // SB completes to 20
    expect(isRoundComplete(state)).toBe(false); // BB hasn't acted yet, even though all bets match
    applyAction(state, { type: "check" }); // BB takes the option
    expect(isRoundComplete(state)).toBe(true);
  });

  it("treats folding down to one player as a complete round", () => {
    const players = [makePlayer("A", 1000), makePlayer("B", 1000)];
    const state = createBettingRound("flop", players, 20, 0);
    applyAction(state, { type: "bet", amount: 100 });
    applyAction(state, { type: "fold" });
    expect(isRoundComplete(state)).toBe(true);
  });

  it("does NOT complete the round when an all-in leaves exactly one active player who hasn't matched it yet", () => {
    // Regression test: an all-in must not skip the remaining active player's chance to call or fold.
    const players = [makePlayer("A", 1000), makePlayer("B", 500)];
    const state = createBettingRound("flop", players, 20, 0);
    applyAction(state, { type: "all-in", amount: 500 }); // A goes all-in for 500; B (still "active") hasn't responded
    expect(isRoundComplete(state)).toBe(false);
    expect(state.actingSeatIndex).toBe(1); // B must act next

    applyAction(state, { type: "call" }); // B calls the all-in
    expect(isRoundComplete(state)).toBe(true);
  });

  it("lets the remaining active player fold to an all-in instead of forcing a showdown", () => {
    const players = [makePlayer("A", 1000), makePlayer("B", 500)];
    const state = createBettingRound("flop", players, 20, 0);
    applyAction(state, { type: "all-in", amount: 500 });
    applyAction(state, { type: "fold" });
    expect(state.players[1].status).toBe("folded");
  });
});
