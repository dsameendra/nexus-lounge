"use client";

import { useLocalParticipant } from "@livekit/components-react";
import { ShareButton } from "./ShareButton";

export function MuteBar({
  deafened,
  onDeafenedChange,
}: {
  deafened: boolean;
  onDeafenedChange: (value: boolean) => void;
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();

  function toggleMute() {
    if (deafened) onDeafenedChange(false);
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }

  function toggleDeafen() {
    const next = !deafened;
    onDeafenedChange(next);
    if (next) void localParticipant.setMicrophoneEnabled(false);
  }

  const base = "flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition";
  return (
    <div className="flex gap-2 border-t border-line p-3">
      <button
        onClick={toggleMute}
        className={`${base} ${isMicrophoneEnabled ? "bg-panel-2 hover:brightness-125" : "bg-danger/20 text-danger"}`}
      >
        {isMicrophoneEnabled ? "Mute" : "Unmute"}
      </button>
      <button onClick={toggleDeafen} className={`${base} ${deafened ? "bg-danger/20 text-danger" : "bg-panel-2 hover:brightness-125"}`}>
        {deafened ? "Undeafen" : "Deafen"}
      </button>
      <ShareButton />
    </div>
  );
}
