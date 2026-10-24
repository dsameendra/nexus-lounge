"use client";

import { useEffect, useState } from "react";
import { ParticipantEvent, type Participant } from "livekit-client";

const EVENTS = [
  ParticipantEvent.TrackMuted,
  ParticipantEvent.TrackUnmuted,
  ParticipantEvent.TrackPublished,
  ParticipantEvent.TrackUnpublished,
  ParticipantEvent.LocalTrackPublished,
  ParticipantEvent.LocalTrackUnpublished,
] as const;

export function useParticipantMedia(participant: Participant) {
  const read = () => ({ micOn: participant.isMicrophoneEnabled, sharing: participant.isScreenShareEnabled });
  const [media, setMedia] = useState(read);

  useEffect(() => {
    const update = () => setMedia((previous) => {
      const next = read();
      return previous.micOn === next.micOn && previous.sharing === next.sharing ? previous : next;
    });
    update();
    for (const event of EVENTS) participant.on(event, update);
    return () => {
      for (const event of EVENTS) participant.off(event, update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant]);

  return media;
}
