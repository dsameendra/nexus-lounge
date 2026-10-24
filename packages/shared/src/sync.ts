import type { Playback } from "./types.ts";

export const HARD_SEEK_THRESHOLD = 1;
export const MAX_HARD_SEEK_THRESHOLD = 3;
export const NO_RATE_SEEK_THRESHOLD = 1.5;
export const PAUSED_SEEK_THRESHOLD = 0.75;

export function expectedPosition(playback: Playback, serverNow: number) {
  if (playback.position === null) return null;
  if (!playback.playing) return playback.position;
  return playback.position + Math.max(0, serverNow - playback.updatedAt) / 1000;
}

export type Correction = { kind: "none" } | { kind: "seek" } | { kind: "rate"; rate: number } | { kind: "reset-rate" };

export interface CorrectionOptions {
  playing: boolean;
  currentRate: number;
  rates: number[];
}

export function pickRate(drift: number, rates: number[]) {
  const candidates = drift > 0 ? rates.filter((rate) => rate < 1) : rates.filter((rate) => rate > 1);
  if (candidates.length === 0) return null;
  return drift > 0 ? Math.max(...candidates) : Math.min(...candidates);
}

export function computeCorrection(drift: number, options: CorrectionOptions): Correction {
  const size = Math.abs(drift);
  if (!options.playing) return size > PAUSED_SEEK_THRESHOLD ? { kind: "seek" } : { kind: "none" };

  const rate = pickRate(drift, options.rates);
  if (rate === null) {
    if (size > NO_RATE_SEEK_THRESHOLD) return { kind: "seek" };
    return options.currentRate !== 1 ? { kind: "reset-rate" } : { kind: "none" };
  }

  const speed = Math.abs(rate - 1);
  const hardThreshold = Math.min(MAX_HARD_SEEK_THRESHOLD, Math.max(HARD_SEEK_THRESHOLD, speed * 10));
  if (size > hardThreshold) return { kind: "seek" };

  const fine = speed <= 0.1;
  const start = fine ? 0.15 : 0.6;
  const stop = fine ? 0.15 : 0.3;
  if (options.currentRate !== 1) return size < stop ? { kind: "reset-rate" } : { kind: "rate", rate };
  return size >= start ? { kind: "rate", rate } : { kind: "none" };
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
