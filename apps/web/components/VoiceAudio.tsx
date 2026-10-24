"use client";

import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { SCREEN_ID } from "@nexus/shared";
import { useEffectiveSource } from "./useEffectiveSource";

export function VoiceAudio({ deafened }: { deafened: boolean }) {
  const { effectiveId } = useEffectiveSource();
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true })
    .filter(isTrackReference)
    .filter((track) => !track.participant.isLocal);

  return (
    <div style={{ display: "none" }}>
      {tracks.map((track) => (
        <AudioTrack
          key={`${track.participant.identity}-${track.source}`}
          trackRef={track}
          muted={deafened || (track.source === Track.Source.ScreenShareAudio && effectiveId !== SCREEN_ID)}
        />
      ))}
    </div>
  );
}
