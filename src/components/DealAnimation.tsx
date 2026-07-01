"use client";

import { useEffect, useState } from "react";
import { CardBack } from "./PlayingCard";

interface Point {
  top: string;
  left: string;
}

function FlyingCard({ from, to }: { from: Point; to: Point }) {
  const [pos, setPos] = useState(from);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPos(to));
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ease-out"
      style={{ top: pos.top, left: pos.left }}
    >
      <CardBack />
    </div>
  );
}

/** Renders short-lived flying-card animations from the deck to a destination point. Purely visual — sound is handled separately by useGameSounds. */
export function DealAnimation({ cards, deckPosition }: { cards: { key: string; to: Point }[]; deckPosition: Point }) {
  return (
    <>
      {cards.map((c) => (
        <FlyingCard key={c.key} from={deckPosition} to={c.to} />
      ))}
    </>
  );
}
