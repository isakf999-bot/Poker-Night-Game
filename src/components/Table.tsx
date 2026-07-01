"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientGameView } from "@/lib/socketEvents";
import { Seat } from "./Seat";
import { PlayingCard } from "./PlayingCard";
import { Deck } from "./Deck";
import { DealAnimation } from "./DealAnimation";

// The deck sits above and to the side of the community cards, which are centered on
// the table's exact middle. It's kept off the vertical centerline on purpose: for an
// even number of seats, one seat lands exactly at top-center (see seatPosition), so a
// dead-center-top deck would collide with that seat's pod.
const DECK_POSITION = { top: "26%", left: "37%" };
const COMMUNITY_POSITION = { top: "50%", left: "50%" };
const FLIGHT_DURATION_MS = 550;

function seatPosition(index: number, total: number): { top: string; left: string } {
  // index 0 is placed at the bottom (closest to the viewer), going clockwise.
  // Radius is pulled in from the table edge so a seat's own height (cards + name +
  // chips + bet label) never gets clipped by the table's bounding box.
  const angle = Math.PI / 2 + (2 * Math.PI * index) / total;
  const x = 50 + 34 * Math.cos(angle);
  const y = 50 + 25 * Math.sin(angle);
  return { top: `${y}%`, left: `${x}%` };
}

export function Table({ view }: { view: ClientGameView }) {
  const viewerIndex = view.seats.findIndex((s) => s.seatId === view.viewerPlayerId);
  const orderedSeats = viewerIndex >= 0 ? [...view.seats.slice(viewerIndex), ...view.seats.slice(0, viewerIndex)] : view.seats;

  const totalPot = view.pots.reduce((sum, p) => sum + p.amount, 0);
  const winnerSeatIds = new Set((view.lastHandResults ?? []).filter((r) => r.amountWon > 0).map((r) => r.seatId));

  const [flyingCards, setFlyingCards] = useState<{ key: string; to: { top: string; left: string } }[]>([]);
  const initialized = useRef(false);
  const lastHandNumber = useRef(view.handNumber);
  const lastCommunityCount = useRef(view.communityCards.length);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      lastHandNumber.current = view.handNumber;
      lastCommunityCount.current = view.communityCards.length;
      return;
    }

    const spawned: { key: string; to: { top: string; left: string } }[] = [];

    if (view.handNumber !== lastHandNumber.current) {
      orderedSeats.forEach((seat, seatIdx) => {
        const to = seatPosition(seatIdx, orderedSeats.length);
        spawned.push({ key: `hand-${view.handNumber}-${seat.seatId}-0`, to });
        spawned.push({ key: `hand-${view.handNumber}-${seat.seatId}-1`, to });
      });
      lastHandNumber.current = view.handNumber;
    }

    if (view.communityCards.length !== lastCommunityCount.current) {
      for (let i = lastCommunityCount.current; i < view.communityCards.length; i++) {
        spawned.push({ key: `board-${view.handNumber}-${i}`, to: COMMUNITY_POSITION });
      }
      lastCommunityCount.current = view.communityCards.length;
    }

    if (spawned.length > 0) {
      const spawnTimeout = setTimeout(() => setFlyingCards((prev) => [...prev, ...spawned]), 0);
      const removeTimeout = setTimeout(() => {
        setFlyingCards((prev) => prev.filter((c) => !spawned.some((s) => s.key === c.key)));
      }, FLIGHT_DURATION_MS + 50);
      return () => {
        clearTimeout(spawnTimeout);
        clearTimeout(removeTimeout);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.handNumber, view.communityCards.length]);

  return (
    <div className="relative aspect-[2/1] h-full max-h-full w-full max-w-full">
      <div className="absolute inset-[6%] rounded-[50%] bg-emerald-800 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)] ring-[10px] ring-emerald-950" />

      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={DECK_POSITION}>
        <Deck />
      </div>

      <div className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3" style={COMMUNITY_POSITION}>
        <div className="flex gap-2">
          {view.communityCards.map((c, i) => (
            <PlayingCard key={i} card={c} />
          ))}
        </div>
        {totalPot > 0 && <div className="rounded-full bg-zinc-950/70 px-4 py-1.5 text-base font-semibold text-amber-300">Pot: {totalPot.toLocaleString("en-US")}</div>}
      </div>

      {orderedSeats.map((seat, i) => {
        const pos = seatPosition(i, orderedSeats.length);
        return (
          <div key={seat.seatId} className="absolute -translate-x-1/2 -translate-y-1/2" style={pos}>
            <Seat seat={seat} isViewer={seat.seatId === view.viewerPlayerId} isWinner={winnerSeatIds.has(seat.seatId)} />
          </div>
        );
      })}

      <DealAnimation cards={flyingCards} deckPosition={DECK_POSITION} />
    </div>
  );
}
