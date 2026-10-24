"use client";

import { isTrackReference, useLocalParticipant, VideoTrack } from "@livekit/components-react";
import { Avatar, parseImage } from "./Avatar";
import { useScreenShares } from "./useEffectiveSource";

export function WatchArea() {
  const { localParticipant } = useLocalParticipant();
  const share = useScreenShares().find(isTrackReference);
  if (!share) return null;

  const sharer = share.participant;
  const name = sharer.name || sharer.identity;

  if (sharer.identity === localParticipant.identity) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 bg-black px-6 text-center">
        <Avatar name={name} image={parseImage(sharer.metadata)} className="size-14" />
        <p className="text-sm text-label-2">You're sharing your screen. Everyone watching the screen share can see it.</p>
        <button
          onClick={() => void localParticipant.setScreenShareEnabled(false)}
          className="h-10 rounded-full bg-danger px-5 text-sm font-semibold transition hover:brightness-110 active:scale-95"
        >
          Stop sharing
        </button>
      </div>
    );
  }

  return (
    <>
      <VideoTrack trackRef={share} className="size-full bg-black object-contain" />
      <div className="material pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full px-3 py-1 text-xs">
        <span className="size-2 rounded-full bg-live" />
        {name} is sharing
      </div>
    </>
  );
}
