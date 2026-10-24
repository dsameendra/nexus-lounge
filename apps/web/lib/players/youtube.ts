import type { MediaSource } from "@nexus/shared";
import { loadScript } from "../load-script";
import { Emitter, type CaptionState, type PlayerAdapter, type PlayerState, type QualityOption } from "./types";

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
  loadModule?(module: string): void;
  unloadModule?(module: string): void;
  getOption?(module: string, option: string): unknown;
  setOption?(module: string, option: string, value: unknown): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: { onReady: () => void; onStateChange: () => void; onError: (event: { data: number }) => void };
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

const YT_ERRORS: Record<number, string> = {
  2: "That YouTube link isn't valid.",
  5: "YouTube couldn't play this video in the embedded player.",
  100: "This video was removed or is private.",
  101: "The owner of this video doesn't allow it to be played outside YouTube.",
  150: "The owner of this video doesn't allow it to be played outside YouTube.",
};

const STATES: Record<number, PlayerState> = { [-1]: "idle", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "paused" };

interface CaptionPrefs {
  on: boolean;
  lang: string | null;
  size: number;
}

const CAPTION_KEY = "nexus-captions";

function loadCaptionPrefs(): CaptionPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(CAPTION_KEY) ?? "{}") as Partial<CaptionPrefs>;
    return { on: Boolean(raw.on), lang: typeof raw.lang === "string" ? raw.lang : null, size: Number.isFinite(raw.size) ? Number(raw.size) : 0 };
  } catch {
    return { on: false, lang: null, size: 0 };
  }
}

export class YouTubeAdapter extends Emitter implements PlayerAdapter {
  readonly type = "youtube" as const;
  ready = false;
  error: string | null = null;
  readonly qualityNote = "YouTube chooses the quality automatically for embedded videos.";
  private player: YTPlayer | null = null;
  private wanted: { source: MediaSource; startAt: number | null; autoplay: boolean } | null = null;
  private destroyed = false;
  private volume = 1;
  private muted = false;
  private captionPrefs = loadCaptionPrefs();
  private captionsReadyFor: string | null = null;
  private currentId: string | null = null;

  private host: HTMLElement;

  constructor(host: HTMLElement) {
    super();
    this.host = host;
    void this.init();
  }

  get rates() {
    const available = this.ready ? this.safe(() => this.player?.getAvailablePlaybackRates?.()) : undefined;
    return (available ?? []).filter((rate) => rate !== 1 && rate >= 0.75 && rate <= 1.25);
  }

  private safe<T>(action: () => T): T | undefined {
    if (!this.ready || !this.player || this.destroyed) return undefined;
    try {
      return action();
    } catch {
      return undefined;
    }
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
          cc_load_policy: this.captionPrefs.on ? 1 : 0,
          ...(this.captionPrefs.lang ? { cc_lang_pref: this.captionPrefs.lang } : {}),
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ready = true;
            this.applyAudio();
            this.applyWanted();
            this.emit("ready");
          },
          onStateChange: () => {
            this.prepareCaptions();
            this.emit("state");
          },
          onError: (event) => {
            this.error = YT_ERRORS[event.data] ?? "This video couldn't be played.";
            this.emit("error");
          },
        },
      });
    } catch {
      this.error = "Couldn't load the YouTube player. Check your connection or ad blocker.";
      this.emit("error");
    }
  }

  private applyAudio() {
    this.safe(() => {
      if (this.muted) {
        this.player!.mute();
        return;
      }
      this.player!.unMute();
      this.player!.setVolume(Math.round(this.volume * 100));
    });
  }

  private applyWanted() {
    if (!this.player || !this.ready || !this.wanted) return;
    const { source, startAt, autoplay } = this.wanted;
    this.wanted = null;
    this.currentId = source.id;
    this.captionsReadyFor = null;
    this.error = null;
    const options = { videoId: source.id, ...(startAt !== null ? { startSeconds: startAt } : {}) };
    this.safe(() => (autoplay ? this.player!.loadVideoById(options) : this.player!.cueVideoById(options)));
  }

  load(source: MediaSource, startAt: number | null, autoplay: boolean) {
    this.wanted = { source, startAt, autoplay };
    this.applyWanted();
  }

  private prepareCaptions() {
    if (!this.ready || !this.currentId || this.captionsReadyFor === this.currentId) return;
    const state = this.safe(() => this.player!.getPlayerState());
    if (state !== 1 && state !== 2) return;
    this.captionsReadyFor = this.currentId;
    this.safe(() => {
      this.player!.loadModule?.("captions");
      this.player!.setOption?.("captions", "fontSize", this.captionPrefs.size);
    });
    setTimeout(() => this.applyCaptionPreference(), 700);
  }

  private applyCaptionPreference() {
    const tracks = this.readTracks();
    if (tracks.length === 0) return;
    const wanted = this.captionPrefs.on ? (tracks.find((track) => track.id === this.captionPrefs.lang) ?? null) : null;
    if (this.captionPrefs.on && wanted) this.setCaptionTrack(wanted.id, false);
    else if (!this.captionPrefs.on) this.setCaptionTrack(null, false);
    this.emit("state");
  }

  private readTracks(): QualityOption[] {
    const raw = this.safe(() => this.player!.getOption?.("captions", "tracklist"));
    if (!Array.isArray(raw)) return [];
    const options: QualityOption[] = [];
    for (const entry of raw as { languageCode?: string; languageName?: string; displayName?: string; kind?: string }[]) {
      const code = entry.languageCode;
      if (!code) continue;
      const auto = entry.kind === "asr";
      const label = `${entry.displayName ?? entry.languageName ?? code}${auto && !/auto/i.test(entry.displayName ?? "") ? " (auto-generated)" : ""}`;
      const existing = options.findIndex((option) => option.id === code);
      if (existing === -1) options.push({ id: code, label });
      else if (!auto) options[existing] = { id: code, label };
    }
    return options;
  }

  captions(): CaptionState | null {
    if (!this.ready) return null;
    const tracks = this.readTracks();
    if (tracks.length === 0) return null;
    const current = this.safe(() => this.player!.getOption?.("captions", "track")) as { languageCode?: string } | undefined;
    const active = this.captionPrefs.on && current?.languageCode && tracks.some((track) => track.id === current.languageCode) ? current.languageCode : null;
    return { tracks, active, size: this.captionPrefs.size };
  }

  setCaptionTrack(id: string | null, remember = true) {
    this.safe(() => {
      if (id === null) {
        this.player!.setOption?.("captions", "track", {});
        this.player!.unloadModule?.("captions");
      } else {
        this.player!.loadModule?.("captions");
        this.player!.setOption?.("captions", "track", { languageCode: id });
        this.player!.setOption?.("captions", "fontSize", this.captionPrefs.size);
      }
    });
    if (!remember) return;
    this.captionPrefs = { ...this.captionPrefs, on: id !== null, lang: id ?? this.captionPrefs.lang };
    this.saveCaptionPrefs();
  }

  setCaptionSize(size: number) {
    this.captionPrefs = { ...this.captionPrefs, size };
    this.safe(() => this.player!.setOption?.("captions", "fontSize", size));
    this.saveCaptionPrefs();
  }

  private saveCaptionPrefs() {
    try {
      localStorage.setItem(CAPTION_KEY, JSON.stringify(this.captionPrefs));
    } catch {}
  }

  play() {
    this.safe(() => this.player!.playVideo());
  }

  pause() {
    this.safe(() => this.player!.pauseVideo());
  }

  seek(seconds: number) {
    this.safe(() => this.player!.seekTo(seconds, true));
  }

  getTime() {
    return this.safe(() => this.player!.getCurrentTime()) ?? 0;
  }

  getDuration() {
    return this.safe(() => this.player!.getDuration()) ?? 0;
  }

  getState(): PlayerState {
    if (!this.ready || !this.player || this.wanted) return "idle";
    const state = this.safe(() => this.player!.getPlayerState());
    return state === undefined ? "idle" : (STATES[state] ?? "idle");
  }

  isLive() {
    return Boolean(this.safe(() => this.player!.getVideoData()?.isLive));
  }

  setRate(rate: number) {
    this.safe(() => this.player!.setPlaybackRate(rate));
    return this.ready ? rate : 1;
  }

  qualities() {
    return [];
  }

  quality() {
    return "auto";
  }

  setQuality() {}

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyAudio();
  }

  setVolume(volume: number) {
    this.volume = volume;
    this.applyAudio();
  }

  destroy() {
    this.destroyed = true;
    try {
      this.player?.destroy();
    } catch {}
    this.player = null;
  }
}
