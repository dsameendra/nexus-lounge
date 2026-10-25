"use client";

import { AudioTrack, isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { isSilent, screenId, sliderToGain } from "@nexus/shared";
import { useRoom } from "./RoomProvider";
import { useEffectiveSource } from "./useEffectiveSource";
import { useTvOutput } from "./useTvOutput";
import { useVoiceSettings } from "./VoiceSettings";

export function VoiceAudio({ deafened }: { deafened: boolean }) {
  const { effectiveId } = useEffectiveSource();
  const { state, self } = useRoom();
  const voice = useVoiceSettings();
  const { localSound } = useTvOutput();
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
            volume={isVoice ? sliderToGain(person.volume) : 1}
            muted={deafened || serverDeafened || (isVoice ? person.muted || isSilent(person.volume) : !localSound || effectiveId !== screenId(track.participant.identity))}
          />
        );
      })}
    </div>
  );
}
