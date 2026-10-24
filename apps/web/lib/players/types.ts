import type { MediaSource } from "@nexus/shared";

export type PlayerState = "idle" | "playing" | "paused" | "buffering" | "ended";

export interface PlayerAdapter {
  readonly type: MediaSource["type"];
  readonly ready: boolean;
  readonly fineRate: boolean;
  load(source: MediaSource, startAt: number | null, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getTime(): number;
  getDuration(): number;
  getState(): PlayerState;
  isLive(): boolean;
  setRate(rate: number): number;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  subscribe(listener: PlayerEvent): () => void;
  destroy(): void;
}

export type PlayerEvent = (event: "ready" | "state" | "blocked" | "error") => void;

export class Emitter {
  private listeners = new Set<PlayerEvent>();

  subscribe(listener: PlayerEvent) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: Parameters<PlayerEvent>[0]) {
    this.listeners.forEach((listener) => listener(event));
  }
}
