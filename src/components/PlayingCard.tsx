import type { Card } from "@/lib/poker/types";

const RANK_LABELS: Record<number, string> = {
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

const SUIT_SYMBOLS: Record<Card["suit"], string> = {
  h: "♥",
  d: "♦",
  c: "♣",
  s: "♠",
};

function rankLabel(rank: number): string {
  return RANK_LABELS[rank] ?? String(rank);
}

export function PlayingCard({ card, small = false }: { card: Card; small?: boolean }) {
  const isRed = card.suit === "h" || card.suit === "d";
  const sizeClasses = small ? "h-[7vh] w-[5vh]" : "h-[10vh] w-[7.2vh]";
  const cornerTextClass = small ? "text-xs" : "text-base";
  const centerTextClass = small ? "text-lg" : "text-3xl";

  return (
    <div
      className={`relative rounded-lg border-2 border-zinc-300 bg-white font-bold shadow-md ${sizeClasses} ${
        isRed ? "text-red-600" : "text-zinc-900"
      }`}
    >
      <div className={`absolute left-1 top-0.5 flex flex-col items-center leading-none ${cornerTextClass}`}>
        <span>{rankLabel(card.rank)}</span>
        <span>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
      <div className={`flex h-full items-center justify-center ${centerTextClass}`}>{SUIT_SYMBOLS[card.suit]}</div>
      <div className={`absolute bottom-0.5 right-1 flex rotate-180 flex-col items-center leading-none ${cornerTextClass}`}>
        <span>{rankLabel(card.rank)}</span>
        <span>{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    </div>
  );
}

export function CardBack({ small = false }: { small?: boolean }) {
  const sizeClasses = small ? "h-[7vh] w-[5vh]" : "h-[10vh] w-[7.2vh]";
  const emblemClasses = small ? "h-5 w-5 text-xs" : "h-9 w-9 text-lg";

  return (
    <div
      className={`relative overflow-hidden rounded-lg border-2 border-zinc-100 bg-gradient-to-br from-blue-800 to-blue-950 shadow-md ${sizeClasses}`}
    >
      <div
        className="absolute inset-0.5 rounded-md border border-blue-400/40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 3px, transparent 3px 7px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.08) 0 3px, transparent 3px 7px)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`flex items-center justify-center rounded-full border-2 border-blue-200/70 bg-blue-900/80 font-bold text-blue-100 ${emblemClasses}`}>
          ♠
        </div>
      </div>
    </div>
  );
}
