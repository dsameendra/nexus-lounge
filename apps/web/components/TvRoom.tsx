"use client";

import { useEffect, useState } from "react";
import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { SCREEN_ID } from "@nexus/shared";
import { ProviderBadge } from "./Badges";
import { FilmIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { StreamPlayer } from "./StreamPlayer";
import { useEffectiveSource } from "./useEffectiveSource";
import { WatchArea } from "./WatchArea";

function ScreenAudio({ active }: { active: boolean }) {
  const tracks = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: true }).filter(isTrackReference);
  return (
    <div style={{ display: "none" }}>
      {tracks.map((track) => (
        <AudioTrack key={track.participant.identity} trackRef={track} muted={!active} />
      ))}
    </div>
  );
}

export function TvRoom() {
  const { send, status } = useRoom();
  const { effectiveId, stream } = useEffectiveSource();
  const [toast, setToast] = useState(false);
  const showingScreen = effectiveId === SCREEN_ID;
  const title = stream?.title ?? (showingScreen ? "Screen share" : null);

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
    <div className="fixed inset-0 cursor-none overflow-hidden bg-black">
      <ScreenAudio active={showingScreen} />
      <div className="absolute inset-0">
        <StreamPlayer stream={stream} visible={Boolean(stream) && !showingScreen} onFullscreen={() => {}} bare />
      </div>
      {showingScreen && (
        <div className="absolute inset-0 z-10">
          <WatchArea />
        </div>
      )}

      {!effectiveId && (
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
