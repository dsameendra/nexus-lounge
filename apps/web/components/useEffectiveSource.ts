"use client";

import { isScreenId, screenId, type Stream } from "@nexus/shared";
import { isTrackReference, useTracks, type TrackReference } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useRoom } from "./RoomProvider";

export function useScreenShares() {
  return useTracks([Track.Source.ScreenShare]).filter(isTrackReference);
}

export function shareName(share: TrackReference) {
  return share.participant.name || share.participant.identity;
}

export function useEffectiveSource() {
  const { state, selectedId, self } = useRoom();
  const shares = useScreenShares();
  const shareIds = shares.map((share) => screenId(share.participant.identity));

  const stillExists = (id: string | null) => (id !== null && isScreenId(id) && !shareIds.includes(id) ? null : id);
  const featuredId = stillExists(state.featuredId);
  const preferred = self.guest ? null : stillExists(selectedId);
  const candidate = preferred ?? featuredId ?? shareIds[0] ?? null;

  let stream: Stream | null = null;
  let share: TrackReference | null = null;
  let effectiveId: string | null = null;
  if (candidate && isScreenId(candidate)) {
    share = shares.find((item) => screenId(item.participant.identity) === candidate) ?? null;
    effectiveId = share ? candidate : null;
  } else if (candidate) {
    stream = state.streams.find((item) => item.id === candidate) ?? null;
    effectiveId = stream?.id ?? null;
  }

  return { effectiveId, stream, share, shares, featuredId, screenActive: shares.length > 0, isFollowing: !preferred || preferred === featuredId };
}
