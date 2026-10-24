"use client";

import { useEffect, useRef, useState } from "react";
import { useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState, VideoPreset } from "livekit-client";
import { keyLabel } from "@nexus/shared";
import { Avatar } from "./Avatar";
import { GearIcon, HeadphonesIcon, HeadphonesOffIcon, LeaveIcon, MicIcon, MicOffIcon, ScreenIcon } from "./Icons";
import { usePushToTalk, VoiceSettingsSheet } from "./PushToTalk";
import { useRoom } from "./RoomProvider";
import { SpeakingRing, useSpeaking } from "./Speaking";
import { useScreenShareSupport } from "./useScreenShareSupport";

type Tone = "neutral" | "danger" | "active" | "leave";

function ActionButton({
  label,
  tone = "neutral",
  disabled,
  title,
  onClick,
  onHoldStart,
  onHoldEnd,
  children,
}: {
  label: string;
  tone?: Tone;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  children: React.ReactNode;
}) {
  const holding = useRef(false);
  const start = onHoldStart
    ? () => {
        holding.current = true;
        onHoldStart();
      }
    : undefined;
  const end = onHoldEnd
    ? () => {
        if (!holding.current) return;
        holding.current = false;
        onHoldEnd();
      }
    : undefined;
  const tones: Record<Tone, string> = {
    neutral: "bg-white/10 text-white hover:bg-white/15",
    danger: "bg-danger/20 text-danger hover:bg-danger/25",
    active: "bg-accent/25 text-accent hover:bg-accent/30",
    leave: "bg-danger text-white hover:brightness-110",
  };
  return (
    <button
      onClick={onClick}
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={onHoldStart ? (event) => event.preventDefault() : undefined}
      disabled={disabled}
      aria-label={title ?? label}
      title={title ?? label}
      className={`flex h-14 max-lg:landscape:h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}
    >
      <span className="text-[22px] leading-none">{children}</span>
      <span className="max-w-full truncate px-1">{label}</span>
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
  const { self, state, isController } = useRoom();
  const restriction = state.restrictions[self.id];
  const serverMuted = Boolean(restriction?.muted || restriction?.deafened);
  const serverDeafened = Boolean(restriction?.deafened);
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const connection = useConnectionState();
  const supported = useScreenShareSupport();
  const speaking = useSpeaking(localParticipant);
  const [shareError, setShareError] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState(false);
  const ptt = usePushToTalk();

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
        { screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 }, screenShareSimulcastLayers: [new VideoPreset(1280, 720, 1_800_000, 30)] },
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "NotAllowedError")) setShareError(true);
    }
  }

  const showShare = supported && !self.guest;
  const shareAllowed = state.room.settings.sharing === "everyone" || isController;
  const status = serverDeafened
    ? { text: "Deafened by the owner", tone: "text-warn" }
    : serverMuted
      ? { text: "Muted by the owner", tone: "text-warn" }
      : connection !== ConnectionState.Connected
        ? { text: connection === ConnectionState.Connecting ? "Connecting…" : "Voice offline", tone: "text-label-2" }
        : deafened
          ? { text: "Deafened", tone: "text-danger" }
          : ptt.enabled
            ? ptt.talking
              ? { text: "Talking…", tone: "text-live" }
              : { text: `Push to talk · ${keyLabel(ptt.code)}`, tone: "text-label-2" }
            : !isMicrophoneEnabled
              ? { text: "Muted", tone: "text-danger" }
              : speaking
                ? { text: "Speaking", tone: "text-live" }
                : { text: "Voice connected", tone: "text-live" };

  return (
    <div className="border-t border-line bg-panel/70 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:landscape:pt-2">
      <button
        onClick={() => setVoiceSettings(true)}
        aria-label="Voice settings"
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl p-1 text-left transition hover:bg-white/5 active:bg-white/10 max-lg:landscape:hidden"
      >
        <SpeakingRing speaking={speaking}>
          <Avatar name={self.name} image={self.image} className="size-10" />
        </SpeakingRing>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{self.name}</span>
          <span className={`block truncate text-xs ${status.tone}`}>{status.text}</span>
        </span>
        <span className="pr-1 text-lg text-label-3">
          <GearIcon />
        </span>
      </button>

      <div className={`mt-3 grid gap-2 max-lg:landscape:mt-0 ${showShare ? "grid-cols-4" : "grid-cols-3"}`}>
        {ptt.enabled ? (
          <ActionButton
            label="Hold"
            title={`Hold to talk (${keyLabel(ptt.code)})`}
            tone={ptt.talking ? "active" : "neutral"}
            disabled={serverMuted || deafened}
            onHoldStart={() => ptt.talk(true)}
            onHoldEnd={() => ptt.talk(false, 120)}
          >
            {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
          </ActionButton>
        ) : (
          <ActionButton
            label={isMicrophoneEnabled ? "Mute" : "Unmute"}
            title={serverMuted ? "Muted by the room owner" : undefined}
            tone={isMicrophoneEnabled ? "neutral" : "danger"}
            disabled={serverMuted}
            onClick={toggleMute}
          >
            {isMicrophoneEnabled ? <MicIcon /> : <MicOffIcon />}
          </ActionButton>
        )}
        <ActionButton
          label={deafened || serverDeafened ? "Undeafen" : "Deafen"}
          title={serverDeafened ? "Deafened by the room owner" : undefined}
          tone={deafened || serverDeafened ? "danger" : "neutral"}
          disabled={serverDeafened}
          onClick={toggleDeafen}
        >
          {deafened || serverDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
        </ActionButton>
        {showShare && (
          <ActionButton
            label={isScreenShareEnabled ? "Stop" : "Share"}
            title={!shareAllowed && !isScreenShareEnabled ? "Only controllers can share their screen in this room" : isScreenShareEnabled ? "Stop sharing" : "Share your screen"}
            tone={isScreenShareEnabled ? "active" : "neutral"}
            disabled={!shareAllowed && !isScreenShareEnabled}
            onClick={toggleShare}
          >
            <ScreenIcon />
          </ActionButton>
        )}
        <ActionButton label="Leave" tone="leave" onClick={onLeave}>
          <LeaveIcon />
        </ActionButton>
      </div>
      {shareError && <p className="mt-2 text-xs text-danger">Couldn&apos;t start screen share.</p>}
      {showShare && !shareAllowed && !isScreenShareEnabled && <p className="mt-2 text-xs text-label-2">Only controllers can share their screen in this room.</p>}
      {voiceSettings && <VoiceSettingsSheet onClose={() => setVoiceSettings(false)} />}
    </div>
  );
}
