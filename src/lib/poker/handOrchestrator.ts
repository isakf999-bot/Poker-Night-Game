import {
  applyAction,
  createBettingRound,
  isHandOverByFold,
  isRoundComplete,
  legalActions,
  nextActiveSeat,
  resetStreetBets,
  shouldRunOutRemainingStreets,
} from "./bettingEngine";
import { type RandIntFn, secureRandomInt, shuffledDeck } from "./deck";
import { evaluate7 } from "./handEvaluator";
import { calculatePots, distributePots, refundUncalledBet } from "./potCalculator";
import type {
  Card,
  EvaluatedHand,
  HandResultEntry,
  HandState,
  LegalAction,
  PlayerAction,
  PlayerBettingState,
  TableState,
} from "./types";

export class PokerEngineError extends Error {}

function buildPlayersForHand(table: TableState): PlayerBettingState[] {
  return table.seats.map((seat) => ({
    seatId: seat.seatId,
    stack: seat.stack,
    status: !seat.isSittingOut && seat.stack > 0 ? "active" : "sitting-out",
    betThisStreet: 0,
    totalCommittedThisHand: 0,
    hasActedThisStreet: false,
  }));
}

function postBlind(player: PlayerBettingState, amount: number): void {
  const posted = Math.min(amount, player.stack);
  player.stack -= posted;
  player.betThisStreet = posted;
  player.totalCommittedThisHand += posted;
  if (player.stack === 0) player.status = "all-in";
}

function inHandIndicesFrom(players: PlayerBettingState[], startIndex: number): number[] {
  const n = players.length;
  const result: number[] = [];
  for (let step = 0; step < n; step++) {
    const idx = (startIndex + step) % n;
    if (players[idx].status === "active" || players[idx].status === "all-in") result.push(idx);
  }
  return result;
}

export function eligibleSeatCount(table: TableState): number {
  return table.seats.filter((s) => !s.isSittingOut && s.stack > 0).length;
}

export function canStartHand(table: TableState): boolean {
  return table.status !== "complete" && eligibleSeatCount(table) >= 2;
}

export function startHand(table: TableState, bigBlind: number, smallBlind: number, randInt: RandIntFn = secureRandomInt): HandState {
  if (!canStartHand(table)) {
    throw new PokerEngineError("Cannot start hand: need at least 2 players with chips");
  }

  const players = buildPlayersForHand(table);
  const dealerSeatIndex = nextActiveSeat(players, table.dealerSeatIndex);
  const activeCount = players.filter((p) => p.status === "active").length;

  let smallBlindSeatIndex: number;
  let bigBlindSeatIndex: number;
  if (activeCount === 2) {
    smallBlindSeatIndex = dealerSeatIndex;
    bigBlindSeatIndex = nextActiveSeat(players, smallBlindSeatIndex);
  } else {
    smallBlindSeatIndex = nextActiveSeat(players, dealerSeatIndex);
    bigBlindSeatIndex = nextActiveSeat(players, smallBlindSeatIndex);
  }

  postBlind(players[smallBlindSeatIndex], smallBlind);
  postBlind(players[bigBlindSeatIndex], bigBlind);

  const deck = shuffledDeck(randInt);
  const holeCards = new Map<string, [Card, Card]>();
  const dealOrder = inHandIndicesFrom(players, smallBlindSeatIndex);
  for (const idx of dealOrder) holeCards.set(players[idx].seatId, [deck.pop() as Card, deck.pop() as Card]);

  const preferredFirstToAct = activeCount === 2 ? dealerSeatIndex : nextActiveSeat(players, bigBlindSeatIndex);
  // If the preferred seat is already all-in from posting a short blind, skip to the next seat that can actually act.
  const firstToActIndex =
    players[preferredFirstToAct].status === "active" ? preferredFirstToAct : nextActiveSeat(players, preferredFirstToAct);

  const bettingState = createBettingRound("preflop", players, bigBlind, firstToActIndex, bigBlind);

  const hand: HandState = {
    handNumber: table.handNumber + 1,
    deck,
    communityCards: [],
    holeCards,
    bettingState,
    pots: [],
    street: "preflop",
    dealerSeatIndex,
    smallBlindSeatIndex,
    bigBlindSeatIndex,
    firstToActSeatIndex: firstToActIndex,
  };

  table.dealerSeatIndex = dealerSeatIndex;
  table.handNumber = hand.handNumber;
  table.currentHand = hand;

  progressHandState(table);
  return hand;
}

function dealCommunity(hand: HandState, count: number): void {
  hand.deck.pop(); // burn card
  for (let i = 0; i < count; i++) hand.communityCards.push(hand.deck.pop() as Card);
}

/** House rule: whoever acted first preflop (under the gun) keeps acting first on every
 *  street, rather than the standard casino rule of restarting from the small blind
 *  postflop. Falls forward to the next seat that can still act if that seat has since
 *  folded or gone all-in. */
function nextStreetFirstToAct(table: TableState, hand: HandState): number {
  const players = hand.bettingState.players;
  const preferred = hand.firstToActSeatIndex;
  return players[preferred].status === "active" ? preferred : nextActiveSeat(players, preferred);
}

function finalizeWithoutShowdown(table: TableState, hand: HandState): void {
  const players = hand.bettingState.players;
  refundUncalledBet(players);
  const pots = calculatePots(players);
  const winnerEntry = players.find((p) => p.status !== "folded");
  if (!winnerEntry) throw new PokerEngineError("No remaining player to award pot to");

  const totalPot = pots.reduce((sum, p) => sum + p.amount, 0);
  winnerEntry.stack += totalPot;

  syncStacksToSeats(table, players);

  const results: HandResultEntry[] = [{ seatId: winnerEntry.seatId, amountWon: totalPot }];
  hand.pots = pots;
  hand.results = results;
  hand.street = "complete";
}

function runShowdown(table: TableState, hand: HandState): void {
  const players = hand.bettingState.players;
  refundUncalledBet(players);
  const pots = calculatePots(players);

  const evaluatedHands = new Map<string, EvaluatedHand>();
  for (const p of players) {
    if (p.status === "folded") continue;
    const hole = hand.holeCards.get(p.seatId);
    if (!hole) continue;
    evaluatedHands.set(p.seatId, evaluate7([...hole, ...hand.communityCards]));
  }

  const winnings = distributePots(pots, evaluatedHands, table.seats, hand.dealerSeatIndex);
  for (const p of players) {
    p.stack += winnings.get(p.seatId) ?? 0;
  }
  syncStacksToSeats(table, players);

  const results: HandResultEntry[] = [];
  for (const p of players) {
    if (p.status === "folded") continue;
    results.push({
      seatId: p.seatId,
      amountWon: winnings.get(p.seatId) ?? 0,
      hand: evaluatedHands.get(p.seatId),
      holeCards: hand.holeCards.get(p.seatId),
    });
  }

  hand.pots = pots;
  hand.results = results;
  hand.street = "complete";
}

function syncStacksToSeats(table: TableState, players: PlayerBettingState[]): void {
  for (let i = 0; i < table.seats.length; i++) {
    table.seats[i].stack = players[i].stack;
  }
}

/** Advances hand state machine until it needs player input or is finished.
 *  Call after startHand and after every applyPlayerAction. */
export function progressHandState(table: TableState): void {
  const hand = table.currentHand;
  if (!hand || hand.street === "showdown" || hand.street === "complete") return;

  const bs = hand.bettingState;

  if (isHandOverByFold(bs)) {
    finalizeWithoutShowdown(table, hand);
    return;
  }

  if (!isRoundComplete(bs)) return;

  if (shouldRunOutRemainingStreets(bs)) {
    if (hand.street === "preflop") dealCommunity(hand, 3);
    if (hand.street === "preflop" || hand.street === "flop") dealCommunity(hand, 1);
    if (hand.street === "preflop" || hand.street === "flop" || hand.street === "turn") dealCommunity(hand, 1);
    hand.street = "showdown";
    runShowdown(table, hand);
    return;
  }

  if (hand.street === "river") {
    hand.street = "showdown";
    runShowdown(table, hand);
    return;
  }

  const nextStreet = hand.street === "preflop" ? "flop" : hand.street === "flop" ? "turn" : "river";
  const dealCount = nextStreet === "flop" ? 3 : 1;
  resetStreetBets(bs.players);
  dealCommunity(hand, dealCount);
  const firstToAct = nextStreetFirstToAct(table, hand);
  hand.street = nextStreet;
  hand.bettingState = createBettingRound(nextStreet, bs.players, bs.bigBlind, firstToAct);

  progressHandState(table);
}

export function getActingSeatId(table: TableState): string | null {
  const hand = table.currentHand;
  if (!hand || hand.street === "showdown" || hand.street === "complete") return null;
  return hand.bettingState.players[hand.bettingState.actingSeatIndex].seatId;
}

export function getLegalActionsForSeat(table: TableState, seatId: string): LegalAction[] {
  const hand = table.currentHand;
  if (!hand) return [];
  if (getActingSeatId(table) !== seatId) return [];
  return legalActions(hand.bettingState);
}

export function applyPlayerAction(table: TableState, seatId: string, action: PlayerAction): void {
  const hand = table.currentHand;
  if (!hand) throw new PokerEngineError("No hand in progress");
  if (getActingSeatId(table) !== seatId) throw new PokerEngineError("Not this player's turn");

  const allowed = legalActions(hand.bettingState);
  const matching = allowed.find((a) => a.type === action.type);
  if (!matching) throw new PokerEngineError(`Illegal action: ${action.type}`);
  if (
    (action.type === "bet" || action.type === "raise") &&
    (action.amount == null ||
      (matching.minAmount != null && action.amount < matching.minAmount) ||
      (matching.maxAmount != null && action.amount > matching.maxAmount))
  ) {
    throw new PokerEngineError(`Illegal amount for ${action.type}`);
  }

  applyAction(hand.bettingState, action);
  progressHandState(table);
}

/** Hook for disconnect/timeout handling: forces a fold for the seat if it is currently their turn. */
export function forceFold(table: TableState, seatId: string): void {
  if (getActingSeatId(table) !== seatId) return;
  applyPlayerAction(table, seatId, { type: "fold" });
}
