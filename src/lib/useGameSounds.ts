"use client";

import { useEffect, useRef } from "react";
import type { ClientGameView } from "./socketEvents";
import {
  playAllInSound,
  playBlindIncreaseSound,
  playCardFlipSound,
  playCheckSound,
  playChipSound,
  playFoldSound,
  playRaiseSound,
} from "./sounds";

/** Watches consecutive game_state snapshots and plays the matching sound effect
 *  for whatever changed (a player's action, new community cards, a blind increase). */
export function useGameSounds(view: ClientGameView | null): void {
  const lastSeq = useRef<number | null>(null);
  const lastHandNumber = useRef<number | null>(null);
  const lastCommunityCount = useRef<number>(0);
  const lastBlindLevel = useRef<number | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!view) return;

    if (!initialized.current) {
      lastSeq.current = view.lastAction?.seq ?? null;
      lastHandNumber.current = view.handNumber;
      lastCommunityCount.current = view.communityCards.length;
      lastBlindLevel.current = view.currentBlindLevel.level;
      initialized.current = true;
      return;
    }

    if (view.handNumber !== lastHandNumber.current) {
      playCardFlipSound();
      lastHandNumber.current = view.handNumber;
    }

    if (view.communityCards.length !== lastCommunityCount.current) {
      // Play one flip per newly revealed card (the flop reveals 3 at once), staggered
      // slightly to match the cards animating in one after another.
      const newCount = view.communityCards.length - lastCommunityCount.current;
      for (let i = 0; i < newCount; i++) {
        setTimeout(() => playCardFlipSound(), i * 140);
      }
      lastCommunityCount.current = view.communityCards.length;
    }

    if (view.currentBlindLevel.level !== lastBlindLevel.current) {
      playBlindIncreaseSound();
      lastBlindLevel.current = view.currentBlindLevel.level;
    }

    if (view.lastAction && view.lastAction.seq !== lastSeq.current) {
      switch (view.lastAction.type) {
        case "check":
          playCheckSound();
          break;
        case "call":
        case "bet":
          playChipSound();
          break;
        case "raise":
          playRaiseSound();
          break;
        case "all-in":
          playAllInSound();
          break;
        case "fold":
          playFoldSound();
          break;
      }
      lastSeq.current = view.lastAction.seq;
    }
  }, [view]);
}
