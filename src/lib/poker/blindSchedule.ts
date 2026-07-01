import type { BlindLevel, BlindScheduleConfig } from "./types";

function roundBlind(n: number): number {
  if (n < 10) return Math.max(1, Math.round(n));
  return Math.round(n / 5) * 5;
}

export function buildBlindSchedule(config: BlindScheduleConfig, maxLevels = 200): BlindLevel[] {
  const levels: BlindLevel[] = [];
  let bb = config.startingBigBlind;
  for (let level = 0; level < maxLevels; level++) {
    const cappedBB = config.maxBigBlind != null ? Math.min(bb, config.maxBigBlind) : bb;
    levels.push({ level, smallBlind: roundBlind(cappedBB / 2), bigBlind: roundBlind(cappedBB) });
    if (config.maxBigBlind != null && cappedBB >= config.maxBigBlind) break;
    bb = config.increaseMode === "fixed" ? bb + config.increaseValue : bb * 2;
  }
  return levels;
}

export function getCurrentBlindLevel(
  schedule: BlindLevel[],
  gameStartedAtMs: number,
  nowMs: number,
  minutesPerLevel: number,
): BlindLevel {
  const elapsedMinutes = (nowMs - gameStartedAtMs) / 60000;
  const levelIndex = Math.min(Math.max(0, Math.floor(elapsedMinutes / minutesPerLevel)), schedule.length - 1);
  return schedule[levelIndex];
}

export function getMsUntilNextLevel(
  schedule: BlindLevel[],
  gameStartedAtMs: number,
  nowMs: number,
  minutesPerLevel: number,
): number | null {
  const current = getCurrentBlindLevel(schedule, gameStartedAtMs, nowMs, minutesPerLevel);
  if (current.level >= schedule.length - 1) return null; // capped, no more increases
  const nextLevelStartMs = gameStartedAtMs + (current.level + 1) * minutesPerLevel * 60000;
  return Math.max(0, nextLevelStartMs - nowMs);
}
