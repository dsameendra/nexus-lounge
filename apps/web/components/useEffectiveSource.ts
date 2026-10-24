"use client";

import { SCREEN_ID, type Stream } from "@nexus/shared";
import { isTrackReference, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useRoom } from "./RoomProvider";

export function useScreenShares() {
  return useTracks([Track.Source.ScreenShare]).filter(isTrackReference);
}

export function useEffectiveSource() {
  const { state, selectedId, self } = useRoom();
  const screenActive = useScreenShares().length > 0;

  const featuredId = state.featuredId === SCREEN_ID && !screenActive ? null : state.featuredId;
  const preferred = self.guest || (selectedId === SCREEN_ID && !screenActive) ? null : selectedId;
  const candidate = preferred ?? featuredId ?? (screenActive ? SCREEN_ID : null);

  let stream: Stream | null = null;
  let effectiveId: string | null = null;
  if (candidate === SCREEN_ID) {
    effectiveId = screenActive ? SCREEN_ID : null;
  } else if (candidate) {
    stream = state.streams.find((item) => item.id === candidate) ?? null;
    effectiveId = stream?.id ?? null;
  }

  return { effectiveId, stream, screenActive, featuredId, isFollowing: !preferred || preferred === featuredId };
}
