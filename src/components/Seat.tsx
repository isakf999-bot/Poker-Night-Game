import type { ClientSeatView } from "@/lib/socketEvents";
import { CardBack, PlayingCard } from "./PlayingCard";
import { ChipStack } from "./ChipStack";

export function Seat({ seat, isViewer, isWinner }: { seat: ClientSeatView; isViewer: boolean; isWinner?: boolean }) {
  return (
    <div
      className={`flex w-[17.5vh] min-w-[135px] flex-col items-center gap-1 rounded-2xl p-2.5 transition ${
        isWinner
          ? "bg-emerald-500/20 ring-4 ring-emerald-400"
          : seat.isActing
            ? "bg-amber-500/20 ring-4 ring-amber-400"
            : "bg-zinc-900/70 ring-1 ring-zinc-800"
      } ${seat.hasFolded ? "opacity-40" : ""}`}
    >
      <div className="flex h-[10vh] gap-1.5">
        {seat.holeCards ? (
          seat.holeCards.map((c, i) => <PlayingCard key={i} card={c} />)
        ) : (
          <>
            <CardBack />
            <CardBack />
          </>
        )}
      </div>
      <div className="flex items-center gap-1 text-sm font-medium text-zinc-100">
        {seat.isDealer && <span className="rounded-full bg-zinc-100 px-2 text-xs font-bold text-zinc-900">D</span>}
        <span className="truncate max-w-[9rem]">{seat.displayName}</span>
        {isViewer && <span className="text-xs text-emerald-400">(you)</span>}
      </div>
      {isWinner && <span className="text-xs font-bold tracking-wide text-emerald-400">WINNER</span>}
      {!seat.isConnected && <span className="text-xs text-red-400">Disconnected</span>}
      {seat.isAllIn && <span className="text-xs font-bold text-red-400">ALL-IN</span>}
      <ChipStack amount={seat.stack} />
      {seat.betThisStreet > 0 && <span className="text-xs text-amber-300">Bet: {seat.betThisStreet.toLocaleString("en-US")}</span>}
    </div>
  );
}
