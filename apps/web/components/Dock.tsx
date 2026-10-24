"use client";

import { useEffect, useState } from "react";
import { useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { Avatar } from "./Avatar";
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
      className={`flex size-11 shrink-0 items-center justify-center rounded-full text-[22px] transition active:scale-90 disabled:cursor-not-allowed disabled:opacity-35 ${tone}`}
    >
      {children}
    </button>
  );
}

export function VoicePanel({
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
  const connection = useConnectionState();
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
  const status = serverDeafened
    ? { text: "Deafened by the owner", tone: "text-warn" }
    : serverMuted
      ? { text: "Muted by the owner", tone: "text-warn" }
      : connection !== ConnectionState.Connected
        ? { text: connection === ConnectionState.Connecting ? "Connecting…" : "Voice offline", tone: "text-label-2" }
        : deafened
          ? { text: "Deafened", tone: "text-danger" }
          : !isMicrophoneEnabled
            ? { text: "Muted", tone: "text-danger" }
            : { text: "Voice connected", tone: "text-live" };

  return (
    <div className="border-t border-line bg-panel/70 px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2.5">
        <Avatar name={self.name} image={self.image} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{self.name}</p>
          <p className={`truncate text-xs ${status.tone}`}>{status.text}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <RoundButton label={isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"} danger={!isMicrophoneEnabled} disabled={serverMuted} onClick={toggleMute}>
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
          <RoundButton label="Leave room" danger onClick={onLeave}>
            <LeaveIcon />
          </RoundButton>
        </div>
      </div>
      {shareError && <p className="mt-1.5 text-xs text-danger">Couldn&apos;t start screen share.</p>}
    </div>
  );
}
