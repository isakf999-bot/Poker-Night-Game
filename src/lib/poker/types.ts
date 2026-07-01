export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J,12=Q,13=K,14=A
export type Suit = "c" | "d" | "h" | "s";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export interface HandRank {
  category: HandCategory;
  tiebreakers: Rank[];
}

export interface EvaluatedHand {
  rank: HandRank;
  bestFive: Card[];
  score: number;
}

export type SeatStatus = "active" | "folded" | "all-in" | "sitting-out";

export interface PlayerBettingState {
  seatId: string;
  stack: number;
  status: SeatStatus;
  betThisStreet: number;
  totalCommittedThisHand: number;
  hasActedThisStreet: boolean;
}

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "all-in";

export interface PlayerAction {
  type: ActionType;
  /** Total betThisStreet AFTER the action (not a delta). Required for bet/raise/all-in. */
  amount?: number;
}

export interface LegalAction {
  type: ActionType;
  minAmount?: number;
  maxAmount?: number;
}

export interface BettingRoundState {
  street: "preflop" | "flop" | "turn" | "river";
  players: PlayerBettingState[];
  currentBetToMatch: number;
  minRaiseIncrement: number;
  bigBlind: number;
  actingSeatIndex: number;
  lastAggressorSeatIndex: number | null;
}

export interface Pot {
  amount: number;
  eligiblePlayerSeatIds: string[];
  isMain: boolean;
}

export interface Seat {
  seatId: string;
  playerId: string;
  displayName: string;
  stack: number;
  isSittingOut: boolean;
  isConnected: boolean;
}

export type BlindIncreaseMode = "fixed" | "double";

export interface BlindScheduleConfig {
  startingChips: number;
  startingBigBlind: number;
  minutesPerLevel: number;
  increaseMode: BlindIncreaseMode;
  increaseValue: number;
  maxBigBlind: number | null;
}

export interface BlindLevel {
  level: number;
  smallBlind: number;
  bigBlind: number;
}

export type HandStreet = "preflop" | "flop" | "turn" | "river" | "showdown" | "complete";

export interface HandResultEntry {
  seatId: string;
  amountWon: number;
  hand?: EvaluatedHand;
  holeCards?: [Card, Card];
}

export interface HandState {
  handNumber: number;
  deck: Card[];
  communityCards: Card[];
  holeCards: Map<string, [Card, Card]>;
  bettingState: BettingRoundState;
  pots: Pot[];
  street: HandStreet;
  dealerSeatIndex: number;
  smallBlindSeatIndex: number;
  bigBlindSeatIndex: number;
  /** The seat that acted first preflop (under the gun). By house rule this same seat
   *  also acts first on every subsequent street, instead of the standard casino rule
   *  where post-flop action restarts from the small blind. */
  firstToActSeatIndex: number;
  results?: HandResultEntry[];
}

export type GameStatus = "waiting" | "in-progress" | "complete";

export interface TableState {
  gameId: string;
  hostPlayerId: string;
  settings: BlindScheduleConfig;
  blindSchedule: BlindLevel[];
  gameStartedAtMs: number | null;
  seats: Seat[];
  dealerSeatIndex: number;
  handNumber: number;
  status: GameStatus;
  currentHand: HandState | null;
}
