import type { MediaSource } from "@nexus/shared";
import { loadScript } from "../load-script";
import { Emitter, type PlayerAdapter, type PlayerState } from "./types";

interface YTPlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { isLive?: boolean } | undefined;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  mute(): void;
  unMute(): void;
  setVolume(volume: number): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: { onReady: () => void; onStateChange: () => void; onError: () => void };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi() {
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    loadScript("https://www.youtube.com/iframe_api").catch((error) => {
      apiPromise = null;
      reject(error);
    });
  });
  return apiPromise;
}

const STATES: Record<number, PlayerState> = { [-1]: "idle", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "paused" };

export class YouTubeAdapter extends Emitter implements PlayerAdapter {
  readonly type = "youtube" as const;
  ready = false;
  private player: YTPlayer | null = null;
  private wanted: { source: MediaSource; startAt: number | null; autoplay: boolean } | null = null;
  private loadedId: string | null = null;
  private destroyed = false;

  private host: HTMLElement;

  constructor(host: HTMLElement) {
    super();
    this.host = host;
    void this.init();
  }

  get fineRate() {
    const rates = this.ready ? this.player?.getAvailablePlaybackRates?.() : undefined;
    return Boolean(rates?.includes(0.95) && rates.includes(1.05));
  }

  private async init() {
    try {
      const YT = await loadApi();
      if (this.destroyed) return;
      const mount = document.createElement("div");
      this.host.appendChild(mount);
      this.player = new YT.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            this.applyWanted();
            this.emit("ready");
          },
          onStateChange: () => this.emit("state"),
          onError: () => this.emit("error"),
        },
      });
    } catch {
      this.emit("error");
    }
  }

  private applyWanted() {
    if (!this.player || !this.ready || !this.wanted) return;
    const { source, startAt, autoplay } = this.wanted;
    this.wanted = null;
    this.loadedId = source.id;
    const options = { videoId: source.id, ...(startAt !== null ? { startSeconds: startAt } : {}) };
    if (autoplay) this.player.loadVideoById(options);
    else this.player.cueVideoById(options);
  }

  load(source: MediaSource, startAt: number | null, autoplay: boolean) {
    this.wanted = { source, startAt, autoplay };
    this.applyWanted();
  }

  play() {
    this.player?.playVideo();
  }

  pause() {
    this.player?.pauseVideo();
  }

  seek(seconds: number) {
    this.player?.seekTo(seconds, true);
  }

  getTime() {
    return this.ready ? (this.player?.getCurrentTime() ?? 0) : 0;
  }

  getDuration() {
    return this.ready ? (this.player?.getDuration() ?? 0) : 0;
  }

  getState(): PlayerState {
    if (!this.ready || !this.player || this.wanted) return "idle";
    return STATES[this.player.getPlayerState()] ?? "idle";
  }

  isLive() {
    if (!this.ready || !this.player) return false;
    return Boolean(this.player.getVideoData()?.isLive);
  }

  setRate(rate: number) {
    if (!this.player || !this.ready) return 1;
    this.player.setPlaybackRate(rate);
    return rate;
  }

  setMuted(muted: boolean) {
    if (muted) this.player?.mute();
    else this.player?.unMute();
  }

  setVolume(volume: number) {
    this.player?.setVolume(Math.round(volume * 100));
  }

  destroy() {
    this.destroyed = true;
    this.player?.destroy();
    this.player = null;
  }
}
