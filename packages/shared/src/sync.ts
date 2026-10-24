import type { Playback } from "./types.ts";

export const HARD_SEEK_THRESHOLD = 1;
export const RATE_THRESHOLD = 0.15;
export const COARSE_SEEK_THRESHOLD = 0.5;

export function expectedPosition(playback: Playback, serverNow: number) {
  if (playback.position === null) return null;
  if (!playback.playing) return playback.position;
  return playback.position + Math.max(0, serverNow - playback.updatedAt) / 1000;
}

export type Correction = { kind: "none" } | { kind: "seek" } | { kind: "rate"; rate: number } | { kind: "reset-rate" };

export function computeCorrection(drift: number, options: { playing: boolean; fineRate: boolean }): Correction {
  const size = Math.abs(drift);
  if (!options.playing) return size > COARSE_SEEK_THRESHOLD ? { kind: "seek" } : { kind: "none" };
  if (size > HARD_SEEK_THRESHOLD) return { kind: "seek" };
  if (size < RATE_THRESHOLD) return { kind: "reset-rate" };
  if (!options.fineRate) return size > COARSE_SEEK_THRESHOLD ? { kind: "seek" } : { kind: "none" };
  return { kind: "rate", rate: drift > 0 ? 0.95 : 1.05 };
}

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
