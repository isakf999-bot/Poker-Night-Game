import type { EvaluatedHand, PlayerBettingState, Pot, Seat } from "./types";

/** If the highest contributor's amount exceeds the second highest, the excess was never
 *  matched by anyone and must be refunded before pots are calculated. Mutates players. */
export function refundUncalledBet(players: PlayerBettingState[]): void {
  const contributors = [...players]
    .filter((p) => p.totalCommittedThisHand > 0)
    .sort((a, b) => b.totalCommittedThisHand - a.totalCommittedThisHand);
  if (contributors.length < 2) return;
  const [highest, secondHighest] = contributors;
  if (highest.totalCommittedThisHand > secondHighest.totalCommittedThisHand) {
    const refund = highest.totalCommittedThisHand - secondHighest.totalCommittedThisHand;
    highest.totalCommittedThisHand -= refund;
    highest.stack += refund;
  }
}

export function calculatePots(players: PlayerBettingState[]): Pot[] {
  const contributors = players.filter((p) => p.totalCommittedThisHand > 0);
  const levels = [...new Set(contributors.map((p) => p.totalCommittedThisHand))].sort((a, b) => a - b);

  // Raw layers first, in ascending contribution order. A layer can have zero eligible
  // winners if every payer at that level happened to fold (e.g. a folded player's
  // contribution exceeded the eventual sole survivor's) — those chips get carried
  // forward to the next layer that does have an eligible winner so no chip is ever lost.
  const rawLayers: { amount: number; eligiblePlayerSeatIds: string[] }[] = [];
  let previousLevel = 0;
  for (const level of levels) {
    const layerHeight = level - previousLevel;
    const payers = contributors.filter((p) => p.totalCommittedThisHand >= level);
    const potAmount = layerHeight * payers.length;
    if (potAmount > 0) {
      const eligible = payers.filter((p) => p.status !== "folded").map((p) => p.seatId);
      rawLayers.push({ amount: potAmount, eligiblePlayerSeatIds: eligible });
    }
    previousLevel = level;
  }

  for (let i = rawLayers.length - 1; i >= 0; i--) {
    if (rawLayers[i].eligiblePlayerSeatIds.length === 0) {
      const carryAmount = rawLayers[i].amount;
      const target = rawLayers[i + 1] ?? rawLayers[i - 1];
      if (target) target.amount += carryAmount;
      rawLayers.splice(i, 1);
    }
  }

  const pots: Pot[] = [];
  for (const layer of rawLayers) {
    const prev = pots[pots.length - 1];
    if (prev && sameSet(prev.eligiblePlayerSeatIds, layer.eligiblePlayerSeatIds)) {
      prev.amount += layer.amount;
    } else {
      pots.push({ amount: layer.amount, eligiblePlayerSeatIds: layer.eligiblePlayerSeatIds, isMain: pots.length === 0 });
    }
  }

  return pots;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

function orderBySeatFromDealer(winnerIds: string[], seats: Seat[], dealerSeatIndex: number): string[] {
  const orderedSeatIds = seats.map((s) => s.seatId);
  const n = orderedSeatIds.length;
  const winnerSet = new Set(winnerIds);
  const ordered: string[] = [];
  for (let step = 1; step <= n; step++) {
    const idx = (dealerSeatIndex + step) % n;
    const seatId = orderedSeatIds[idx];
    if (winnerSet.has(seatId)) ordered.push(seatId);
  }
  return ordered;
}

/** Distributes pots to winners, including split-pot odd-chip handling (extra chips go to
 *  winners closest to the left of the dealer button). Returns seatId -> chips won. */
export function distributePots(
  pots: Pot[],
  evaluatedHands: Map<string, EvaluatedHand>,
  seats: Seat[],
  dealerSeatIndex: number,
): Map<string, number> {
  const winnings = new Map<string, number>();

  for (const pot of pots) {
    const eligibleHands = pot.eligiblePlayerSeatIds.map((id) => ({ id, hand: evaluatedHands.get(id)! }));
    const maxScore = Math.max(...eligibleHands.map((h) => h.hand.score));
    const winnerIds = eligibleHands.filter((h) => h.hand.score === maxScore).map((h) => h.id);

    const share = Math.floor(pot.amount / winnerIds.length);
    let remainder = pot.amount - share * winnerIds.length;

    const orderedWinners = orderBySeatFromDealer(winnerIds, seats, dealerSeatIndex);
    for (const seatId of orderedWinners) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      winnings.set(seatId, (winnings.get(seatId) ?? 0) + share + extra);
    }
  }

  return winnings;
}
