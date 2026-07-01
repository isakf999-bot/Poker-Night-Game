import { describe, expect, it } from "vitest";
import { cardFromString } from "../deck";
import { compareHands, determineWinners, evaluate5, evaluate7 } from "../handEvaluator";
import { HandCategory } from "../types";

function cards(s: string) {
  return s.split(" ").map(cardFromString);
}

describe("evaluate5", () => {
  it("detects a royal flush as a straight flush", () => {
    const result = evaluate5(cards("Ah Kh Qh Jh Th"));
    expect(result.rank.category).toBe(HandCategory.StraightFlush);
    expect(result.rank.tiebreakers[0]).toBe(14);
  });

  it("detects the wheel straight (A-2-3-4-5) with high card 5, not 14", () => {
    const result = evaluate5(cards("Ah 2c 3d 4s 5h"));
    expect(result.rank.category).toBe(HandCategory.Straight);
    expect(result.rank.tiebreakers[0]).toBe(5);
  });

  it("ranks a wheel straight flush above quads but below a 6-high straight flush", () => {
    const wheelSF = evaluate5(cards("Ah 2h 3h 4h 5h"));
    const quads = evaluate5(cards("9s 9h 9d 9c Kd"));
    const sixHighSF = evaluate5(cards("2c 3c 4c 5c 6c"));
    expect(wheelSF.rank.category).toBe(HandCategory.StraightFlush);
    expect(compareHands(wheelSF, quads)).toBeGreaterThan(0);
    expect(compareHands(sixHighSF, wheelSF)).toBeGreaterThan(0);
  });

  it("does not misdetect a straight from a pair-containing 5-card hand", () => {
    const result = evaluate5(cards("7s 7h 6d 5c 4h"));
    expect(result.rank.category).toBe(HandCategory.Pair);
  });

  it("compares two-pair hands by higher pair, then lower pair, then kicker", () => {
    const aaKKq = evaluate5(cards("Ah Ad Kh Kd Qc"));
    const aaQQk = evaluate5(cards("Ah Ad Qh Qd Kc"));
    expect(compareHands(aaKKq, aaQQk)).toBeGreaterThan(0);
  });

  it("compares flushes by all 5 card ranks, not just the highest", () => {
    const higherFlush = evaluate5(cards("Ah Kh 9h 5h 2h"));
    const lowerFlush = evaluate5(cards("Ad Kd 9d 4d 3d"));
    expect(compareHands(higherFlush, lowerFlush)).toBeGreaterThan(0);
  });

  it("ranks full house above flush above straight", () => {
    const fullHouse = evaluate5(cards("2c 2d 2h 3s 3c"));
    const flush = evaluate5(cards("2h 5h 7h 9h Jh"));
    const straight = evaluate5(cards("4c 5d 6h 7s 8c"));
    expect(fullHouse.rank.category).toBe(HandCategory.FullHouse);
    expect(compareHands(fullHouse, flush)).toBeGreaterThan(0);
    expect(compareHands(flush, straight)).toBeGreaterThan(0);
  });
});

describe("evaluate7", () => {
  it("picks trips (not the second trips) for full house when 7 cards contain two sets of trips", () => {
    // AAA KKK 2: best hand must be AAA KK (trips over pair), not "KKK with pair of A"
    const result = evaluate7(cards("Ah Ad As Kh Kd Kc 2c"));
    expect(result.rank.category).toBe(HandCategory.FullHouse);
    expect(result.rank.tiebreakers).toEqual([14, 13]);
  });

  it("uses the best 5 of 7 cards, ignoring worse kickers", () => {
    const result = evaluate7(cards("Ah Ad 2c 3d 7h 9s Kc"));
    expect(result.rank.category).toBe(HandCategory.Pair);
    expect(result.rank.tiebreakers[0]).toBe(14);
    expect(result.rank.tiebreakers.slice(1)).toEqual([13, 9, 7]); // best 3 kickers: K, 9, 7 (not the 2 or 3)
  });

  it("finds a straight using community cards only (playing the board)", () => {
    const result = evaluate7(cards("2c 7d 5h 6s 7h 8c 9d"));
    expect(result.rank.category).toBe(HandCategory.Straight);
    expect(result.rank.tiebreakers[0]).toBe(9);
  });
});

describe("determineWinners", () => {
  it("detects an exact tie for split pots", () => {
    const handA = evaluate7(cards("2c 3d 4h 5s 6c 9d Kh"));
    const handB = evaluate7(cards("2h 3h 4d 5d 6h 9h Kc"));
    expect(handA.score).toBe(handB.score);
    expect(determineWinners([handA, handB])).toEqual([0, 1]);
  });

  it("returns a single winner when hands differ", () => {
    const winner = evaluate7(cards("Ah Ad Ac Kh Kd 2c 3d"));
    const loser = evaluate7(cards("2h 2d 3c 3h 4d 5c 9s"));
    expect(determineWinners([winner, loser])).toEqual([0]);
  });
});
