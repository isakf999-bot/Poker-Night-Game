"use client";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

/** Must be called from a real user gesture (click/keydown) — browsers block audio otherwise. */
export function unlockAudio(): void {
  getAudioContext();
}

function tone(ctx: AudioContext, freq: number, startTime: number, duration: number, type: OscillatorType = "sine", gainPeak = 0.15): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function noiseBurst(ctx: AudioContext, startTime: number, duration: number, gainPeak = 0.2, filterFreq = 2500): void {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

export function playChipSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.06, 0.22, 3200);
  noiseBurst(ctx, now + 0.05, 0.05, 0.16, 2600);
}

export function playCheckSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  tone(ctx, 480, ctx.currentTime, 0.08, "triangle", 0.12);
}

export function playFoldSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  tone(ctx, 260, ctx.currentTime, 0.12, "sine", 0.08);
}

export function playRaiseSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.06, 0.22, 3200);
  tone(ctx, 520, now + 0.05, 0.12, "sawtooth", 0.1);
  tone(ctx, 700, now + 0.12, 0.14, "sawtooth", 0.1);
}

export function playAllInSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  noiseBurst(ctx, now, 0.1, 0.25, 3000);
  tone(ctx, 220, now, 0.3, "sawtooth", 0.15);
  tone(ctx, 440, now + 0.1, 0.25, "sawtooth", 0.15);
  tone(ctx, 660, now + 0.2, 0.3, "sawtooth", 0.15);
}

export function playCardFlipSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // A soft, low "swish" — deliberately gentle and low-pitched so it doesn't grate
  // when several cards are dealt in quick succession.
  noiseBurst(ctx, ctx.currentTime, 0.12, 0.12, 1400);
}

export function playBlindIncreaseSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 880, now, 0.18, "sine", 0.14);
  tone(ctx, 1108, now + 0.14, 0.22, "sine", 0.14);
}
