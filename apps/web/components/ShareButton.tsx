"use client";

import { useState } from "react";
import { isTrackReference, useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useScreenShareSupport } from "./useScreenShareSupport";

export function ShareButton() {
  const supported = useScreenShareSupport();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const shares = useTracks([Track.Source.ScreenShare]).filter(isTrackReference);
  const [error, setError] = useState<string | null>(null);

  if (!supported) return null;

  const otherSharer = shares.find((share) => !share.participant.isLocal)?.participant;

  async function toggle() {
    setError(null);
    try {
      await localParticipant.setScreenShareEnabled(
        !isScreenShareEnabled,
        { audio: true, contentHint: "motion", resolution: { width: 1920, height: 1080, frameRate: 30 } },
        { screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 } },
      );
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") return;
      setError("Could not start screen share.");
    }
  }

  return (
    <div className="flex-1">
      <button
        onClick={toggle}
        disabled={Boolean(otherSharer)}
        title={otherSharer ? `${otherSharer.name || otherSharer.identity} is already sharing` : undefined}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
          isScreenShareEnabled ? "bg-danger/20 text-danger" : "bg-accent/20 text-accent hover:bg-accent/30"
        }`}
      >
        {isScreenShareEnabled ? "Stop sharing" : "Share screen"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
