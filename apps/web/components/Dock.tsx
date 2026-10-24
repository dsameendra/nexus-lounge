"use client";

import { useEffect, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { HeadphonesIcon, HeadphonesOffIcon, LeaveIcon, MicIcon, MicOffIcon, ScreenIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { useScreenShareSupport } from "./useScreenShareSupport";
import { useScreenShares } from "./useEffectiveSource";

function RoundButton({
  label,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const tone = danger ? "bg-danger text-white" : active ? "bg-white text-black" : "bg-white/12 text-white hover:bg-white/20";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex size-12 items-center justify-center rounded-full text-2xl transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-35 ${tone}`}
    >
      {children}
    </button>
  );
}

export function Dock({
  deafened,
  onDeafenedChange,
  onLeave,
}: {
  deafened: boolean;
  onDeafenedChange: (value: boolean) => void;
  onLeave: () => void;
}) {
  const { self, state } = useRoom();
  const restriction = state.restrictions[self.id];
  const serverMuted = Boolean(restriction?.muted || restriction?.deafened);
  const serverDeafened = Boolean(restriction?.deafened);
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const supported = useScreenShareSupport();
  const shares = useScreenShares();
  const otherSharer = shares.find((share) => !share.participant.isLocal)?.participant;
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    if (serverMuted && isMicrophoneEnabled) void localParticipant.setMicrophoneEnabled(false);
  }, [serverMuted, isMicrophoneEnabled, localParticipant]);

  function toggleMute() {
    if (deafened) onDeafenedChange(false);
    void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
  }

  function toggleDeafen() {
    const next = !deafened;
    onDeafenedChange(next);
    if (next) void localParticipant.setMicrophoneEnabled(false);
  }

  async function toggleShare() {
    setShareError(false);
    try {
      await localParticipant.setScreenShareEnabled(
        !isScreenShareEnabled,
        { audio: true, contentHint: "motion", resolution: { width: 1920, height: 1080, frameRate: 30 } },
        { screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 } },
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "NotAllowedError")) setShareError(true);
    }
  }

  const canShare = supported && !self.guest;

  return (
    <div className="flex flex-col items-center gap-2 px-4 py-3">
      <div className="material flex items-center gap-3 rounded-full border border-line px-3 py-2 shadow-xl">
        <RoundButton
          label={serverMuted ? "Muted by the room owner" : isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
          danger={!isMicrophoneEnabled}
          disabled={serverMuted}
          onClick={toggleMute}
        >
          {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
        </RoundButton>
        <RoundButton
          label={serverDeafened ? "Deafened by the room owner" : deafened ? "Undeafen" : "Deafen"}
          danger={deafened || serverDeafened}
          disabled={serverDeafened}
          onClick={toggleDeafen}
        >
          {deafened || serverDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
        </RoundButton>
        {canShare && (
          <RoundButton
            label={isScreenShareEnabled ? "Stop sharing" : otherSharer ? `${otherSharer.name || otherSharer.identity} is sharing` : "Share screen"}
            active={isScreenShareEnabled}
            disabled={Boolean(otherSharer)}
            onClick={toggleShare}
          >
            <ScreenIcon />
          </RoundButton>
        )}
        <span className="mx-1 h-7 w-px bg-line" />
        <RoundButton label="Leave room" danger onClick={onLeave}>
          <LeaveIcon />
        </RoundButton>
      </div>
      {shareError && <p className="text-xs text-danger">Couldn't start screen share.</p>}
      {serverMuted && <p className="text-xs text-warn">{serverDeafened ? "The room owner deafened you." : "The room owner muted you."}</p>}
    </div>
  );
}
