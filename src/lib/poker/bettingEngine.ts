import type { BettingRoundState, LegalAction, PlayerAction, PlayerBettingState } from "./types";

export function legalActions(state: BettingRoundState): LegalAction[] {
  const player = state.players[state.actingSeatIndex];
  const toCall = state.currentBetToMatch - player.betThisStreet;
  const actions: LegalAction[] = [];

  if (toCall <= 0) {
    actions.push({ type: "check" });
  } else {
    actions.push({ type: "fold" });
    actions.push({ type: "call", minAmount: state.currentBetToMatch });
  }

  if (toCall <= 0 && player.stack > 0) {
    const minBet = Math.min(state.bigBlind, player.stack);
    actions.push({
      type: "bet",
      minAmount: player.betThisStreet + minBet,
      maxAmount: player.betThisStreet + player.stack,
    });
  }

  if (toCall > 0 && player.stack > toCall) {
    const minRaiseTo = state.currentBetToMatch + state.minRaiseIncrement;
    const maxRaiseTo = player.betThisStreet + player.stack;
    actions.push({
      type: "raise",
      minAmount: Math.min(minRaiseTo, maxRaiseTo),
      maxAmount: maxRaiseTo,
    });
  }

  if (player.stack > 0) {
    actions.push({ type: "all-in", minAmount: player.betThisStreet + player.stack, maxAmount: player.betThisStreet + player.stack });
  }

  return actions;
}

function commitChips(player: PlayerBettingState, deltaAmount: number): void {
  player.stack -= deltaAmount;
  player.betThisStreet += deltaAmount;
  player.totalCommittedThisHand += deltaAmount;
}

export function nextActiveSeat(players: PlayerBettingState[], fromIndex: number): number {
  let i = fromIndex;
  for (let step = 0; step < players.length; step++) {
    i = (i + 1) % players.length;
    if (players[i].status === "active") return i;
  }
  return -1;
}

export function applyAction(state: BettingRoundState, action: PlayerAction): BettingRoundState {
  const player = state.players[state.actingSeatIndex];

  switch (action.type) {
    case "fold": {
      player.status = "folded";
      break;
    }
    case "check": {
      break;
    }
    case "call": {
      const callAmount = Math.min(state.currentBetToMatch - player.betThisStreet, player.stack);
      commitChips(player, callAmount);
      if (player.stack === 0) player.status = "all-in";
      break;
    }
    case "bet":
    case "raise":
    case "all-in": {
      const targetAmount = action.amount ?? player.betThisStreet + player.stack;
      const increment = targetAmount - state.currentBetToMatch;
      const isFullRaise = increment >= state.minRaiseIncrement;

      commitChips(player, targetAmount - player.betThisStreet);
      if (player.stack === 0) player.status = "all-in";

      state.currentBetToMatch = Math.max(state.currentBetToMatch, targetAmount);

      if (isFullRaise) {
        state.minRaiseIncrement = increment;
        state.lastAggressorSeatIndex = state.actingSeatIndex;
        for (const p of state.players) {
          if (p !== player && p.status === "active") p.hasActedThisStreet = false;
        }
      }
      break;
    }
  }

  player.hasActedThisStreet = true;
  const next = nextActiveSeat(state.players, state.actingSeatIndex);
  if (next !== -1) state.actingSeatIndex = next;
  return state;
}

/** True once at most one player who is neither folded nor all-in remains — no further betting can occur this hand. */
export function shouldRunOutRemainingStreets(state: BettingRoundState): boolean {
  const activePlayers = state.players.filter((p) => p.status === "active");
  const nonFolded = state.players.filter((p) => p.status !== "folded");
  return nonFolded.length > 1 && activePlayers.length <= 1;
}

/** True when the hand should end immediately because at most one player has not folded. */
export function isHandOverByFold(state: BettingRoundState): boolean {
  return state.players.filter((p) => p.status !== "folded").length <= 1;
}

export function isRoundComplete(state: BettingRoundState): boolean {
  const nonFolded = state.players.filter((p) => p.status !== "folded");
  if (nonFolded.length <= 1) return true;

  const activePlayers = state.players.filter((p) => p.status === "active");
  if (activePlayers.length === 0) return true; // everyone remaining is all-in, nothing left to decide

  // Even when only one player is still "active" (the rest are all-in/folded), that
  // player must still get a turn and match the current bet before the round is done —
  // otherwise an all-in would skip straight to showdown without giving them a chance
  // to call or fold.
  return activePlayers.every((p) => p.hasActedThisStreet && p.betThisStreet === state.currentBetToMatch);
}

/** Zeroes betThisStreet for a new street. Call BEFORE createBettingRound for postflop streets.
 *  Skip for preflop — blinds must already be posted into betThisStreet before the round is created. */
export function resetStreetBets(players: PlayerBettingState[]): void {
  for (const p of players) p.betThisStreet = 0;
}

export function createBettingRound(
  street: BettingRoundState["street"],
  players: PlayerBettingState[],
  bigBlind: number,
  actingSeatIndex: number,
  currentBetToMatch = 0,
): BettingRoundState {
  for (const p of players) {
    p.hasActedThisStreet = p.status !== "active"; // folded/all-in players are skipped, treat as already "acted"
  }
  return {
    street,
    players,
    currentBetToMatch,
    minRaiseIncrement: bigBlind,
    bigBlind,
    actingSeatIndex,
    lastAggressorSeatIndex: null,
  };
}
