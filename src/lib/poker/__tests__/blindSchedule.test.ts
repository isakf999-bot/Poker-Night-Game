import { describe, expect, it } from "vitest";
import { buildBlindSchedule, getCurrentBlindLevel, getMsUntilNextLevel } from "../blindSchedule";

describe("buildBlindSchedule", () => {
  it("increases by a fixed amount each level", () => {
    const schedule = buildBlindSchedule({
      startingChips: 5000,
      startingBigBlind: 100,
      minutesPerLevel: 10,
      increaseMode: "fixed",
      increaseValue: 50,
      maxBigBlind: null,
    });
    expect(schedule[0].bigBlind).toBe(100);
    expect(schedule[1].bigBlind).toBe(150);
    expect(schedule[2].bigBlind).toBe(200);
  });

  it("freezes at the max big blind cap and stops generating further levels", () => {
    const schedule = buildBlindSchedule({
      startingChips: 5000,
      startingBigBlind: 100,
      minutesPerLevel: 10,
      increaseMode: "fixed",
      increaseValue: 50,
      maxBigBlind: 200,
    });
    const last = schedule[schedule.length - 1];
    expect(last.bigBlind).toBe(200);
    expect(schedule.every((l) => l.bigBlind <= 200)).toBe(true);
  });

  it("doubles the big blind each level in double mode", () => {
    const schedule = buildBlindSchedule({
      startingChips: 5000,
      startingBigBlind: 20,
      minutesPerLevel: 10,
      increaseMode: "double",
      increaseValue: 0,
      maxBigBlind: null,
    });
    expect(schedule[0].bigBlind).toBe(20);
    expect(schedule[1].bigBlind).toBe(40);
    expect(schedule[2].bigBlind).toBe(80);
    expect(schedule[3].bigBlind).toBe(160);
  });

  it("doubles up to and freezes at the max big blind cap", () => {
    const schedule = buildBlindSchedule({
      startingChips: 5000,
      startingBigBlind: 20,
      minutesPerLevel: 10,
      increaseMode: "double",
      increaseValue: 0,
      maxBigBlind: 1000,
    });
    const last = schedule[schedule.length - 1];
    expect(last.bigBlind).toBe(1000);
    expect(schedule.every((l) => l.bigBlind <= 1000)).toBe(true);
  });
});

describe("getCurrentBlindLevel", () => {
  it("returns the correct level based on elapsed time and clamps at the cap", () => {
    const schedule = buildBlindSchedule({
      startingChips: 5000,
      startingBigBlind: 100,
      minutesPerLevel: 10,
      increaseMode: "fixed",
      increaseValue: 50,
      maxBigBlind: 200,
    });
    const start = 0;
    expect(getCurrentBlindLevel(schedule, start, start, 10).bigBlind).toBe(100);
    expect(getCurrentBlindLevel(schedule, start, start + 10 * 60000, 10).bigBlind).toBe(150);
    expect(getCurrentBlindLevel(schedule, start, start + 999 * 60000, 10).bigBlind).toBe(200); // way past cap, stays frozen
  });

  it("reports null msUntilNextLevel once the schedule is capped", () => {
    const schedule = buildBlindSchedule({
      startingChips: 5000,
      startingBigBlind: 190,
      minutesPerLevel: 10,
      increaseMode: "fixed",
      increaseValue: 50,
      maxBigBlind: 200,
    });
    const start = 0;
    expect(getMsUntilNextLevel(schedule, start, start + 999 * 60000, 10)).toBeNull();
  });
});
