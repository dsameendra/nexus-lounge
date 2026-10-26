"use client";

import { useCallback, useEffect, useState } from "react";
import { isTvBrowser } from "@/lib/tv-browser";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { isDeviceSource, isEmbedOnlySource, isTypingTarget, screenId } from "@nexus/shared";
import { enterFullscreen, exitFullscreen, fullscreenSupported, isFullscreen } from "@/lib/fullscreen";
import { ProviderBadge } from "./Badges";
import { FloatingReactions } from "./Reactions";
import { ExitFullscreenIcon, FilmIcon, FullscreenIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { LocalPlayer } from "./LocalPlayer";
import { StreamPlayer } from "./StreamPlayer";
import { useEffectiveSource } from "./useEffectiveSource";
import { WatchArea } from "./WatchArea";

function ScreenAudio({ effectiveId }: { effectiveId: string | null }) {
  const tracks = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true }).filter(isTrackReference);
  return (
    <div style={{ display: "none" }}>
      {tracks.map((track) => (
        <AudioTrack key={track.participant.identity} trackRef={track} muted={effectiveId !== screenId(track.participant.identity)} />
      ))}
    </div>
  );
}

function useIdleCursor(delay = 3000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), delay);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [delay]);
  return idle;
}

// The whole TV page goes fullscreen, so the choice is the viewer's: browsers on TVs often start in a window with chrome around it.
function useTvFullscreen() {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported(fullscreenSupported());
    const update = () => setActive(isFullscreen());
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);
  const toggle = useCallback(() => {
    void (isFullscreen() ? exitFullscreen() : enterFullscreen());
  }, []);
  return { active, supported, toggle };
}

export function TvRoom() {
  const fullscreen = useTvFullscreen();
  const [focused, setFocused] = useState(false);
  const idleCursor = useIdleCursor();
  const [tvBrowser] = useState(isTvBrowser);
  const { send, status, state, self } = useRoom();
  const mode = state.members.find((member) => member.id === self.id)?.tvMode ?? "both";
  const playing = mode !== "here";
  const { effectiveId, stream, share } = useEffectiveSource();
  const [toast, setToast] = useState(false);
  const showingScreen = Boolean(share);
  const showFullscreen = fullscreen.supported && !(stream && isEmbedOnlySource(stream.source));
  const title = stream?.title ?? (share ? `${share.participant.name || share.participant.identity}'s screen` : null);

  useEffect(() => {
    if (status === "open") send({ type: "presence.watch", streamId: effectiveId });
  }, [effectiveId, status, send]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f" || event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target?.tagName, Boolean(target?.isContentEditable))) return;
      if (showFullscreen) fullscreen.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen.toggle, showFullscreen]);

  useEffect(() => {
    if (!showFullscreen) setFocused(false);
  }, [showFullscreen]);

  useEffect(() => {
    if (!title) return;
    setToast(true);
    const id = setTimeout(() => setToast(false), 7000);
    return () => clearTimeout(id);
  }, [title]);

  return (
    <div className={`fixed inset-0 overflow-hidden bg-black ${tvBrowser ? "tv-browser" : ""} ${idleCursor && !tvBrowser ? "cursor-none" : ""}`}>
      {playing && <ScreenAudio effectiveId={effectiveId} />}
      <div className="absolute inset-0">
        <StreamPlayer stream={stream} visible={Boolean(stream) && !showingScreen && playing} onFullscreen={() => {}} bare />
        <LocalPlayer stream={stream && isDeviceSource(stream.source) ? stream : null} visible={Boolean(stream) && !showingScreen && playing} onFullscreen={() => {}} bare />
      </div>
      {share && playing && (
        <div className="absolute inset-0 z-10">
          <WatchArea share={share} />
        </div>
      )}

      {!playing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-black text-center">
          <p className="text-5xl font-semibold">Connected</p>
          <p className="max-w-3xl text-3xl text-label-2">Video is playing on your other device. Choose TV only or Both there to watch here.</p>
        </div>
      )}

      {state.room.settings.reactions && effectiveId && !(stream && isEmbedOnlySource(stream.source)) && <FloatingReactions />}

      {!effectiveId && playing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center">
          <span className="flex size-28 items-center justify-center rounded-full bg-panel text-6xl text-label-2">
            <FilmIcon />
          </span>
          <p className="text-5xl font-semibold">Waiting for the room</p>
          <p className="text-3xl text-label-2">Whatever the host picks will show up here.</p>
        </div>
      )}

      <div
        className={`material pointer-events-none absolute top-10 left-10 z-20 flex max-w-[70vw] items-center gap-5 rounded-3xl px-8 py-5 ${
          tvBrowser ? (toast && title ? "" : "invisible") : `transition duration-500 ${toast && title ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`
        }`}
      >
        {stream && <ProviderBadge source={stream.source} />}
        <p className="truncate text-3xl font-semibold">{title}</p>
      </div>

      {showFullscreen && (
        <button
          type="button"
          onClick={(event) => {
            fullscreen.toggle();
            if (event.detail > 0) event.currentTarget.blur();
          }}
          onFocus={(event) => {
            // Browsers without :focus-visible (older TV engines) throw here: treat any focus as keyboard focus.
            let keyboard = true;
            try {
              keyboard = event.currentTarget.matches(":focus-visible");
            } catch {}
            setFocused(keyboard);
          }}
          onBlur={() => setFocused(false)}
          aria-label={fullscreen.active ? "Exit fullscreen" : "Enter fullscreen"}
          title={fullscreen.active ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
          className={`material absolute top-10 right-10 z-30 flex size-20 items-center justify-center rounded-full text-4xl text-white focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none ${
            tvBrowser ? "" : "transition duration-300 hover:brightness-125 active:scale-95"
          } ${idleCursor && !focused ? (tvBrowser ? "pointer-events-none" : "pointer-events-none opacity-0") : "opacity-100"}`}
          data-idle={tvBrowser && idleCursor && !focused ? "true" : undefined}
        >
          {fullscreen.active ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      )}

      {status !== "open" && (
        <div className="material absolute right-10 bottom-10 z-20 rounded-full px-6 py-3 text-2xl text-warn">Reconnecting…</div>
      )}
    </div>
  );
}
