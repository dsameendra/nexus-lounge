import type { MediaSource } from "@nexus/shared";
import { loadScript } from "../load-script";
import { Emitter, type PlayerAdapter, type PlayerState, type QualityOption } from "./types";

const QUALITY_KEY = "nexus-twitch-quality";

function readPreferredQuality() {
  try {
    return localStorage.getItem(QUALITY_KEY);
  } catch {
    return null;
  }
}

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
  getMuted(): boolean;
  getQualities?(): (string | { name?: string; group?: string })[];
  getQuality?(): string | { name?: string; group?: string };
  setQuality?(quality: string): void;
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
  private playedOnce = false;
  private playTimer: ReturnType<typeof setInterval> | undefined;
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
    this.playedOnce = false;
    this.pendingPlay = autoplay;
    if (!this.player) {
      void this.create(source, startAt, autoplay);
      return;
    }
    if (autoplay) this.player.setMuted(true);
    if (source.isLive) this.player.setChannel(source.id);
    else this.player.setVideo(`v${source.id}`, startAt ?? 0);
    if (autoplay) {
      this.player.play();
      this.ensurePlaying();
    } else {
      this.player.pause();
    }
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
        muted: true,
      });
      this.player.addEventListener(Twitch.Player.READY, () => {
        this.ready = true;
        const frame = this.mount.querySelector("iframe");
        frame?.setAttribute("allowfullscreen", "");
        frame?.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
        this.player?.setVolume(this.volume);
        if (this.pendingPlay) {
          this.player?.play();
          this.ensurePlaying();
        }
        this.emit("ready");
      });
      this.player.addEventListener(Twitch.Player.PLAYING, () => {
        this.playedOnce = true;
        this.player?.setMuted(this.muted);
        this.applyPreferredQuality();
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
      this.error = "Couldn't load the Twitch player. Check your connection or ad blocker.";
      this.emit("error");
    }
  }

  private ensurePlaying() {
    clearInterval(this.playTimer);
    let attempts = 0;
    this.playTimer = setInterval(() => {
      attempts += 1;
      const player = this.player;
      if (!player || !this.ready || !this.pendingPlay || attempts > 14 || !player.isPaused()) {
        clearInterval(this.playTimer);
        return;
      }
      player.play();
    }, 500);
  }

  play() {
    this.pendingPlay = true;
    if (this.ready) this.player?.play();
  }

  pause() {
    this.pendingPlay = false;
    if (this.ready) this.player?.pause();
  }

  seek(seconds: number) {
    if (this.ready && this.current && !this.current.isLive) this.player?.seek(seconds);
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

  qualities(): QualityOption[] {
    if (!this.ready || !this.player?.getQualities) return [];
    const options: QualityOption[] = [];
    for (const raw of this.player.getQualities()) {
      const id = typeof raw === "string" ? raw : (raw.group ?? raw.name);
      const label = typeof raw === "string" ? raw : (raw.name ?? raw.group);
      if (id && label && !options.some((option) => option.id === id)) options.push({ id, label: id === "auto" ? "Auto" : label });
    }
    if (options.length > 0 && !options.some((option) => option.id === "auto")) options.unshift({ id: "auto", label: "Auto" });
    return options;
  }

  quality() {
    if (!this.ready || !this.player?.getQuality) return "auto";
    const raw = this.player.getQuality();
    return typeof raw === "string" ? raw : (raw.group ?? raw.name ?? "auto");
  }

  setQuality(id: string) {
    this.player?.setQuality?.(id);
    try {
      localStorage.setItem(QUALITY_KEY, id);
    } catch {}
  }

  private applyPreferredQuality() {
    const preferred = readPreferredQuality();
    if (preferred && preferred !== this.quality() && this.qualities().some((option) => option.id === preferred)) {
      this.player?.setQuality?.(preferred);
    }
  }

  get muteBlocked() {
    return this.ready && this.playedOnce && !this.muted && Boolean(this.player?.getMuted());
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (!this.playedOnce) return;
    this.player?.setMuted(muted);
    if (!muted) this.player?.setVolume(this.volume);
  }

  setVolume(volume: number) {
    this.volume = volume;
    if (this.ready) this.player?.setVolume(volume);
  }

  destroy() {
    clearInterval(this.playTimer);
    this.destroyed = true;
    this.mount.remove();
    this.player = null;
  }
}
