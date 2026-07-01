import { CardBack } from "./PlayingCard";

/** A resting stack of cards on the table, representing the deck the dealer deals from. */
export function Deck() {
  return (
    <div className="relative h-[10vh] w-[7.2vh]">
      <div className="absolute -translate-x-1/2 -translate-y-1/2 rotate-2 opacity-60" style={{ top: "50%", left: "50%" }}>
        <CardBack />
      </div>
      <div className="absolute -translate-x-1/2 -translate-y-1/2 -rotate-1 opacity-80" style={{ top: "50%", left: "50%" }}>
        <CardBack />
      </div>
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ top: "50%", left: "50%" }}>
        <CardBack />
      </div>
    </div>
  );
}
