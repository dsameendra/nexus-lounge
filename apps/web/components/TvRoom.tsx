"use client";

import { useEffect, useState } from "react";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { screenId } from "@nexus/shared";
import { ProviderBadge } from "./Badges";
import { FloatingReactions } from "./Reactions";
import { FilmIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
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
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, [delay]);
  return idle;
}

export function TvRoom() {
  const idleCursor = useIdleCursor();
  const { send, status, state, self } = useRoom();
  const mode = state.members.find((member) => member.id === self.id)?.tvMode ?? "both";
  const playing = mode !== "here";
  const { effectiveId, stream, share } = useEffectiveSource();
  const [toast, setToast] = useState(false);
  const showingScreen = Boolean(share);
  const title = stream?.title ?? (share ? `${share.participant.name || share.participant.identity}'s screen` : null);

  useEffect(() => {
    if (status === "open") send({ type: "presence.watch", streamId: effectiveId });
  }, [effectiveId, status, send]);

  useEffect(() => {
    if (!title) return;
    setToast(true);
    const id = setTimeout(() => setToast(false), 7000);
    return () => clearTimeout(id);
  }, [title]);

  return (
    <div className={`fixed inset-0 overflow-hidden bg-black ${idleCursor ? "cursor-none" : ""}`}>
      {playing && <ScreenAudio effectiveId={effectiveId} />}
      <div className="absolute inset-0">
        <StreamPlayer stream={stream} visible={Boolean(stream) && !showingScreen && playing} onFullscreen={() => {}} bare />
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

      {state.room.settings.reactions && effectiveId && stream?.source.type !== "twitch" && <FloatingReactions />}

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
        className={`material pointer-events-none absolute top-10 left-10 z-20 flex max-w-[70vw] items-center gap-5 rounded-3xl px-8 py-5 transition duration-500 ${
          toast && title ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
        }`}
      >
        {stream && <ProviderBadge source={stream.source} />}
        <p className="truncate text-3xl font-semibold">{title}</p>
      </div>

      {status !== "open" && (
        <div className="material absolute right-10 bottom-10 z-20 rounded-full px-6 py-3 text-2xl text-warn">Reconnecting…</div>
      )}
    </div>
  );
}
