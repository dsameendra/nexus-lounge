"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useRoom } from "./RoomProvider";

export type Output = "here" | "tv" | "both";

const KEY = (roomId: string) => `nexus-output-${roomId}`;
const listeners = new Set<() => void>();
const soundOn = new Map<string, boolean>();

const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(roomId: string): Output {
  try {
    const value = localStorage.getItem(KEY(roomId));
    return value === "tv" || value === "both" ? value : "here";
  } catch {
    return "here";
  }
}

export function useTvOutput() {
  const { state, self } = useRoom();
  const roomId = state.room.id;
  const tvs = state.members.filter((member) => member.tvOf === self.id);
  const connected = tvs.length > 0;
  const preference = useSyncExternalStore(subscribe, () => read(roomId), () => "here" as Output);
  const sound = useSyncExternalStore(subscribe, () => soundOn.get(roomId) ?? false, () => false);
  const mode: Output = connected ? preference : "here";

  const setMode = useCallback(
    (next: Output) => {
      try {
        localStorage.setItem(KEY(roomId), next);
      } catch {}
      soundOn.set(roomId, false);
      notify();
    },
    [roomId],
  );
  const setSound = useCallback(
    (on: boolean) => {
      soundOn.set(roomId, on);
      notify();
    },
    [roomId],
  );

  return {
    tvs,
    connected,
    mode,
    setMode,
    localVideo: mode !== "tv",
    localSound: mode === "here" || (mode === "both" && sound),
    soundOn: sound,
    setSound,
  };
}
