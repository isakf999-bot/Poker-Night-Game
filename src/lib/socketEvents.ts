import type {
  BlindLevel,
  BlindScheduleConfig,
  Card,
  EvaluatedHand,
  GameStatus,
  HandStreet,
  LegalAction,
  PlayerAction,
  Pot,
} from "./poker/types";

export interface LastActionEvent {
  type: PlayerAction["type"];
  seatId: string;
  seq: number;
}

export interface ClientSeatView {
  seatId: string;
  displayName: string;
  stack: number;
  isSittingOut: boolean;
  isConnected: boolean;
  isDealer: boolean;
  isActing: boolean;
  betThisStreet: number;
  hasFolded: boolean;
  isAllIn: boolean;
  /** Only present for the viewer's own seat, or revealed at showdown. */
  holeCards?: [Card, Card];
}

export interface ClientHandResult {
  seatId: string;
  amountWon: number;
  hand?: { categoryLabel: string };
  holeCards?: [Card, Card];
}

export interface ClientGameView {
  gameId: string;
  status: GameStatus;
  hostPlayerId: string;
  viewerPlayerId: string;
  settings: BlindScheduleConfig;
  currentBlindLevel: BlindLevel;
  msUntilNextBlindLevel: number | null;
  seats: ClientSeatView[];
  communityCards: Card[];
  pots: Pot[];
  street: HandStreet | "waiting";
  actingSeatId: string | null;
  legalActionsForViewer: LegalAction[];
  currentBetToMatch: number;
  minRaiseIncrement: number;
  lastHandResults: ClientHandResult[] | null;
  handNumber: number;
  lastAction: LastActionEvent | null;
}

export interface CreateGamePayload {
  hostName: string;
  settings: BlindScheduleConfig;
}

export interface JoinGamePayload {
  gameId: string;
  name: string;
  existingPlayerId?: string;
}

export interface PlayerActionPayload {
  gameId: string;
  playerId: string;
  action: PlayerAction;
}

export interface AckError {
  error: string;
}

export interface CreateGameAck {
  gameId: string;
  playerId: string;
}

export interface JoinGameAck {
  playerId: string;
}

export type EvaluatedHandLabel = EvaluatedHand;

export interface ServerToClientEvents {
  game_state: (view: ClientGameView) => void;
  error_message: (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  create_game: (payload: CreateGamePayload, ack: (res: CreateGameAck | AckError) => void) => void;
  join_game: (payload: JoinGamePayload, ack: (res: JoinGameAck | AckError) => void) => void;
  start_game: (payload: { gameId: string; playerId: string }, ack: (res: { ok: true } | AckError) => void) => void;
  player_action: (payload: PlayerActionPayload, ack: (res: { ok: true } | AckError) => void) => void;
}
