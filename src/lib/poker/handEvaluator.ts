import { HandCategory } from "./types";
import type { Card, EvaluatedHand, Rank } from "./types";

function encodeScore(category: HandCategory, tiebreakers: Rank[]): number {
  let score = category;
  const padded = [...tiebreakers, 0, 0, 0, 0, 0].slice(0, 5);
  for (const r of padded) {
    score = score * 16 + r;
  }
  return score;
}

function makeResult(category: HandCategory, tiebreakers: Rank[], cards: Card[]): EvaluatedHand {
  return {
    rank: { category, tiebreakers },
    bestFive: cards,
    score: encodeScore(category, tiebreakers),
  };
}

/** Returns the high card rank of a straight within the given cards, or null. Handles the wheel (A-2-3-4-5, high=5). */
function detectStraight(ranks: Rank[]): Rank | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  const hasWheel = [14, 5, 4, 3, 2].every((r) => unique.includes(r as Rank));
  for (let i = 0; i + 4 < unique.length; i++) {
    if (unique[i] - unique[i + 4] === 4) {
      return unique[i];
    }
  }
  if (hasWheel) return 5;
  return null;
}

export function evaluate5(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) throw new Error("evaluate5 requires exactly 5 cards");
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  const straightHigh = detectStraight(ranks);

  const counts = new Map<Rank, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (isFlush && straightHigh !== null) {
    return makeResult(HandCategory.StraightFlush, [straightHigh], cards);
  }
  if (groups[0][1] === 4) {
    const kicker = groups[1][0];
    return makeResult(HandCategory.FourOfAKind, [groups[0][0], kicker], cards);
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return makeResult(HandCategory.FullHouse, [groups[0][0], groups[1][0]], cards);
  }
  if (isFlush) {
    return makeResult(HandCategory.Flush, ranks, cards);
  }
  if (straightHigh !== null) {
    return makeResult(HandCategory.Straight, [straightHigh], cards);
  }
  if (groups[0][1] === 3) {
    const kickers = groups
      .slice(1)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    return makeResult(HandCategory.ThreeOfAKind, [groups[0][0], ...kickers], cards);
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const [pairHi, pairLo] = [groups[0][0], groups[1][0]].sort((a, b) => b - a);
    const kicker = groups[2][0];
    return makeResult(HandCategory.TwoPair, [pairHi, pairLo, kicker], cards);
  }
  if (groups[0][1] === 2) {
    const kickers = groups
      .slice(1)
      .map((g) => g[0])
      .sort((a, b) => b - a);
    return makeResult(HandCategory.Pair, [groups[0][0], ...kickers], cards);
  }
  return makeResult(HandCategory.HighCard, ranks, cards);
}

function combinations5(cards: Card[]): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++)
            result.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
  return result;
}

/** Evaluates the best 5-card hand out of 5, 6, or 7 cards. */
export function evaluate7(cards: Card[]): EvaluatedHand {
  if (cards.length < 5) throw new Error("evaluate7 requires at least 5 cards");
  if (cards.length === 5) return evaluate5(cards);

  let best: EvaluatedHand | null = null;
  for (const combo of combinations5(cards)) {
    const evaluated = evaluate5(combo);
    if (!best || evaluated.score > best.score) best = evaluated;
  }
  return best as EvaluatedHand;
}

export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  return a.score - b.score;
}

/** Returns indices of the winning hand(s). Multiple indices means an exact tie (split pot). */
export function determineWinners(hands: EvaluatedHand[]): number[] {
  const maxScore = Math.max(...hands.map((h) => h.score));
  return hands.flatMap((h, i) => (h.score === maxScore ? [i] : []));
}
