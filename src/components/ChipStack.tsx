const DENOMINATIONS: { value: number; base: string; edge: string }[] = [
  { value: 500, base: "#18181b", edge: "#f4f4f5" }, // black
  { value: 100, base: "#059669", edge: "#d1fae5" }, // green
  { value: 25, base: "#2563eb", edge: "#dbeafe" }, // blue
  { value: 5, base: "#dc2626", edge: "#fee2e2" }, // red
  { value: 1, base: "#f4f4f5", edge: "#52525b" }, // white
];

/** Breaks a chip total into denomination counts (greedy), capped so the visual stays compact. */
function breakdownChips(amount: number): { value: number; base: string; edge: string; count: number }[] {
  let remaining = Math.max(0, Math.round(amount));
  const result: { value: number; base: string; edge: string; count: number }[] = [];
  for (const denom of DENOMINATIONS) {
    const count = Math.min(4, Math.floor(remaining / denom.value));
    if (count > 0) {
      result.push({ ...denom, count });
      remaining -= count * denom.value;
    }
  }
  return result;
}

function Chip({ base, edge }: { base: string; edge: string }) {
  return (
    <div
      className="relative h-3.5 w-7 rounded-full border-2 shadow-sm"
      style={{ backgroundColor: base, borderColor: edge }}
    >
      <div
        className="absolute inset-x-1 top-1/2 h-[3px] -translate-y-1/2 rounded-full opacity-80"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, ${edge} 0 3px, transparent 3px 6px)`,
        }}
      />
    </div>
  );
}

export function ChipStack({ amount }: { amount: number }) {
  const stacks = breakdownChips(amount);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-end gap-0.5">
        {stacks.length === 0 ? (
          <div className="h-1 w-4" />
        ) : (
          stacks.map((s) => (
            <div key={s.value} className="flex flex-col-reverse">
              {Array.from({ length: s.count }).map((_, i) => (
                <div key={i} className="-mb-3">
                  <Chip base={s.base} edge={s.edge} />
                </div>
              ))}
            </div>
          ))
        )}
      </div>
      <span className="mt-1.5 text-sm font-semibold text-zinc-100">{amount.toLocaleString("en-US")}</span>
    </div>
  );
}
