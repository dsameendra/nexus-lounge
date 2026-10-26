import { computeCorrection, expectedPosition, median, type Playback } from "@nexus/shared";
import type Hls from "hls.js";
import { isApple } from "./codecs";
import { describeMediaError } from "./local-files";
import { readSizePref, type SubtitleOption, type SubtitleSource } from "./subtitles";

const RATES = [0.95, 1.05];

export type SyncStatus = "synced" | "syncing" | "waiting";

// Where an open video comes from: a file on this computer, or an address (a torrent served by Stremio, or a link).
export type EntrySource =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string; hls: boolean; torrent?: { base: string; infoHash: string; fileIdx: number }; subs?: SubtitleSource };

// One local file in this browser: its <video>, its audio graph and the loop that keeps it on the room clock.
// The element stays at full volume and unmuted: a Web Audio source follows the element's volume, so everything
// local (volume, mute, deafen, TV) goes through the speaker gain and the live feed is never affected.
export class LocalEntry {
  readonly video = document.createElement("video");
  readonly url: string;
  error: string | null = null;
  blocked = false;
  status: SyncStatus = "syncing";
  ended = false;
  private ctx: AudioContext | null = null;
  private speakers: GainNode | null = null;
  private feed: MediaStreamAudioDestinationNode | null = null;
  private drifts: number[] = [];
  private rate = 1;
  private graceUntil = 0;
  private lastPlay = 0;
  private lastSample = 0;
  private seenUpdate = -1;
  private seekSince = 0;
  private immediate = true;
  private establishAt = 0;

  readonly streamId: string;
  readonly source: EntrySource;
  readonly file: File | null;
  hls: Hls | null = null;
  private hlsRetries = 0;
  private destroyed = false;
  subtitles: SubtitleOption[] = [];
  activeSubtitle: string | null = null;
  subtitleBusy = false;
  subtitleError: string | null = null;
  subtitleSize = readSizePref();
  private subtitleTracks = new Map<string, { element: HTMLTrackElement; url: string }>();
  private subtitleAsk = 0;

  constructor(streamId: string, source: EntrySource) {
    this.streamId = streamId;
    this.source = source;
    this.file = source.kind === "file" ? source.file : null;
    this.url = source.kind === "file" ? URL.createObjectURL(source.file) : source.url;
    const { video } = this;
    // The audio graph and the live feed both read the picture, which browsers only allow for same-origin or CORS media.
    if (source.kind === "url") video.crossOrigin = "anonymous";
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = false;
    video.style.cssText = "width:100%;height:100%;display:block;background:#000;object-fit:contain";
    video.addEventListener("error", () => {
      if (!this.hls) this.error = describeMediaError(video, source.kind === "url");
    });
    video.dataset.subSize = String(this.subtitleSize);
    this.initAudio();
  }

  addSubtitles(options: SubtitleOption[]) {
    const known = new Set(this.subtitles.map((option) => option.id));
    this.subtitles = [...this.subtitles, ...options.filter((option) => !known.has(option.id))];
  }

  setSubtitleSize(size: number) {
    this.subtitleSize = size;
    this.video.dataset.subSize = String(size);
  }

  // Shows one subtitle track (loading it the first time) or none.
  async selectSubtitle(id: string | null) {
    const ask = ++this.subtitleAsk;
    this.subtitleError = null;
    const hideAll = () => {
      for (const { element } of this.subtitleTracks.values()) element.track.mode = "disabled";
    };
    if (id === null) {
      hideAll();
      this.activeSubtitle = null;
      this.subtitleBusy = false;
      return;
    }
    const option = this.subtitles.find((item) => item.id === id);
    if (!option) return;
    try {
      let loaded = this.subtitleTracks.get(id);
      if (!loaded) {
        this.subtitleBusy = true;
        const vtt = await option.load();
        if (this.destroyed) return;
        const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
        const element = document.createElement("track");
        element.kind = "subtitles";
        element.label = option.label;
        if (option.lang) element.srclang = option.lang;
        element.src = url;
        this.video.appendChild(element);
        element.track.mode = "disabled";
        loaded = { element, url };
        this.subtitleTracks.set(id, loaded);
      }
      if (ask !== this.subtitleAsk) return;
      hideAll();
      loaded.element.track.mode = "showing";
      this.activeSubtitle = id;
    } catch (error) {
      if (ask === this.subtitleAsk) this.subtitleError = error instanceof Error ? error.message : "Couldn't load these subtitles.";
    } finally {
      if (ask === this.subtitleAsk) this.subtitleBusy = false;
    }
  }

  // Playlists go through hls.js where the browser has no native HLS (Safari has it).
  async start() {
    const { video, source } = this;
    // Safari plays HLS natively and best; everywhere else hls.js is the proven path.
    if (source.kind === "url" && source.hls && !(isApple() && video.canPlayType("application/vnd.apple.mpegurl"))) {
      const { default: HlsClass } = await import("hls.js");
      if (this.destroyed) return;
      if (!HlsClass.isSupported()) {
        this.error = "This browser can't play this kind of stream.";
        return;
      }
      const hls = new HlsClass({ maxBufferLength: 60, maxMaxBufferLength: 120, backBufferLength: 30 });
      this.hls = hls;
      hls.on(HlsClass.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR && this.hlsRetries++ < 3) hls.startLoad();
        else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR && this.hlsRetries++ < 3) hls.recoverMediaError();
        else this.error = "The stream stopped. If it is a link, it may have expired.";
      });
      hls.attachMedia(video);
      hls.loadSource(source.url);
      return;
    }
    video.src = this.url;
  }

  private initAudio() {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    try {
      const ctx = new Context();
      const source = ctx.createMediaElementSource(this.video);
      const speakers = ctx.createGain();
      speakers.gain.value = 0;
      const feed = ctx.createMediaStreamDestination();
      source.connect(speakers);
      speakers.connect(ctx.destination);
      source.connect(feed);
      Object.assign(this, { ctx, speakers, feed });
    } catch {
      this.ctx = null;
    }
  }

  get audioRunning() {
    return !this.ctx || this.ctx.state === "running";
  }

  async resumeAudio() {
    try {
      await this.ctx?.resume();
    } catch {}
  }

  // 0 to 1; what this device's speakers play.
  setSpeakerGain(gain: number) {
    if (this.speakers) this.speakers.gain.value = gain;
    else {
      this.video.volume = gain;
      this.video.muted = gain === 0;
    }
  }

  setFit(fit: "fit" | "fill") {
    this.video.style.objectFit = fit === "fill" ? "cover" : "contain";
  }

  get hasFeedAudio() {
    return Boolean(this.feed);
  }

  feedAudioTrack() {
    return this.feed?.stream.getAudioTracks()[0] ?? null;
  }

  // Native capture where the browser has it, otherwise draw frames to a canvas (Safari).
  captureVideo() {
    const video = this.video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const native = video.captureStream ?? video.mozCaptureStream;
    if (native) {
      const track = native.call(video).getVideoTracks()[0];
      if (track) return { track, stop: () => track.stop() };
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.captureStream !== "function") throw new Error("This browser can't share a video file");
    let running = true;
    const draw = () => {
      if (!running) return;
      if (canvas.width !== video.videoWidth && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (typeof video.requestVideoFrameCallback === "function") video.requestVideoFrameCallback(draw);
      else setTimeout(draw, 33);
    };
    draw();
    const track = canvas.captureStream(30).getVideoTracks()[0]!;
    return {
      track,
      stop: () => {
        running = false;
        track.stop();
      },
    };
  }

  // Called a few times a second with the room's playback state.
  tick(playback: Playback, serverNow: number, establish: ((position: number) => void) | null) {
    const { video } = this;
    const now = Date.now();
    if (this.error || video.error || video.readyState < 1) return;

    const want = playback.playing;
    const expected = expectedPosition(playback, serverNow);
    if (expected === null) {
      this.status = "waiting";
      if (establish && now - this.establishAt > 3000) {
        this.establishAt = now;
        establish(Math.max(0, video.currentTime));
      }
      return;
    }

    const length = video.duration;
    if (Number.isFinite(length) && expected >= length - 0.5) {
      if (!video.paused) video.pause();
      this.ended = true;
      this.status = "synced";
      return;
    }
    this.ended = false;

    if (playback.updatedAt !== this.seenUpdate) {
      this.seenUpdate = playback.updatedAt;
      this.drifts = [];
      this.seekSince = 0;
      this.immediate = true;
    }

    if (want && video.paused && now - this.lastPlay > 1200) {
      this.lastPlay = now;
      video.play().then(
        () => {
          this.blocked = false;
        },
        () => {
          this.blocked = true;
        },
      );
    }
    if (!want && !video.paused) video.pause();
    if (!want) this.blocked = false;

    if (video.seeking || (want && video.readyState < 3)) {
      this.drifts = [];
      this.graceUntil = Math.max(this.graceUntil, now + 1500);
      this.status = "syncing";
      return;
    }
    if (now < this.graceUntil) return;
    if (!this.immediate && now - this.lastSample < 350) return;
    this.lastSample = now;

    const target = Number.isFinite(length) ? Math.min(expected, length) : expected;
    this.drifts.push(video.currentTime - target);
    if (this.drifts.length > 5) this.drifts.shift();
    if (this.drifts.length < (this.immediate ? 1 : 3)) return;

    const drift = median(this.drifts);
    this.status = Math.abs(drift) < 1 ? "synced" : "syncing";
    const correction = computeCorrection(drift, { playing: want, currentRate: this.rate, rates: RATES });

    if (correction.kind === "seek") {
      if (this.seekSince === 0) this.seekSince = now;
      if (this.immediate || Math.abs(drift) > 5 || now - this.seekSince >= 1200) {
        video.currentTime = target;
        video.playbackRate = 1;
        Object.assign(this, { rate: 1, graceUntil: now + 2500, drifts: [], seekSince: 0, immediate: false });
      }
      return;
    }
    this.seekSince = 0;
    this.immediate = false;
    if (correction.kind === "rate" && this.rate !== correction.rate) {
      video.playbackRate = correction.rate;
      this.rate = correction.rate;
    } else if (correction.kind === "reset-rate" && this.rate !== 1) {
      video.playbackRate = 1;
      this.rate = 1;
    }
  }

  play() {
    this.video.play().then(
      () => {
        this.blocked = false;
      },
      () => {},
    );
  }

  resync() {
    this.drifts = [];
    this.immediate = true;
    this.graceUntil = 0;
  }

  destroy() {
    this.destroyed = true;
    for (const { url } of this.subtitleTracks.values()) URL.revokeObjectURL(url);
    this.subtitleTracks.clear();
    const { video } = this;
    video.pause();
    this.hls?.destroy();
    this.hls = null;
    video.removeAttribute("src");
    video.load();
    video.remove();
    if (this.source.kind === "file") URL.revokeObjectURL(this.url);
    void this.ctx?.close().catch(() => {});
  }
}

// Open files outlive the voice connection (it can be rebuilt without leaving the room); they end when the room does.
export const registry = new Map<string, LocalEntry>();

export function destroyAllEntries() {
  for (const entry of registry.values()) entry.destroy();
  registry.clear();
}
