import type { MediaSource } from "@nexus/shared";
import { loadScript } from "../load-script";
import { Emitter, type PlayerAdapter, type PlayerState } from "./types";

interface TwitchPlayer {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  getEnded(): boolean;
  setChannel(channel: string): void;
  setVideo(videoId: string, timestamp: number): void;
  setMuted(muted: boolean): void;
  setVolume(volume: number): void;
  addEventListener(event: string, callback: () => void): void;
}

interface TwitchNamespace {
  Player: {
    new (
      elementId: string,
      options: { width: string; height: string; channel?: string; video?: string; parent: string[]; autoplay: boolean; muted: boolean; time?: string },
    ): TwitchPlayer;
    READY: string;
    PLAY: string;
    PLAYING: string;
    PAUSE: string;
    ENDED: string;
    PLAYBACK_BLOCKED: string;
    SEEK: string;
    OFFLINE: string;
    ONLINE: string;
  };
}

declare global {
  interface Window {
    Twitch?: TwitchNamespace;
  }
}

let counter = 0;

function timeString(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 3600)}h${Math.floor((total % 3600) / 60)}m${total % 60}s`;
}

export class TwitchAdapter extends Emitter implements PlayerAdapter {
  readonly type = "twitch" as const;
  readonly rates: number[] = [];
  ready = false;
  error: string | null = null;
  private player: TwitchPlayer | null = null;
  private current: MediaSource | null = null;
  private pendingPlay = false;
  private muted = false;
  private volume = 1;
  private destroyed = false;
  private mount: HTMLElement;

  constructor(host: HTMLElement) {
    super();
    this.mount = document.createElement("div");
    this.mount.id = `twitch-player-${++counter}`;
    this.mount.style.cssText = "position:absolute;inset:0;min-width:400px;min-height:300px";
    host.appendChild(this.mount);
  }

  load(source: MediaSource, startAt: number | null, autoplay: boolean) {
    this.current = source;
    this.error = null;
    this.pendingPlay = autoplay;
    if (!this.player) {
      void this.create(source, startAt, autoplay);
      return;
    }
    if (source.isLive) this.player.setChannel(source.id);
    else this.player.setVideo(`v${source.id}`, startAt ?? 0);
    if (autoplay) this.player.play();
    else this.player.pause();
  }

  private async create(source: MediaSource, startAt: number | null, autoplay: boolean) {
    try {
      await loadScript("https://player.twitch.tv/js/embed/v1.js");
      if (this.destroyed || !window.Twitch) return;
      const Twitch = window.Twitch;
      this.player = new Twitch.Player(this.mount.id, {
        width: "100%",
        height: "100%",
        ...(source.isLive ? { channel: source.id } : { video: `v${source.id}`, time: timeString(startAt ?? 0) }),
        parent: [window.location.hostname],
        autoplay,
        muted: this.muted,
      });
      this.player.addEventListener(Twitch.Player.READY, () => {
        this.ready = true;
        this.player?.setVolume(this.volume);
        this.player?.setMuted(this.muted);
        if (this.pendingPlay) this.player?.play();
        this.emit("ready");
      });
      for (const name of [Twitch.Player.PLAY, Twitch.Player.PLAYING, Twitch.Player.PAUSE, Twitch.Player.ENDED, Twitch.Player.SEEK]) {
        this.player.addEventListener(name, () => this.emit("state"));
      }
      this.player.addEventListener(Twitch.Player.PLAYBACK_BLOCKED, () => this.emit("blocked"));
      this.player.addEventListener(Twitch.Player.OFFLINE, () => {
        this.error = "This channel is offline right now.";
        this.emit("error");
      });
      this.player.addEventListener(Twitch.Player.ONLINE, () => {
        this.error = null;
        this.emit("state");
      });
    } catch {
      this.emit("error");
    }
  }

  play() {
    this.pendingPlay = true;
    this.player?.play();
  }

  pause() {
    this.pendingPlay = false;
    this.player?.pause();
  }

  seek(seconds: number) {
    if (this.current && !this.current.isLive) this.player?.seek(seconds);
  }

  getTime() {
    return this.ready && this.current && !this.current.isLive ? (this.player?.getCurrentTime() ?? 0) : 0;
  }

  getDuration() {
    return this.ready && this.current && !this.current.isLive ? (this.player?.getDuration() ?? 0) : 0;
  }

  getState(): PlayerState {
    if (!this.ready || !this.player) return "idle";
    if (this.player.getEnded()) return "ended";
    return this.player.isPaused() ? "paused" : "playing";
  }

  isLive() {
    return Boolean(this.current?.isLive);
  }

  setRate() {
    return 1;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.player?.setMuted(muted);
  }

  setVolume(volume: number) {
    this.volume = volume;
    this.player?.setVolume(volume);
  }

  destroy() {
    this.destroyed = true;
    this.mount.remove();
    this.player = null;
  }
}
