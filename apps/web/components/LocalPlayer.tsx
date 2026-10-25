"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, type RemoteTrack } from "livekit-client";
import { SILENT_BELOW, expectedPosition, isSilent, isTypingTarget, sliderToGain, type Stream } from "@nexus/shared";
import { fileFromDrop, pickFile, type PickedFile } from "@/lib/local-files";
import { FilmIcon, PlayIcon } from "./Icons";
import { FEED_AUDIO, FEED_VIDEO, NOT_THE_SAME_FILE, useLocalFiles } from "./LocalFilesProvider";
import { PlayerControls, type SyncStatus } from "./PlayerControls";
import { useRoom } from "./RoomProvider";
import { loadVolume, VOLUME_KEY } from "./StreamPlayer";
import { useAppleAirPlaySupport, openTvSheet } from "./useAirPlay";
import { COMPACT_SCREEN, PHONE_LANDSCAPE, hasElementFullscreen, useMediaQuery } from "./useMediaQuery";
import { useTvOutput } from "./useTvOutput";
import { useVideoFit } from "./useVideoFit";

let stash: HTMLDivElement | null = null;
// Files keep playing while nobody is looking at them (the owner's feed depends on it), so park the element off screen.
function parking() {
  if (!stash || !stash.isConnected) {
    stash = document.createElement("div");
    stash.setAttribute("aria-hidden", "true");
    stash.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none";
    document.body.appendChild(stash);
  }
  return stash;
}

function useFeedTracks(stream: Stream) {
  const lk = useRoomContext();
  const [, setTick] = useState(0);
  useEffect(() => {
    const events = [RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected] as const;
    const update = () => setTick((value) => value + 1);
    for (const event of events) lk.on(event, update);
    return () => {
      for (const event of events) lk.off(event, update);
    };
  }, [lk]);
  const owner = lk.remoteParticipants.get(stream.addedBy.id);
  const publications = owner ? [...owner.trackPublications.values()] : [];
  const video = publications.find((item) => item.trackName === FEED_VIDEO(stream.id));
  const audio = publications.find((item) => item.trackName === FEED_AUDIO(stream.id));
  return { owner, published: Boolean(video), video: video?.track as RemoteTrack | undefined, audio: audio?.track as RemoteTrack | undefined };
}

function FileFeed({ stream, gain, fit, bare }: { stream: Stream; gain: number; fit: "fit" | "fill"; bare: boolean }) {
  const files = useLocalFiles();
  const { owner, published, video, audio } = useFeedTracks(stream);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    files.requestFeed(stream.id);
    return () => files.requestFeed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.id]);

  useEffect(() => {
    setWaited(false);
    const id = setTimeout(() => setWaited(true), 12_000);
    return () => clearTimeout(id);
  }, [stream.id, owner?.identity, published]);

  useEffect(() => {
    const element = videoRef.current;
    if (!video || !element) return;
    video.attach(element);
    element.play().then(
      () => setBlocked(false),
      () => setBlocked(true),
    );
    return () => {
      video.detach(element);
    };
  }, [video]);

  useEffect(() => {
    if (!audio) return;
    const element = document.createElement("audio");
    element.autoplay = true;
    parking().appendChild(element);
    audioRef.current = element;
    audio.attach(element);
    element.play().catch(() => setBlocked(true));
    return () => {
      audio.detach(element);
      element.remove();
      audioRef.current = null;
    };
  }, [audio]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = Math.min(1, Math.max(0, gain));
    element.muted = gain === 0;
  }, [gain, audio]);

  const name = stream.addedBy.name;
  const message = !owner
    ? `${name} isn't in the room right now. The picture comes back when they do.`
    : !published
      ? waited
        ? `${name}'s browser hasn't started the live feed. They may need to open the file again.`
        : "Starting the live feed…"
      : !video
        ? "Connecting…"
        : null;

  return (
    <>
      <video ref={videoRef} playsInline muted className={`absolute inset-0 size-full bg-black ${fit === "fill" ? "object-cover" : "object-contain"}`} />
      {message && (
        <div className="animate-fade absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-panel text-2xl text-label-2">
            <FilmIcon />
          </span>
          <p className="max-w-sm text-sm text-label-2">{message}</p>
        </div>
      )}
      {blocked && video && (
        <button
          onClick={() => {
            void videoRef.current?.play();
            void audioRef.current?.play();
            setBlocked(false);
          }}
          className="animate-fade absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 bg-black/60"
        >
          <span className="material flex size-20 items-center justify-center rounded-full text-4xl">
            <PlayIcon />
          </span>
          <span className="text-sm font-medium">{bare ? "Press OK to start watching" : "Tap to start watching"}</span>
        </button>
      )}
    </>
  );
}

const chip = "flex h-8 items-center rounded-full bg-black/60 px-3.5 text-xs font-medium text-white backdrop-blur transition hover:bg-black/75 active:scale-95";

export function LocalPlayer({
  stream,
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
  const files = useLocalFiles();
  const { clock, send, canControlStream, self, state, isController } = useRoom();
  const { localSound, mode: outputMode, setSound } = useTvOutput();
  const compactScreen = useMediaQuery(COMPACT_SCREEN);
  const phoneLand = useMediaQuery(PHONE_LANDSCAPE);
  const appleAirPlay = useAppleAirPlaySupport();
  const { fit, toggle: toggleFit } = useVideoFit();
  const hostRef = useRef<HTMLDivElement>(null);
  const [initialVolume] = useState(loadVolume);
  const [volume, setVolume] = useState(initialVolume.volume);
  const [muted, setMuted] = useState(initialVolume.muted);
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [ui, setUi] = useState({ time: 0, playing: false, status: "syncing" as SyncStatus, blocked: false, ended: false, error: null as string | null });

  const entry = stream ? files.entry(stream.id) : undefined;
  const owner = stream?.addedBy.id === self.id;
  const shown = Boolean(stream && visible);
  const remembered = stream ? files.remembered(stream.id) : null;
  const silenced = muted || !localSound;
  // Deafening is for voice chat; the film keeps playing. Volume and mute here are the only controls for its sound.
  const gain = silenced || isSilent(volume) ? 0 : sliderToGain(volume);
  const fillable = fullscreen || phoneLand;
  const filling = fillable && fit === "fill";
  const overlayControls = fullscreen || compactScreen;

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume, muted }));
    } catch {}
  }, [volume, muted]);

  useEffect(() => {
    if (!stream || !entry || !shown) return;
    files.listen(stream.id, gain);
    return () => files.listen(stream.id, 0);
  }, [stream, entry, shown, gain, files]);

  useEffect(() => {
    const host = hostRef.current;
    if (!entry || !host || !shown) return;
    entry.setFit(filling ? "fill" : "fit");
    host.appendChild(entry.video);
    return () => {
      parking().appendChild(entry.video);
    };
  }, [entry, shown, filling]);

  useEffect(() => {
    if (!stream || !shown) return;
    const read = () => {
      let next: typeof ui;
      if (entry) {
        next = { time: Math.floor(entry.video.currentTime * 2) / 2, playing: !entry.video.paused, status: entry.status, blocked: entry.blocked || !entry.audioRunning, ended: entry.ended, error: entry.error };
      } else {
        const length = stream.file?.duration ?? 0;
        const expected = expectedPosition(stream.playback, clock.now());
        const ended = length > 0 && expected !== null && expected >= length - 0.5;
        next = { time: Math.floor(Math.min(expected ?? 0, length || Infinity) * 2) / 2, playing: stream.playback.playing && !ended, status: "synced", blocked: false, ended, error: null };
      }
      setUi((prev) => (Object.keys(next).every((key) => prev[key as keyof typeof prev] === next[key as keyof typeof next]) ? prev : next));
    };
    read();
    const id = setInterval(read, 500);
    return () => clearInterval(id);
  }, [stream, entry, shown, clock]);

  const advancedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ui.ended) {
      advancedFor.current = null;
      return;
    }
    if (!stream || bare || !isController || stream.id !== state.featuredId || !state.room.settings.autoplayNext || advancedFor.current === stream.id) return;
    advancedFor.current = stream.id;
    send({ type: "queue.advance", fromStreamId: stream.id });
  }, [ui.ended, stream, bare, isController, state.featuredId, state.room.settings.autoplayNext, send]);

  const revealControls = useCallback(() => {
    setControlsShown(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsShown(false), 3000);
  }, []);
  useEffect(() => {
    revealControls();
    return () => clearTimeout(hideTimer.current);
  }, [stream?.id, revealControls]);

  async function choose(picked: PickedFile | null) {
    if (!stream || !picked) return;
    setBusy(true);
    setProblem(null);
    try {
      await files.attach(stream, picked);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : NOT_THE_SAME_FILE);
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    if (!stream) return;
    setBusy(true);
    setProblem(await files.resume(stream));
    setBusy(false);
  }

  const canControl = Boolean(stream && canControlStream(stream));
  const duration = stream?.file?.duration ?? 0;
  const showControls = controlsShown || !ui.playing || ui.blocked;

  function togglePlay() {
    if (!stream) return;
    if (ui.ended) return send({ type: "stream.control", streamId: stream.id, action: "play", position: 0 });
    const expected = expectedPosition(stream.playback, clock.now());
    send({ type: "stream.control", streamId: stream.id, action: stream.playback.playing ? "pause" : "play", position: expected });
  }

  function seekBy(delta: number) {
    if (!stream || !canControl || stream.playback.position === null) return;
    const base = expectedPosition(stream.playback, clock.now()) ?? ui.time;
    send({ type: "stream.control", streamId: stream.id, action: "seek", position: Math.min(duration || Infinity, Math.max(0, base + delta)) });
  }

  function toggleMute() {
    if (!localSound && outputMode === "both") {
      setSound(true);
      setMuted(false);
      return;
    }
    setMuted((value) => !value);
  }

  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    shortcuts.current = (event) => {
      if (bare || !stream || !shown || event.metaKey || event.ctrlKey || event.altKey) return;
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

  if (!stream || !shown) return null;

  const needsFile = owner && !entry;
  const controls = !needsFile && (
    <PlayerControls
      variant={overlayControls ? "overlay" : "bar"}
      visible={overlayControls ? showControls : true}
      playing={ui.playing}
      time={ui.time}
      duration={duration}
      live={false}
      atEdge={false}
      canControl={canControl}
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
      onResync={() => entry?.resync()}
      onGoLive={() => {}}
      canFullscreen
      fullscreen={fullscreen}
      qualityOptions={[]}
      quality="auto"
      onQuality={() => {}}
      onAirPlay={appleAirPlay ? openTvSheet : undefined}
    />
  );

  return (
    <div
      className="absolute inset-y-0 right-[var(--safe-r,0px)] left-[var(--safe-l,0px)] z-[1] bg-black"
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (bare || (entry && !needsFile)) return;
        void fileFromDrop(event).then(choose);
      }}
    >
      <div ref={hostRef} className="absolute inset-0" />
      {!entry && !needsFile && <FileFeed stream={stream} gain={gain} fit={filling ? "fill" : "fit"} bare={bare} />}

      {entry && (
        <div className="absolute inset-0 z-10 touch-manipulation select-none" onClick={revealControls} onDoubleClick={onFullscreen} />
      )}

      {entry?.error && (
        <div className="animate-fade absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 bg-black/85 px-6 text-center">
          <p className="max-w-sm text-sm">{entry.error}</p>
          {!owner && (
            <button onClick={() => files.detach(stream.id)} className="h-9 rounded-full bg-white/15 px-4 text-sm font-medium transition hover:bg-white/25 active:scale-95">
              Use the live feed instead
            </button>
          )}
        </div>
      )}

      {entry && ui.blocked && !entry.error && (
        <button
          onClick={() => {
            void entry.resumeAudio();
            entry.play();
          }}
          className="animate-fade absolute inset-0 z-[15] flex flex-col items-center justify-center gap-3 bg-black/60"
        >
          <span className="material flex size-20 items-center justify-center rounded-full text-4xl">
            <PlayIcon />
          </span>
          <span className="text-sm font-medium">Tap to start watching</span>
        </button>
      )}

      {ui.ended && !entry?.error && (
        <div className="material animate-fade pointer-events-none absolute top-1/2 left-1/2 z-30 max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-6 py-4 text-center">
          <p className="font-semibold">This video has ended</p>
          {canControl && <p className="mt-1 text-sm text-label-2">Press play to watch it again.</p>}
        </div>
      )}

      {needsFile && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-panel text-2xl text-label-2">
            <FilmIcon />
          </span>
          <div>
            <p className="font-semibold">{remembered ? `Resume “${remembered}”` : "Open the file to keep sharing"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-label-2">
              Your browser doesn&apos;t keep this file after a refresh, so everyone watching the live feed is waiting for you.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={() => (remembered ? void resume() : void pickFile().then(choose))}
            className="h-10 rounded-full bg-accent px-5 text-sm font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {remembered ? "Resume" : "Choose the file"}
          </button>
          {remembered && (
            <button onClick={() => void pickFile().then(choose)} className="text-sm text-accent hover:underline">
              Choose a different copy
            </button>
          )}
          {problem && <p className="max-w-sm text-sm text-danger">{problem}</p>}
        </div>
      )}

      {!needsFile && (
        <div className={`absolute top-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 transition-opacity duration-300 ${showControls || problem ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          {owner && files.sharing === stream.id && (
            <span className="flex h-8 items-center gap-2 rounded-full bg-black/60 px-3.5 text-xs font-medium backdrop-blur">
              <span className="size-2 animate-pulse rounded-full bg-live" /> Sharing live · keep this tab open
            </span>
          )}
          {owner && files.feedError && <span className="flex h-8 items-center rounded-full bg-warn/25 px-3.5 text-xs font-medium text-warn backdrop-blur">{files.feedError}</span>}
          {!bare && !entry && (
            <>
              {remembered && (
                <button disabled={busy} onClick={() => void resume()} className={chip}>
                  Resume “{remembered}”
                </button>
              )}
              <button disabled={busy} onClick={() => void pickFile().then(choose)} className={chip}>
                {busy ? "Checking the file…" : "I have this file"}
              </button>
            </>
          )}
          {!bare && entry && !owner && (
            <button onClick={() => files.detach(stream.id)} className={chip}>
              Playing your copy · use live feed
            </button>
          )}
          {problem && <span className="flex min-h-8 max-w-sm items-center rounded-2xl bg-black/75 px-3.5 py-1.5 text-xs text-danger">{problem}</span>}
        </div>
      )}

      {!bare &&
        (overlayControls ? controls : controlsSlot ? createPortal(controls, controlsSlot) : null)}
    </div>
  );
}
