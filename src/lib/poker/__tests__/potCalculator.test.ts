import { describe, expect, it } from "vitest";
import { calculatePots, distributePots, refundUncalledBet } from "../potCalculator";
import { evaluate7 } from "../handEvaluator";
import { cardFromString } from "../deck";
import type { PlayerBettingState, Seat } from "../types";

function makePlayer(seatId: string, totalCommitted: number, status: PlayerBettingState["status"] = "active"): PlayerBettingState {
  return { seatId, stack: 0, status, betThisStreet: 0, totalCommittedThisHand: totalCommitted, hasActedThisStreet: true };
}

function makeSeats(ids: string[]): Seat[] {
  return ids.map((id) => ({ seatId: id, playerId: id, displayName: id, stack: 0, isSittingOut: false, isConnected: true }));
}

describe("calculatePots", () => {
  it("builds main pot + side pots for a multi-way all-in with a folded contributor", () => {
    // A all-in 100, B all-in 300, C calls 500, D folds after contributing 50
    const players = [
      makePlayer("A", 100, "all-in"),
      makePlayer("B", 300, "all-in"),
      makePlayer("C", 500, "active"),
      makePlayer("D", 50, "folded"),
    ];
    const pots = calculatePots(players);

    const totalPotAmount = pots.reduce((sum, p) => sum + p.amount, 0);
    const totalContributed = players.reduce((sum, p) => sum + p.totalCommittedThisHand, 0);
    expect(totalPotAmount).toBe(totalContributed); // chip conservation

    // Layer 0-50 + 50-100 merge (same eligible set {A,B,C}) = 350 eligible {A,B,C}
    const mainPot = pots.find((p) => p.eligiblePlayerSeatIds.length === 3)!;
    expect(mainPot.amount).toBe(350);
    expect(new Set(mainPot.eligiblePlayerSeatIds)).toEqual(new Set(["A", "B", "C"]));

    // side pot: 100-300, eligible {B,C} = 2*200=400
    const sidePot1 = pots.find((p) => new Set(p.eligiblePlayerSeatIds).size === 2)!;
    expect(sidePot1.amount).toBe(400);

    // side pot: 300-500, eligible {C} only = 200, uncontested
    const sidePot2 = pots.find((p) => p.eligiblePlayerSeatIds.length === 1)!;
    expect(sidePot2.amount).toBe(200);
    expect(sidePot2.eligiblePlayerSeatIds).toEqual(["C"]);
  });

  it("conserves chips across many random all-in scenarios", () => {
    for (let trial = 0; trial < 50; trial++) {
      const n = 2 + Math.floor(Math.random() * 5);
      const players: PlayerBettingState[] = [];
      for (let i = 0; i < n; i++) {
        const committed = Math.floor(Math.random() * 1000);
        const status: PlayerBettingState["status"] = Math.random() < 0.3 ? "folded" : "active";
        players.push(makePlayer(`P${i}`, committed, status));
      }
      // At least one non-folded contributor must exist (an unwinnable all-folded pot is
      // not a reachable real-game state, so it's out of scope for this invariant check).
      if (!players.some((p) => p.status !== "folded" && p.totalCommittedThisHand > 0)) continue;
      const pots = calculatePots(players);
      const totalPotAmount = pots.reduce((sum, p) => sum + p.amount, 0);
      const totalContributed = players.reduce((sum, p) => sum + p.totalCommittedThisHand, 0);
      expect(totalPotAmount).toBe(totalContributed);
    }
  });
});

describe("refundUncalledBet", () => {
  it("refunds the excess of an uncalled bet to the bettor's stack", () => {
    const players = [makePlayer("A", 500), makePlayer("B", 200)];
    players[0].stack = 0;
    refundUncalledBet(players);
    expect(players[0].totalCommittedThisHand).toBe(200);
    expect(players[0].stack).toBe(300);
  });
});

describe("distributePots", () => {
  it("splits an exact tie evenly with the odd chip going to the seat left of the dealer", () => {
    const seats = makeSeats(["A", "B", "C"]);
    // A and B have the identical hand (tie), pot of 101 split between them
    const handA = evaluate7([cardFromString("2c"), cardFromString("3d"), cardFromString("4h"), cardFromString("5s"), cardFromString("6c"), cardFromString("9d"), cardFromString("Kh")]);
    const handB = evaluate7([cardFromString("2h"), cardFromString("3h"), cardFromString("4d"), cardFromString("5d"), cardFromString("6h"), cardFromString("9h"), cardFromString("Kc")]);
    const pots = [{ amount: 101, eligiblePlayerSeatIds: ["A", "B"], isMain: true }];
    const evaluatedHands = new Map([
      ["A", handA],
      ["B", handB],
    ]);
    // dealer is seat C (index 2); first winner left of dealer wrapping is A (index 0)
    const winnings = distributePots(pots, evaluatedHands, seats, 2);
    expect(winnings.get("A")! + winnings.get("B")!).toBe(101);
    expect(winnings.get("A")).toBe(51);
    expect(winnings.get("B")).toBe(50);
  });

  it("awards the full pot to a single winner", () => {
    const seats = makeSeats(["A", "B"]);
    const handA = evaluate7([cardFromString("Ah"), cardFromString("Ad"), cardFromString("Ac"), cardFromString("Kh"), cardFromString("Kd"), cardFromString("2c"), cardFromString("3d")]);
    const handB = evaluate7([cardFromString("2h"), cardFromString("2d"), cardFromString("3c"), cardFromString("3h"), cardFromString("4d"), cardFromString("5c"), cardFromString("9s")]);
    const pots = [{ amount: 500, eligiblePlayerSeatIds: ["A", "B"], isMain: true }];
    const evaluatedHands = new Map([
      ["A", handA],
      ["B", handB],
    ]);
    const winnings = distributePots(pots, evaluatedHands, seats, 0);
    expect(winnings.get("A")).toBe(500);
    expect(winnings.get("B")).toBeUndefined();
  });
});
