"use client";

import { useRef } from "react";
import { isTrackReference, useLocalParticipant, useTracks, VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";

export function WatchArea() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { localParticipant } = useLocalParticipant();
  const shares = useTracks([Track.Source.ScreenShare]).filter(isTrackReference);
  const share = shares[0];

  if (!share) {
    return (
      <div className="px-6 text-center text-sm text-slate-500">
        Nobody is sharing yet. Use <span className="text-slate-300">Share screen</span> to start the watch party.
      </div>
    );
  }

  const sharer = share.participant;
  const name = sharer.name || sharer.identity;
  const isMine = sharer.identity === localParticipant.identity;

  return (
    <div ref={containerRef} className="group relative size-full bg-black">
      {isMine ? (
        <div className="flex size-full flex-col items-center justify-center gap-3 text-center">
          <Avatar name={name} image={parseImage(sharer.metadata)} className="size-14" />
          <p className="text-sm text-slate-300">You're sharing your screen. Everyone else can see it.</p>
          <button
            onClick={() => void localParticipant.setScreenShareEnabled(false)}
            className="rounded-lg bg-danger/20 px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/30"
          >
            Stop sharing
          </button>
        </div>
      ) : (
        <>
          <VideoTrack trackRef={share} className="size-full object-contain" />
          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs">
            <span className="size-2 rounded-full bg-live" />
            {name} is sharing
          </div>
          <button
            onClick={() => void containerRef.current?.requestFullscreen()}
            className="absolute right-3 bottom-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs opacity-0 transition group-hover:opacity-100 focus:opacity-100 max-lg:opacity-100"
          >
            Fullscreen
          </button>
        </>
      )}
    </div>
  );
}
