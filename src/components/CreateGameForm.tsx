"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socketClient";
import type { BlindIncreaseMode } from "@/lib/poker/types";

export function CreateGameForm() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [startingChips, setStartingChips] = useState(5000);
  const [startingBigBlind, setStartingBigBlind] = useState(20);
  const [minutesPerLevel, setMinutesPerLevel] = useState(15);
  const [increaseMode, setIncreaseMode] = useState<BlindIncreaseMode>("fixed");
  const [increaseValue, setIncreaseValue] = useState(20);
  const [maxBigBlindEnabled, setMaxBigBlindEnabled] = useState(true);
  const [maxBigBlind, setMaxBigBlind] = useState(1000);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hostName.trim()) {
      setError("Enter your name");
      return;
    }
    setSubmitting(true);
    setError(null);
    const socket = getSocket();
    socket.emit(
      "create_game",
      {
        hostName: hostName.trim(),
        settings: {
          startingChips,
          startingBigBlind,
          minutesPerLevel,
          increaseMode,
          increaseValue: increaseMode === "fixed" ? increaseValue : 0,
          maxBigBlind: maxBigBlindEnabled ? maxBigBlind : null,
        },
      },
      (res) => {
        setSubmitting(false);
        if ("error" in res) {
          setError(res.error);
          return;
        }
        sessionStorage.setItem(`poker:playerId:${res.gameId}`, res.playerId);
        router.push(`/game/${res.gameId}`);
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full max-w-md space-y-5 rounded-2xl bg-zinc-900/60 p-6 shadow-xl ring-1 ring-zinc-800">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-300">Your name</label>
        <input
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          maxLength={24}
          placeholder="Host"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Starting chips" value={startingChips} onChange={setStartingChips} min={100} step={100} />
        <NumberField label="Big blind" value={startingBigBlind} onChange={setStartingBigBlind} min={1} step={5} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberField label="Minutes per level" value={minutesPerLevel} onChange={setMinutesPerLevel} min={1} step={1} />
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-300">Increase type</label>
          <select
            value={increaseMode}
            onChange={(e) => setIncreaseMode(e.target.value as BlindIncreaseMode)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
          >
            <option value="fixed">Fixed amount</option>
            <option value="double">Double each level (2x)</option>
          </select>
        </div>
      </div>

      {increaseMode === "fixed" && (
        <NumberField label="Increase big blind by" value={increaseValue} onChange={setIncreaseValue} min={1} step={5} />
      )}

      <div>
        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-300">
          <input type="checkbox" checked={maxBigBlindEnabled} onChange={(e) => setMaxBigBlindEnabled(e.target.checked)} />
          Max big blind
        </label>
        {maxBigBlindEnabled && <NumberField label="" value={maxBigBlind} onChange={setMaxBigBlind} min={startingBigBlind} step={50} />}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create game"}
      </button>
    </form>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  // Local text state lets the field sit blank while the user is clearing/retyping it,
  // instead of being forced back to a controlled "0" that a new digit gets appended to.
  const [text, setText] = useState(String(value));

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    if (raw.trim() === "") return;
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) onChange(parsed);
  }

  function handleBlur() {
    if (text.trim() === "") {
      const fallback = min ?? 0;
      setText(String(fallback));
      onChange(fallback);
    }
  }

  return (
    <div>
      {label && <label className="mb-1 block text-sm font-medium text-zinc-300">{label}</label>}
      <input
        type="number"
        value={text}
        min={min}
        step={step}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
      />
    </div>
  );
}
