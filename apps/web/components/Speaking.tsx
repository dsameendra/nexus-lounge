"use client";

import { useEffect, useState } from "react";
import { useIsSpeaking } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { useParticipantMedia } from "./useParticipantMedia";
import { useRoom } from "./RoomProvider";

const RELEASE_MS = 350;

export function useSpeaking(participant: Participant) {
  const { state } = useRoom();
  const { micOn } = useParticipantMedia(participant);
  const detected = useIsSpeaking(participant);
  const restriction = state.restrictions[participant.identity];
  const silenced = Boolean(restriction?.muted || restriction?.deafened);
  const active = detected && micOn && !silenced;
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (active) {
      setHeld(true);
      return;
    }
    const timer = setTimeout(() => setHeld(false), RELEASE_MS);
    return () => clearTimeout(timer);
  }, [active]);

  return active || held;
}

export function SpeakingRing({ speaking, children }: { speaking: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full p-[2.5px] transition-[background-color,box-shadow] duration-200 ${
        speaking ? "bg-live shadow-[0_0_12px_2px_rgba(48,209,88,0.45)]" : "bg-transparent"
      }`}
    >
      <span className="block rounded-full bg-bg p-[1.5px]">{children}</span>
    </span>
  );
}
