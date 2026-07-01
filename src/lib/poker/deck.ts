import { randomInt } from "crypto";
import type { Card, Rank, Suit } from "./types";

const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const SUITS: Suit[] = ["c", "d", "h", "s"];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Returns a random integer in [0, max). Injectable for deterministic tests. */
export type RandIntFn = (max: number) => number;

export function secureRandomInt(max: number): number {
  return randomInt(max);
}

export function shuffledDeck(randInt: RandIntFn = secureRandomInt): Card[] {
  const deck = buildDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const RANK_SYMBOLS: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "T",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export function cardToString(card: Card): string {
  return `${RANK_SYMBOLS[card.rank]}${card.suit}`;
}

const SYMBOL_TO_RANK: Record<string, Rank> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function cardFromString(s: string): Card {
  const rankSymbol = s.slice(0, -1);
  const suit = s.slice(-1) as Suit;
  const rank = SYMBOL_TO_RANK[rankSymbol.toUpperCase()];
  if (!rank) throw new Error(`Invalid card string: ${s}`);
  return { rank, suit };
}
