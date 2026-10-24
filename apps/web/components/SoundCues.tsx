"use client";

import { useEffect, useRef } from "react";
import { useConnectionState, useRoomContext } from "@livekit/components-react";
import { ConnectionState, RoomEvent, type RemoteParticipant } from "livekit-client";
import { playCue, unlockAudio } from "@/lib/sounds";
import { useRoom } from "./RoomProvider";

const SETTLE_MS = 2500;

export function SoundCues({ deafened }: { deafened: boolean }) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { state, self } = useRoom();
  const restriction = state.restrictions[self.id];
  const serverDeafened = Boolean(restriction?.deafened);
  const restricted = Boolean(restriction?.muted || restriction?.deafened);
  const quiet = useRef(deafened || serverDeafened);
  const settling = useRef(true);
  const wasRestricted = useRef<boolean | null>(null);

  useEffect(() => {
    quiet.current = deafened || serverDeafened;
  }, [deafened, serverDeafened]);

  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    settling.current = true;
    const timer = setTimeout(() => {
      settling.current = false;
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [connection]);

  useEffect(() => {
    const announce = (cue: "join" | "leave") => (participant: RemoteParticipant) => {
      if (settling.current || quiet.current || participant.identity.startsWith("tv-")) return;
      playCue(cue);
    };
    const joined = announce("join");
    const left = announce("leave");
    room.on(RoomEvent.ParticipantConnected, joined);
    room.on(RoomEvent.ParticipantDisconnected, left);
    return () => {
      room.off(RoomEvent.ParticipantConnected, joined);
      room.off(RoomEvent.ParticipantDisconnected, left);
    };
  }, [room]);

  useEffect(() => {
    if (wasRestricted.current !== null && wasRestricted.current !== restricted) playCue(restricted ? "restricted" : "released");
    wasRestricted.current = restricted;
  }, [restricted]);

  return null;
}
