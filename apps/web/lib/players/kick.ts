import type { MediaSource } from "@nexus/shared";
import { Emitter, type PlayerAdapter, type PlayerState, type QualityOption } from "./types";

// Kick's embed (player.kick.com/<channel>) takes only autoplay and muted in its address and has no scripting API, so
// this adapter can show the channel and mute it by reloading, nothing else: Kick's own controls do the rest.
export class KickAdapter extends Emitter implements PlayerAdapter {
  readonly type = "kick" as const;
  readonly rates: number[] = [];
  ready = false;
  error: string | null = null;
  private frame: HTMLIFrameElement | null = null;
  private current: MediaSource | null = null;
  private shownMuted: boolean | null = null;
  private muted: boolean;
  private destroyed = false;
  private host: HTMLElement;

  constructor(host: HTMLElement, muted: boolean) {
    super();
    this.host = host;
    this.muted = muted;
  }

  load(source: MediaSource, _startAt: number | null, autoplay: boolean) {
    this.current = source;
    this.error = null;
    this.ready = false;
    this.show(autoplay);
  }

  private show(autoplay: boolean) {
    if (this.destroyed || !this.current) return;
    this.frame?.remove();
    const frame = document.createElement("iframe");
    frame.title = `Kick: ${this.current.id}`;
    frame.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:0;background:#000";
    this.shownMuted = this.muted;
    frame.addEventListener("load", () => {
      if (this.frame !== frame || this.destroyed) return;
      this.ready = true;
      this.emit("ready");
    });
    frame.src = `https://player.kick.com/${encodeURIComponent(this.current.id)}?autoplay=${autoplay}&muted=${this.muted}`;
    this.frame = frame;
    this.host.appendChild(frame);
  }

  play() {}
  pause() {}
  seek() {}

  getTime() {
    return 0;
  }

  getDuration() {
    return 0;
  }

  getState(): PlayerState {
    return this.ready ? "playing" : "idle";
  }

  isLive() {
    return true;
  }

  setRate() {
    return 1;
  }

  qualities(): QualityOption[] {
    return [];
  }

  quality() {
    return "auto";
  }

  setQuality() {}

  // The embed only learns about sound from its address, so a change reloads it (a short rebuffer, but the viewer asked).
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.frame && this.shownMuted !== muted) this.show(true);
  }

  setVolume() {}

  destroy() {
    this.destroyed = true;
    this.frame?.remove();
    this.frame = null;
  }
}
