"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { computeCorrection, expectedPosition, median, type Stream } from "@nexus/shared";
import { YouTubeAdapter } from "@/lib/players/youtube";
import { TwitchAdapter } from "@/lib/players/twitch";
import type { PlayerAdapter } from "@/lib/players/types";
import { PlayIcon } from "./Icons";
import { PlayerControls, type SyncStatus } from "./PlayerControls";
import { useRoom } from "./RoomProvider";
import { StreamArt } from "./StreamArt";

function sourceUrl(stream: Stream) {
  const { type, id, isLive } = stream.source;
  if (type === "youtube") return `https://www.youtube.com/watch?v=${id}`;
  return isLive ? `https://www.twitch.tv/${id}` : `https://www.twitch.tv/videos/${id}`;
}

type Provider = "youtube" | "twitch";

interface UiState {
  status: SyncStatus;
  blocked: boolean;
  loading: boolean;
  playing: boolean;
  time: number;
  duration: number;
  live: boolean;
  error: string | null;
  stalled: boolean;
  debug: string;
}

const INITIAL_UI: UiState = { status: "syncing", blocked: false, loading: true, playing: false, time: 0, duration: 0, live: false, error: null, stalled: false, debug: "" };

export function StreamPlayer({
  stream,
  visible,
  onFullscreen,
}: {
  stream: Stream | null;
  visible: boolean;
  onFullscreen: () => void;
}) {
  const { clock, send, canControlStream } = useRoom();
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
  const latest = useRef({ stream, visible, volume: 1, muted: false });
  const [ui, setUi] = useState<UiState>(INITIAL_UI);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    latest.current = { stream, visible, volume, muted };
  });

  const patch = useCallback((next: Partial<UiState>) => {
    setUi((prev) => ((Object.keys(next) as (keyof UiState)[]).every((key) => prev[key] === next[key]) ? prev : { ...prev, ...next }));
  }, []);

  const ensureAdapter = useCallback(
    (type: Provider) => {
      let adapter = adapters.current[type];
      const host = hostRefs[type].current;
      if (!adapter && host) {
        adapter = type === "youtube" ? new YouTubeAdapter(host) : new TwitchAdapter(host);
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

  const tick = useCallback(() => {
    const { stream, visible, volume, muted } = latest.current;
    const m = mem.current;

    for (const type of ["youtube", "twitch"] as const) {
      const other = adapters.current[type];
      if (other?.ready && (!stream || !visible || stream.source.type !== type) && other.getState() === "playing") other.pause();
    }
    if (!stream || !visible) return;

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
      adapter.setVolume(volume);
      adapter.setMuted(muted);
      adapter.load(stream.source, expected === null ? null : expected + lead, syncable ? playback.playing : true);
      patch({ loading: true, blocked: false, time: 0, duration: 0 });
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
    patch({ playing: state === "playing" || state === "buffering", loading: state === "idle", live, error: adapter.error, stalled });
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
  }, [clock, ensureAdapter, patch, send]);

  useEffect(() => {
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [tick]);

  useEffect(() => {
    tick();
  }, [stream?.id, stream?.playback, visible, tick]);

  useEffect(() => {
    for (const adapter of Object.values(adapters.current)) {
      adapter?.setVolume(volume);
      adapter?.setMuted(muted);
    }
  }, [volume, muted]);

  useEffect(() => {
    if (!visible || !stream) return;
    const id = setInterval(() => {
      const adapter = adapters.current[stream.source.type];
      if (adapter?.ready) patch({ time: Math.floor(adapter.getTime() * 2) / 2, duration: Math.floor(adapter.getDuration()) });
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
  const showControls = controlsShown || !ui.playing || ui.blocked;

  function togglePlay() {
    if (!stream) return;
    if (!syncable) {
      if (ui.playing) activeAdapter?.pause();
      else activeAdapter?.play();
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

  function retry() {
    mem.current.loadedId = null;
    patch({ stalled: false, error: null, loading: true });
  }

  function startPlayback() {
    patch({ blocked: false });
    mem.current.wantSince = Date.now();
    activeAdapter?.play();
  }

  return (
    <div className="absolute inset-0 bg-black" onPointerMove={revealControls}>
      <div ref={hostRefs.youtube} className={`absolute inset-0 ${stream?.source.type === "youtube" && visible ? "" : "pointer-events-none opacity-0"}`} />
      <div ref={hostRefs.twitch} className={`absolute inset-0 overflow-hidden ${stream?.source.type === "twitch" && visible ? "" : "pointer-events-none opacity-0"}`} />

      {visible && stream && (
        <>
          <div className="absolute inset-0 z-10" onClick={revealControls} />

          {ui.loading && !ui.blocked && !ui.error && (
            <div className="animate-fade absolute inset-0 z-10 flex items-center justify-center bg-black">
              <StreamArt stream={stream} className="absolute inset-0 size-full opacity-40 blur-sm" />
              <span className="relative size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}

          {(ui.error || ui.stalled) && (
            <div className="animate-fade absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
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

          {ui.blocked && (
            <button
              onClick={startPlayback}
              className="animate-fade absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/60"
            >
              <span className="material flex size-20 items-center justify-center rounded-full text-4xl">
                <PlayIcon />
              </span>
              <span className="text-sm font-medium">Tap to start watching</span>
            </button>
          )}

          <PlayerControls
            visible={showControls}
            playing={ui.playing}
            time={ui.time}
            duration={ui.duration}
            live={ui.live}
            canControl={canControl || !syncable}
            canSeek={canControl && stream.playback.position !== null}
            status={ui.status}
            volume={volume}
            muted={muted}
            onPlayPause={togglePlay}
            onSeek={(seconds) => send({ type: "stream.control", streamId: stream.id, action: "seek", position: seconds })}
            onVolume={(value) => {
              setVolume(value);
              setMuted(false);
            }}
            onMute={() => setMuted((value) => !value)}
            onFullscreen={onFullscreen}
            onResync={resync}
          />
        </>
      )}
    </div>
  );
}
