"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { TvMode } from "@nexus/shared";
import { useRoom } from "./RoomProvider";

export type Output = TvMode;

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
    return value === "tv" || value === "here" ? value : "both";
  } catch {
    return "both";
  }
}

export function useTvOutput() {
  const { state, self } = useRoom();
  const roomId = state.room.id;
  const tvs = state.members.filter((member) => member.tvOf === self.id);
  const connected = tvs.length > 0;
  const preference = useSyncExternalStore(subscribe, () => read(roomId), () => "both" as Output);
  const sound = useSyncExternalStore(subscribe, () => soundOn.get(roomId) ?? true, () => true);
  const mode: Output = connected ? preference : "here";

  const setMode = useCallback(
    (next: Output) => {
      try {
        localStorage.setItem(KEY(roomId), next);
      } catch {}
      soundOn.set(roomId, true);
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
    preference,
    mode,
    setMode,
    localVideo: mode !== "tv",
    localSound: mode === "here" || (mode === "both" && sound),
    soundOn: sound,
    setSound,
  };
}

export function useTvOutputSync() {
  const { send, status } = useRoom();
  const { tvs, connected, preference, setMode } = useTvOutput();
  const key = tvs.map((tv) => tv.id).join(",");
  const wasConnected = useRef(connected);

  useEffect(() => {
    if (connected && !wasConnected.current) setMode("both");
    wasConnected.current = connected;
  }, [connected, setMode]);

  useEffect(() => {
    if (connected && status === "open") send({ type: "tv.output", mode: preference });
  }, [connected, key, preference, status, send]);
}
