import { buildDeck, secureRandomInt, type RandIntFn } from "./deck";
import { evaluate7 } from "./handEvaluator";
import type { Card } from "./types";

export interface EquityInput {
  seatId: string;
  holeCards: [Card, Card];
}

export interface EquityResult {
  seatId: string;
  /** Expected share of the pot (0-100), with fractional credit for chopped pots. */
  equityPercent: number;
}

// Above this many possible remaining boards, exact enumeration gets too slow to run
// on every card reveal, so we fall back to Monte Carlo sampling instead.
const EXACT_ENUMERATION_MAX_COMBINATIONS = 2500;
const MONTE_CARLO_SAMPLES = 3000;

function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

function combinationsCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

function* kCombinations<T>(items: T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= items.length - k; i++) {
    for (const rest of kCombinations(items.slice(i + 1), k - 1)) {
      yield [items[i], ...rest];
    }
  }
}

function tallyBoard(inputs: EquityInput[], board: Card[], equitySum: Map<string, number>): void {
  const scores = inputs.map((p) => ({ seatId: p.seatId, score: evaluate7([...p.holeCards, ...board]).score }));
  const maxScore = Math.max(...scores.map((s) => s.score));
  const winners = scores.filter((s) => s.score === maxScore);
  const share = 1 / winners.length;
  for (const w of winners) equitySum.set(w.seatId, (equitySum.get(w.seatId) ?? 0) + share);
}

/** Estimates each player's expected share of the pot given known hole cards and
 *  however many community cards have been revealed so far (0 to 5). Uses exact
 *  enumeration over all possible remaining boards when that's small enough (e.g. with
 *  just the turn and river left to come), and falls back to Monte Carlo sampling when
 *  there are many unknowns (e.g. right after an all-in preflop). */
export function calculateEquity(
  inputs: EquityInput[],
  knownCommunityCards: Card[],
  randInt: RandIntFn = secureRandomInt,
): EquityResult[] {
  const slotsNeeded = 5 - knownCommunityCards.length;
  const equitySum = new Map<string, number>();
  for (const p of inputs) equitySum.set(p.seatId, 0);

  if (slotsNeeded <= 0) {
    tallyBoard(inputs, knownCommunityCards, equitySum);
    return inputs.map((p) => ({ seatId: p.seatId, equityPercent: 100 * (equitySum.get(p.seatId) ?? 0) }));
  }

  const usedKeys = new Set<string>();
  for (const p of inputs) for (const c of p.holeCards) usedKeys.add(cardKey(c));
  for (const c of knownCommunityCards) usedKeys.add(cardKey(c));
  const remainingDeck = buildDeck().filter((c) => !usedKeys.has(cardKey(c)));

  let total = 0;
  if (combinationsCount(remainingDeck.length, slotsNeeded) <= EXACT_ENUMERATION_MAX_COMBINATIONS) {
    for (const combo of kCombinations(remainingDeck, slotsNeeded)) {
      tallyBoard(inputs, [...knownCommunityCards, ...combo], equitySum);
      total++;
    }
  } else {
    for (let sample = 0; sample < MONTE_CARLO_SAMPLES; sample++) {
      const pool = [...remainingDeck];
      const drawn: Card[] = [];
      for (let i = 0; i < slotsNeeded; i++) {
        const idx = randInt(pool.length);
        drawn.push(pool[idx]);
        pool.splice(idx, 1);
      }
      tallyBoard(inputs, [...knownCommunityCards, ...drawn], equitySum);
      total++;
    }
  }

  return inputs.map((p) => ({ seatId: p.seatId, equityPercent: (100 * (equitySum.get(p.seatId) ?? 0)) / total }));
}
