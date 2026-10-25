"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SILENT_BELOW, atLiveEdge, computeCorrection, expectedPosition, isDeviceSource, isSilent, liveEdgeTarget, median, sliderToGain, type Stream } from "@nexus/shared";
import { YouTubeAdapter } from "@/lib/players/youtube";
import { TwitchAdapter } from "@/lib/players/twitch";
import type { PlayerAdapter } from "@/lib/players/types";
import { PlayIcon } from "./Icons";
import { PlayerControls, type SyncStatus } from "./PlayerControls";
import { useRoom } from "./RoomProvider";
import { StreamArt } from "./StreamArt";
import { openTvSheet, useAppleAirPlaySupport } from "./useAirPlay";
import { COMPACT_SCREEN, PHONE_LANDSCAPE, hasElementFullscreen, useMediaQuery } from "./useMediaQuery";
import { isTypingTarget } from "@nexus/shared";
import { FullscreenIcon } from "./Icons";
import { useVideoFit } from "./useVideoFit";
import { useTvOutput } from "./useTvOutput";

function sourceUrl(stream: Stream) {
  const { type, id, isLive } = stream.source;
  if (type === "youtube") return `https://www.youtube.com/watch?v=${id}`;
  return isLive ? `https://www.twitch.tv/${id}` : `https://www.twitch.tv/videos/${id}`;
}

type Provider = "youtube" | "twitch";
type PlayableStream = Stream & { source: { type: Provider } };

// Local files have their own player; the embedded YouTube/Twitch players only ever see their own sources.
function playable(stream: Stream | null) {
  return stream && !isDeviceSource(stream.source) ? (stream as PlayableStream) : null;
}

interface UiState {
  status: SyncStatus;
  blocked: boolean;
  loading: boolean;
  playing: boolean;
  time: number;
  duration: number;
  live: boolean;
  atEdge: boolean;
  error: string | null;
  qualityCount: number;
  qualityValue: string;
  captionKey: string;
  muteBlocked: boolean;
  ended: boolean;
  endedFor: string | null;
  stalled: boolean;
  debug: string;
}

export const VOLUME_KEY = "nexus-player-volume";

export function loadVolume() {
  try {
    const raw = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "{}") as { volume?: number; muted?: boolean };
    const volume = Number(raw.volume ?? 1);
    return { volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1, muted: Boolean(raw.muted) };
  } catch {
    return { volume: 1, muted: false };
  }
}

function captionKeyOf(adapter: PlayerAdapter) {
  const captions = adapter.captions?.();
  return captions ? `${captions.tracks.map((track) => track.id).join(",")}|${captions.active ?? ""}|${captions.size}` : "";
}

function applyVolume(adapter: PlayerAdapter | undefined, volume: number, muted: boolean) {
  if (!adapter) return;
  adapter.setVolume(sliderToGain(volume));
  adapter.setMuted(muted || isSilent(volume));
}

const INITIAL_UI: UiState = { status: "syncing", blocked: false, loading: true, playing: false, time: 0, duration: 0, live: false, atEdge: false, error: null, qualityCount: 0, qualityValue: "auto", captionKey: "", muteBlocked: false, ended: false, endedFor: null, stalled: false, debug: "" };

export function StreamPlayer({
  stream: incoming,
  visible,
  onFullscreen,
  bare = false,
  fullscreen = false,
  controlsSlot = null,
}: {
  stream: Stream | null;
  visible: boolean;
  onFullscreen: () => void;
  bare?: boolean;
  fullscreen?: boolean;
  controlsSlot?: HTMLElement | null;
}) {
  const stream = playable(incoming);
  const canFullscreen = true;
  const appleAirPlay = useAppleAirPlaySupport();
  const { clock, send, canControlStream, state: roomState, isController } = useRoom();
  const advancedFor = useRef<string | null>(null);
  const canControlRef = useRef(canControlStream);
  const compactScreen = useMediaQuery(COMPACT_SCREEN);
  const phoneLand = useMediaQuery(PHONE_LANDSCAPE);
  const { fit, toggle: toggleFit } = useVideoFit();
  const { mode: outputMode, localSound, setSound } = useTvOutput();
  const [ripple, setRipple] = useState<{ zone: "left" | "right"; key: number } | null>(null);
  const lastTap = useRef({ time: 0, zone: "" });
  const touchAt = useRef(0);
  const hostRefs = { youtube: useRef<HTMLDivElement>(null), twitch: useRef<HTMLDivElement>(null) };
  const adapters = useRef<Partial<Record<Provider, PlayerAdapter>>>({});
  const mem = useRef({
    loadedId: null as string | null,
    loadedAt: 0,
    graceUntil: 0,
    lastPlayCmd: 0,
    wantSince: 0,
    lastWant: false,
    rate: 1,
    establishAt: 0,
    waitSince: 0,
    seenUpdate: 0,
    drifts: [] as number[],
    lastSample: 0,
    seekSince: 0,
    immediate: false,
    learn: false,
    lead: { youtube: 0.5, twitch: 1 } as Record<Provider, number>,
  });
  const debugRef = useRef(typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug"));
  const [initialVolume] = useState(loadVolume);
  const latest = useRef({ stream, visible, volume: initialVolume.volume, muted: initialVolume.muted });
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [volume, setVolume] = useState(initialVolume.volume);
  const [muted, setMuted] = useState(initialVolume.muted);
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const silenced = muted || !localSound;
  useEffect(() => {
    latest.current = { stream, visible, volume, muted: silenced };
    canControlRef.current = canControlStream;
  });

  const patch = useCallback((next: Partial<UiState>) => {
    setUi((prev) => ((Object.keys(next) as (keyof UiState)[]).every((key) => prev[key] === next[key]) ? prev : { ...prev, ...next }));
  }, []);

  const ensureAdapter = useCallback(
    (type: Provider) => {
      let adapter = adapters.current[type];
      const host = hostRefs[type].current;
      if (!adapter && host) {
        adapter = type === "youtube" ? new YouTubeAdapter(host, !hasElementFullscreen() && !(latest.current.stream && canControlRef.current(latest.current.stream))) : new TwitchAdapter(host);
        adapter.subscribe((event) => {
          if (event === "blocked") patch({ blocked: true });
        });
        adapters.current[type] = adapter;
      }
      return adapter;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch],
  );

  const resetTwitch = useCallback(() => {
    const existing = adapters.current.twitch;
    if (!existing) return;
    existing.destroy();
    delete adapters.current.twitch;
  }, []);

  const tick = useCallback(() => {
    const { stream, visible, volume, muted } = latest.current;
    const m = mem.current;

    for (const type of ["youtube", "twitch"] as const) {
      const other = adapters.current[type];
      const inactive = !stream || !visible || stream.source.type !== type;
      if (type === "twitch" && other && inactive) {
        resetTwitch();
        continue;
      }
      if (other?.ready && inactive && other.getState() === "playing") other.pause();
    }
    if (!stream || !visible) return;

    if (stream.source.type === "twitch" && m.loadedId !== null && m.loadedId !== stream.id) resetTwitch();

    const adapter = ensureAdapter(stream.source.type);
    if (!adapter || !clock.ready || (!adapter.ready && stream.source.type === "youtube")) {
      if (m.waitSince === 0) m.waitSince = Date.now();
      patch({ loading: true, error: adapter?.error ?? null, stalled: Date.now() - m.waitSince > 10000 });
      return;
    }

    const now = Date.now();
    const playback = stream.playback;
    const syncable = !(stream.source.type === "twitch" && stream.source.isLive);

    if (m.loadedId !== stream.id) {
      const expected = syncable ? expectedPosition(playback, clock.now()) : null;
      const lead = playback.playing ? m.lead[stream.source.type] : 0;
      Object.assign(m, {
        loadedId: stream.id,
        loadedAt: now,
        graceUntil: now + 4000,
        rate: 1,
        wantSince: now,
        lastWant: true,
        drifts: [],
        seekSince: 0,
        immediate: false,
        learn: false,
        seenUpdate: playback.updatedAt,
      });
      applyVolume(adapter, volume, muted);
      adapter.load(stream.source, expected === null ? null : expected + lead, syncable ? playback.playing : true);
      patch({ loading: true, blocked: false, time: 0, duration: 0, ended: false, endedFor: null });
      return;
    }

    if (!adapter.ready) {
      if (m.waitSince === 0) m.waitSince = now;
      patch({ loading: true, error: adapter.error, stalled: now - m.waitSince > 10000 });
      return;
    }
    m.waitSince = 0;

    const state = adapter.getState();
    const live = adapter.isLive() || stream.source.isLive;
    const stalled = state === "idle" && !adapter.error && now - m.loadedAt > 8000;
    patch({ playing: state === "playing" || state === "buffering", loading: state === "idle", live, error: adapter.error, stalled, muteBlocked: Boolean(adapter.muteBlocked), qualityCount: adapter.qualities().length, qualityValue: adapter.quality(), captionKey: captionKeyOf(adapter) });
    if (debugRef.current) {
      const exp = syncable ? expectedPosition(playback, clock.now()) : null;
      patch({
        debug: `${stream.id} | state=${state} ready=${adapter.ready} | want=${playback.playing} pos=${playback.position?.toFixed(1) ?? "null"} | expected=${exp?.toFixed(1) ?? "-"} actual=${adapter.getTime().toFixed(1)} | rate=${m.rate} rates=[${adapter.rates.join(",")}] lead=${m.lead[stream.source.type].toFixed(2)} drifts=[${m.drifts.map((d) => d.toFixed(2)).join(",")}] | clock=${clock.ready} off=${Math.round(clock.offset)}ms`,
      });
    }

    if (!syncable) {
      patch(state === "playing" ? { status: "unsynced", blocked: false } : { status: "unsynced" });
      return;
    }

    const want = playback.playing;
    if (want !== m.lastWant) {
      m.lastWant = want;
      m.wantSince = now;
    }

    const expected = expectedPosition(playback, clock.now());

    const length = adapter.getDuration();
    const past = !live && length > 0 && expected !== null && expected >= length - 0.5;
    if (past) {
      if (state === "playing") adapter.pause();
      patch({ ended: true, endedFor: stream.id, blocked: false, status: "synced" });
      return;
    }
    patch({ ended: false, endedFor: null });

    if (want && state === "paused" && now - m.lastPlayCmd > 1200) {
      adapter.play();
      m.lastPlayCmd = now;
    }
    if (!want && state === "playing") adapter.pause();

    if (want && state !== "playing" && state !== "buffering" && now - m.wantSince > 3500) patch({ blocked: true });
    else if (state === "playing" || !want) patch({ blocked: false });

    if (expected === null) {
      patch({ status: "waiting" });
      if (now - m.loadedAt > 1500 && now - m.establishAt > 3000 && (state === "playing" || state === "paused")) {
        m.establishAt = now;
        send({ type: "stream.establish", streamId: stream.id, position: Math.max(0, adapter.getTime()) });
      }
      return;
    }

    if (playback.updatedAt !== m.seenUpdate) {
      m.seenUpdate = playback.updatedAt;
      m.drifts = [];
      m.seekSince = 0;
      m.immediate = true;
    }

    if (state === "buffering" || state === "idle" || state === "ended") {
      m.drifts = [];
      m.graceUntil = Math.max(m.graceUntil, now + 1500);
      patch({ status: "syncing" });
      return;
    }
    if (now < m.graceUntil) {
      patch({ status: "syncing" });
      return;
    }
    if (now - m.lastSample < 350) return;
    m.lastSample = now;

    const duration = adapter.getDuration();
    const target = duration > 0 ? Math.min(expected, duration) : expected;
    m.drifts.push(adapter.getTime() - target);
    if (m.drifts.length > 5) m.drifts.shift();
    if (m.drifts.length < (m.immediate ? 1 : 3)) return;

    const drift = median(m.drifts);
    patch({ status: Math.abs(drift) < 1 ? "synced" : "syncing" });

    if (m.learn) {
      m.learn = false;
      const type = stream.source.type;
      m.lead[type] = Math.min(3, Math.max(0, m.lead[type] - drift * 0.7));
    }

    const correction = computeCorrection(drift, { playing: want, currentRate: m.rate, rates: adapter.rates });

    if (correction.kind === "seek") {
      if (m.seekSince === 0) m.seekSince = now;
      const urgent = m.immediate || Math.abs(drift) > 5;
      if (urgent || now - m.seekSince >= 1200) {
        adapter.seek(target + (want ? m.lead[stream.source.type] : 0));
        if (m.rate !== 1) adapter.setRate(1);
        Object.assign(m, { graceUntil: now + 3500, rate: 1, drifts: [], seekSince: 0, immediate: false, learn: want });
      }
      return;
    }

    m.seekSince = 0;
    m.immediate = false;
    if (correction.kind === "rate" && m.rate !== correction.rate) {
      adapter.setRate(correction.rate);
      m.rate = correction.rate;
    } else if (correction.kind === "reset-rate" && m.rate !== 1) {
      adapter.setRate(1);
      m.rate = 1;
    }
  }, [clock, ensureAdapter, patch, resetTwitch, send]);

  useEffect(() => {
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    tick();
  }, [stream?.id, stream?.playback, visible, tick]);

  useEffect(() => {
    if (!ui.ended) {
      advancedFor.current = null;
      return;
    }
    if (!stream || ui.endedFor !== stream.id || bare || !isController) return;
    if (stream.id !== roomState.featuredId || !roomState.room.settings.autoplayNext) return;
    if (advancedFor.current === stream.id) return;
    advancedFor.current = stream.id;
    send({ type: "queue.advance", fromStreamId: stream.id });
  }, [ui.ended, ui.endedFor, stream, bare, isController, roomState.featuredId, roomState.room.settings.autoplayNext, send]);

  useEffect(() => {
    for (const adapter of Object.values(adapters.current)) applyVolume(adapter, volume, silenced);
  }, [volume, silenced]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume, muted }));
    } catch {}
  }, [volume, muted]);

  function toggleMute() {
    if (!localSound && outputMode === "both") {
      setSound(true);
      setMuted(false);
      return;
    }
    setMuted((value) => !value);
  }

  useEffect(() => {
    if (!visible || !stream) return;
    const id = setInterval(() => {
      const adapter = adapters.current[stream.source.type];
      if (!adapter?.ready) return;
      const time = adapter.getTime();
      const duration = adapter.getDuration();
      patch({ time: Math.floor(time * 2) / 2, duration: Math.floor(duration), atEdge: atLiveEdge(time, duration) });
    }, 500);
    return () => clearInterval(id);
  }, [visible, stream, patch]);

  useEffect(() => {
    const current = adapters.current;
    const memory = mem.current;
    return () => {
      for (const type of Object.keys(current) as Provider[]) {
        current[type]?.destroy();
        delete current[type];
      }
      memory.loadedId = null;
      memory.waitSince = 0;
      clearTimeout(hideTimer.current);
    };
  }, []);

  const revealControls = useCallback(() => {
    setControlsShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsShown(false), 3000);
  }, []);

  useEffect(() => {
    revealControls();
  }, [stream?.id, revealControls]);

  const activeAdapter = stream ? adapters.current[stream.source.type] : undefined;
  const syncable = Boolean(stream && !(stream.source.type === "twitch" && stream.source.isLive));
  const canControl = Boolean(stream && syncable && canControlStream(stream));
  const isTwitch = stream?.source.type === "twitch";
  const ytNative = Boolean(stream?.source.type === "youtube" && (activeAdapter as YouTubeAdapter | undefined)?.native);
  const overlayControls = !isTwitch && !ytNative && (fullscreen || compactScreen);
  const hideBar = phoneLand && !fullscreen && (isTwitch || ytNative);
  const fillable = (fullscreen || phoneLand) && !isTwitch && !ytNative;
  const filling = fillable && fit === "fill";
  const showControls = controlsShown || !ui.playing || ui.blocked;

  function togglePlay() {
    if (!stream) return;
    if (!syncable) {
      if (ui.playing) activeAdapter?.pause();
      else activeAdapter?.play();
      return;
    }
    if (ui.ended) {
      send({ type: "stream.control", streamId: stream.id, action: "play", position: 0 });
      return;
    }
    const expected = expectedPosition(stream.playback, clock.now());
    send({ type: "stream.control", streamId: stream.id, action: stream.playback.playing ? "pause" : "play", position: expected });
  }

  function resync() {
    if (!stream || !activeAdapter) return;
    const expected = expectedPosition(stream.playback, clock.now());
    if (expected !== null) activeAdapter.seek(expected);
    mem.current.graceUntil = Date.now() + 3500;
    mem.current.drifts = [];
    if (stream.playback.playing) activeAdapter.play();
  }

  function goLive() {
    if (!stream || !activeAdapter) return;
    if (!syncable) {
      activeAdapter.play();
      return;
    }
    const duration = activeAdapter.getDuration();
    if (canControl && duration > 0) {
      send({ type: "stream.control", streamId: stream.id, action: "play", position: liveEdgeTarget(duration) });
    } else {
      resync();
    }
  }

  function retry() {
    if (stream?.source.type === "twitch") resetTwitch();
    mem.current.loadedId = null;
    patch({ stalled: false, error: null, loading: true });
  }

  function startPlayback() {
    patch({ blocked: false });
    mem.current.wantSince = Date.now();
    activeAdapter?.play();
  }

  const showBar = !hideBar;

  const twitchNote =
    stream && isTwitch
      ? ui.error
        ? ui.error
        : ui.ended
          ? "This broadcast has ended."
          : ui.muteBlocked
            ? "Sound is off. Click the video once to turn it on."
            : ui.blocked || ui.stalled
              ? "Click the play button inside the video to start."
              : null
      : null;

  function seekBy(delta: number) {
    if (!stream || !canControl || stream.playback.position === null) return;
    const base = expectedPosition(stream.playback, clock.now()) ?? ui.time;
    const duration = ui.duration > 0 ? ui.duration : Infinity;
    send({ type: "stream.control", streamId: stream.id, action: "seek", position: Math.min(duration, Math.max(0, base + delta)) });
  }

  function handleTouchTap(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    touchAt.current = Date.now();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const zone = x < 0.33 ? "left" : x > 0.67 ? "right" : "center";
    const now = Date.now();
    const double = now - lastTap.current.time < 350 && lastTap.current.zone === zone;
    lastTap.current = { time: double ? 0 : now, zone };
    if (!double) {
      revealControls();
      return;
    }
    if (zone === "center") {
      onFullscreen();
      return;
    }
    if (!canControl) return;
    seekBy(zone === "left" ? -10 : 10);
    setRipple({ zone, key: now });
    setTimeout(() => setRipple((current) => (current?.key === now ? null : current)), 650);
  }

  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    shortcuts.current = (event) => {
      if (bare || !stream || !visible || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target?.tagName, Boolean(target?.isContentEditable))) return;
      if (target?.closest("[role=dialog],[role=slider],input,select,button,a")) return;
      const key = event.key.toLowerCase();
      if (key === "f") onFullscreen();
      else if (key === "m") toggleMute();
      else if (canControl && (key === " " || key === "k")) togglePlay();
      else if (canControl && key === "arrowleft") seekBy(-5);
      else if (canControl && key === "arrowright") seekBy(5);
      else if (canControl && key === "j") seekBy(-10);
      else if (canControl && key === "l") seekBy(10);
      else return;
      event.preventDefault();
      revealControls();
    };
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcuts.current(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const controls = stream && (
          <PlayerControls
      variant={overlayControls ? "overlay" : "bar"}
      visible={overlayControls ? showControls : true}
      playing={ui.playing}
      time={ui.time}
      duration={ui.duration}
      live={ui.live}
      atEdge={syncable ? ui.atEdge : ui.playing}
      canControl={canControl || !syncable}
      canSeek={canControl && stream.playback.position !== null}
      status={ui.status}
      volume={volume}
      muted={silenced}
      onPlayPause={togglePlay}
      onSeek={(seconds) => send({ type: "stream.control", streamId: stream.id, action: "seek", position: seconds })}
      onVolume={(value) => {
        setVolume(value <= SILENT_BELOW ? 0 : value);
        setMuted(false);
        if (outputMode === "both") setSound(true);
      }}
      onMute={toggleMute}
      onFullscreen={onFullscreen}
      hideVolume={!hasElementFullscreen()}
      fit={fillable ? fit : undefined}
      onFit={fillable ? toggleFit : undefined}
      onResync={resync}
      onGoLive={goLive}
      canFullscreen={canFullscreen}
      fullscreen={fullscreen}
      minimal={isTwitch && !syncable}
      qualityOptions={activeAdapter?.qualities() ?? []}
      quality={ui.qualityValue}
      qualityNote={activeAdapter?.qualityNote}
      qualityLink={stream ? { href: sourceUrl(stream), label: "Open on YouTube to choose a quality" } : undefined}
      onQuality={(id) => {
        activeAdapter?.setQuality(id);
        patch({ qualityValue: id });
      }}
      onAirPlay={appleAirPlay ? openTvSheet : undefined}
      captions={activeAdapter?.captions?.() ?? null}
      onCaptionTrack={(id) => {
        activeAdapter?.setCaptionTrack?.(id);
        patch({ captionKey: `set:${Math.random()}` });
      }}
      onCaptionSize={(size) => {
        activeAdapter?.setCaptionSize?.(size);
        patch({ captionKey: `size:${Math.random()}` });
      }}
    />
  );

  return (
    <div
      className="absolute inset-y-0 right-[var(--safe-r,0px)] left-[var(--safe-l,0px)] bg-black"
      style={filling ? { containerType: "size" } : undefined}
      onPointerMove={revealControls}
    >
      <div
        ref={hostRefs.youtube}
        className={`absolute ${filling ? "" : "inset-0"} ${stream?.source.type === "youtube" && visible ? "" : "pointer-events-none opacity-0"}`}
        style={
          filling
            ? { left: "50%", top: "50%", width: "max(100cqw, calc(100cqh * 16 / 9))", height: "max(100cqh, calc(100cqw * 9 / 16))", transform: "translate(-50%, -50%)" }
            : undefined
        }
      />
      <div ref={hostRefs.twitch} className={`absolute inset-0 overflow-hidden ${stream?.source.type === "twitch" && visible ? "" : "pointer-events-none opacity-0"}`} />

      {visible && stream && (
        <>
          {!isTwitch && (
            <>
          {!ytNative && (
            <div
              className="absolute inset-0 z-10 touch-manipulation select-none"
              onClick={revealControls}
              onDoubleClick={() => {
                if (Date.now() - touchAt.current > 800) onFullscreen();
              }}
              onPointerUp={handleTouchTap}
            >
              {ripple && (
                <span
                  key={ripple.key}
                  className={`animate-fade pointer-events-none absolute top-1/2 flex size-20 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-sm font-semibold ${ripple.zone === "left" ? "left-[12%]" : "right-[12%]"}`}
                >
                  {ripple.zone === "left" ? "−10s" : "+10s"}
                </span>
              )}
            </div>
          )}

          {ui.loading && !ui.blocked && !ui.error && (
            <div className="animate-fade pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black">
              <StreamArt stream={stream} className="absolute inset-0 size-full opacity-40 blur-sm" />
              <span className="relative size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}

          {(ui.error || ui.stalled) && (
            <div className="animate-fade absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
              <p className="max-w-sm text-sm">{ui.error ?? "This is taking longer than usual."}</p>
              <div className="flex gap-2">
                <button onClick={retry} className="h-9 rounded-full bg-white/15 px-4 text-sm font-medium transition hover:bg-white/25 active:scale-95">
                  Try again
                </button>
                <a
                  href={sourceUrl(stream)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 items-center rounded-full bg-white/15 px-4 text-sm font-medium transition hover:bg-white/25 active:scale-95"
                >
                  Open on {stream.source.type === "youtube" ? "YouTube" : "Twitch"}
                </a>
              </div>
            </div>
          )}

          {ui.debug && debugRef.current && (
            <pre className="pointer-events-none absolute top-2 left-2 z-40 max-w-[95%] rounded bg-black/80 p-2 font-mono text-[10px] leading-snug whitespace-pre-wrap text-live">
              {ui.debug}
            </pre>
          )}

          {ui.ended && !ui.error && (
            <div className="material animate-fade pointer-events-none absolute top-1/2 left-1/2 z-30 max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-6 py-4 text-center">
              <p className="font-semibold">This video has ended</p>
              {canControl && <p className="mt-1 text-sm text-label-2">Press play to watch it again.</p>}
            </div>
          )}

          {ui.blocked && !ui.error && (
            <button
              autoFocus={bare}
              onClick={startPlayback}
              className="animate-fade absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 bg-black/60"
            >
              <span className="material flex size-20 items-center justify-center rounded-full text-4xl">
                <PlayIcon />
              </span>
              <span className="text-sm font-medium">Tap to start watching</span>
            </button>
          )}

            </>
          )}

          {!bare &&
            (overlayControls ? (
              controls
            ) : ytNative && fullscreen ? (
              <button
                onClick={onFullscreen}
                aria-label="Exit fullscreen"
                className="material absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-20 flex size-11 items-center justify-center rounded-full text-xl transition active:scale-95"
              >
                <FullscreenIcon />
              </button>
            ) : controlsSlot ? (
              createPortal(
                <>
                  {showBar && controls}
                  {isTwitch && (twitchNote || (ui.debug && debugRef.current)) && (
                    <div className="px-3 pt-2 text-sm text-label-2 lg:px-0" role="status">
                      {twitchNote}
                      {twitchNote && ui.error && stream && (
                        <>
                          {" "}
                          <button onClick={retry} className="text-accent hover:underline">
                            Try again
                          </button>
                          {" · "}
                          <a href={sourceUrl(stream)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                            Open on Twitch
                          </a>
                        </>
                      )}
                      {ui.debug && debugRef.current && <pre className="mt-1 font-mono text-[10px] whitespace-pre-wrap text-live">{ui.debug}</pre>}
                    </div>
                  )}
                </>,
                controlsSlot,
              )
            ) : null)}
        </>
      )}
    </div>
  );
}
