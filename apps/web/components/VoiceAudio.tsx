"use client";

import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { SCREEN_ID } from "@nexus/shared";
import { useRoom } from "./RoomProvider";
import { useEffectiveSource } from "./useEffectiveSource";
import { useVoiceSettings } from "./VoiceSettings";

export function VoiceAudio({ deafened }: { deafened: boolean }) {
  const { effectiveId } = useEffectiveSource();
  const { state, self } = useRoom();
  const voice = useVoiceSettings();
  const serverDeafened = state.restrictions[self.id]?.deafened ?? false;
  const tracks = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], { onlySubscribed: true })
    .filter(isTrackReference)
    .filter((track) => !track.participant.isLocal);

  return (
    <div style={{ display: "none" }}>
      {tracks.map((track) => {
        const isVoice = track.source === Track.Source.Microphone;
        const person = voice.get(track.participant.identity);
        return (
          <AudioTrack
            key={`${track.participant.identity}-${track.source}`}
            trackRef={track}
            volume={isVoice ? person.volume : 1}
            muted={deafened || serverDeafened || (isVoice ? person.muted : effectiveId !== SCREEN_ID)}
          />
        );
      })}
    </div>
  );
}
