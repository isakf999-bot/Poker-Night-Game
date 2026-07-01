import { describe, expect, it } from "vitest";
import { calculateEquity } from "../equity";
import { cardFromString } from "../deck";

function cards(s: string) {
  return s.split(" ").map(cardFromString);
}

describe("calculateEquity", () => {
  it("gives the outright winner 100% and everyone else 0% once the board is complete", () => {
    const result = calculateEquity(
      [
        { seatId: "A", holeCards: cards("Ah Ad") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
        { seatId: "B", holeCards: cards("2c 3d") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
      ],
      cards("Ks Kd 7h 4s 9c"), // A has aces up, B has nothing — fully determined
    );
    const a = result.find((r) => r.seatId === "A")!;
    const b = result.find((r) => r.seatId === "B")!;
    expect(a.equityPercent).toBeCloseTo(100, 5);
    expect(b.equityPercent).toBeCloseTo(0, 5);
  });

  it("splits equity 50/50 for an exact tie on a complete board", () => {
    const result = calculateEquity(
      [
        { seatId: "A", holeCards: cards("2c 3d") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
        { seatId: "B", holeCards: cards("2h 3h") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
      ],
      cards("Ah Kh Qh Jh Th"), // both play the same royal-flush-on-board tie
    );
    for (const r of result) expect(r.equityPercent).toBeCloseTo(50, 5);
  });

  it("uses exact enumeration on the flop (2 cards to come) and favors the clearly better hand", () => {
    const result = calculateEquity(
      [
        // A already has a straight; B only has a gutshot draw plus a pair.
        { seatId: "A", holeCards: cards("6c 7d") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
        { seatId: "B", holeCards: cards("9h 9s") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
      ],
      cards("8c 9d 5h"),
    );
    const a = result.find((r) => r.seatId === "A")!;
    const b = result.find((r) => r.seatId === "B")!;
    expect(a.equityPercent).toBeGreaterThan(b.equityPercent);
    expect(a.equityPercent + b.equityPercent).toBeCloseTo(100, 5);
  });

  it("falls back to Monte Carlo preflop and still favors pocket aces heavily over pocket deuces", () => {
    const result = calculateEquity(
      [
        { seatId: "A", holeCards: cards("Ah Ad") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
        { seatId: "B", holeCards: cards("2c 2d") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
      ],
      [],
    );
    const a = result.find((r) => r.seatId === "A")!;
    const b = result.find((r) => r.seatId === "B")!;
    // AA vs 22 is roughly an 80/20 favorite in reality; leave generous slack for sampling noise.
    expect(a.equityPercent).toBeGreaterThan(65);
    expect(a.equityPercent + b.equityPercent).toBeCloseTo(100, 0);
  });

  it("supports 3+ way all-ins and sums to ~100 across all players", () => {
    const result = calculateEquity(
      [
        { seatId: "A", holeCards: cards("Ah Kh") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
        { seatId: "B", holeCards: cards("Qs Qd") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
        { seatId: "C", holeCards: cards("7c 2d") as [ReturnType<typeof cardFromString>, ReturnType<typeof cardFromString>] },
      ],
      cards("Kc 9h 2h"),
    );
    expect(result).toHaveLength(3);
    const total = result.reduce((sum, r) => sum + r.equityPercent, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(result.every((r) => r.equityPercent >= 0)).toBe(true);
  });
});
