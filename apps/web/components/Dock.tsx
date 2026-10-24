"use client";

import { useEffect, useRef, useState } from "react";
import { useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState, VideoPreset } from "livekit-client";
import { keyLabel } from "@nexus/shared";
import { Avatar } from "./Avatar";
import { GearIcon, HeadphonesIcon, HeadphonesOffIcon, LeaveIcon, MicIcon, MicOffIcon, ScreenIcon } from "./Icons";
import { playCue } from "@/lib/sounds";
import { usePushToTalk, VoiceSettingsSheet } from "./PushToTalk";
import { useRoom } from "./RoomProvider";
import { SpeakingRing, useSpeaking } from "./Speaking";
import { useScreenShareSupport } from "./useScreenShareSupport";

type Tone = "neutral" | "danger" | "active" | "leave";

const TONES: Record<Tone, string> = {
  neutral: "bg-white/10 text-white hover:bg-white/15",
  danger: "bg-danger/20 text-danger hover:bg-danger/25",
  active: "bg-accent/25 text-accent hover:bg-accent/30",
  leave: "bg-danger text-white hover:brightness-110",
};

interface Props {
  deafened: boolean;
  onDeafenedChange: (value: boolean) => void;
  onLeave: () => void;
}

export function useVoiceControls({ deafened, onDeafenedChange }: Pick<Props, "deafened" | "onDeafenedChange">) {
  const { self, state, isController } = useRoom();
  const restriction = state.restrictions[self.id];
  const serverMuted = Boolean(restriction?.muted || restriction?.deafened);
  const serverDeafened = Boolean(restriction?.deafened);
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const connection = useConnectionState();
  const supported = useScreenShareSupport();
  const speaking = useSpeaking(localParticipant);
  const ptt = usePushToTalk();
  const micBeforeDeafen = useRef(false);
  const [shareError, setShareError] = useState(false);
  const [micError, setMicError] = useState(false);

  useEffect(() => {
    if (serverMuted && isMicrophoneEnabled) void localParticipant.setMicrophoneEnabled(false);
  }, [serverMuted, isMicrophoneEnabled, localParticipant]);

  async function toggleMute() {
    playCue(isMicrophoneEnabled && !deafened ? "mute" : "unmute");
    if (deafened) onDeafenedChange(false);
    setMicError(false);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setMicError(true);
    }
  }

  function toggleDeafen() {
    const next = !deafened;
    playCue(next ? "deafen" : "undeafen");
    onDeafenedChange(next);
    if (next) {
      micBeforeDeafen.current = isMicrophoneEnabled;
      void localParticipant.setMicrophoneEnabled(false);
    } else if (micBeforeDeafen.current && !serverMuted && !ptt.enabled) {
      void localParticipant.setMicrophoneEnabled(true);
    }
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

  return {
    self, ptt, speaking, status, shareError, micError, showShare, shareAllowed, serverMuted, serverDeafened, deafened,
    micOn: isMicrophoneEnabled, sharing: isScreenShareEnabled, localParticipant,
    toggleMute, toggleDeafen, toggleShare,
  };
}

function useHold(onStart?: () => void, onEnd?: () => void) {
  const holding = useRef(false);
  return {
    start: onStart ? () => { holding.current = true; onStart(); } : undefined,
    end: onEnd ? () => { if (!holding.current) return; holding.current = false; onEnd(); } : undefined,
  };
}

function ActionButton({
  label, tone = "neutral", disabled, title, ring, onClick, onHoldStart, onHoldEnd, children,
}: {
  label: string;
  tone?: Tone;
  disabled?: boolean;
  title?: string;
  ring?: boolean;
  onClick?: () => void;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  children: React.ReactNode;
}) {
  const hold = useHold(onHoldStart, onHoldEnd);
  return (
    <button
      onClick={onClick}
      onPointerDown={hold.start}
      onPointerUp={hold.end}
      onPointerLeave={hold.end}
      onPointerCancel={hold.end}
      onContextMenu={onHoldStart ? (event) => event.preventDefault() : undefined}
      disabled={disabled}
      aria-label={title ?? label}
      title={title ?? label}
      className={`flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 compact:h-12 ${TONES[tone]} ${
        ring ? "compact:ring-2 compact:ring-live" : ""
      }`}
    >
      <span className="text-[22px] leading-none">{children}</span>
      <span className="max-w-full truncate px-1 compact:sr-only">{label}</span>
    </button>
  );
}

export function VoicePanel(props: Props) {
  const voice = useVoiceControls(props);
  const { self, ptt, status, speaking, showShare, shareAllowed, serverMuted, serverDeafened, deafened, micOn, sharing } = voice;
  const [voiceSettings, setVoiceSettings] = useState(false);
  const columns = showShare ? "grid-cols-4 compact:grid-cols-5" : "grid-cols-3 compact:grid-cols-4";

  return (
    <div className="border-t border-line bg-panel/70 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] compact:pt-2">
      <button
        onClick={() => setVoiceSettings(true)}
        aria-label="Voice settings"
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-3 rounded-xl p-1 text-left transition hover:bg-white/5 active:bg-white/10 compact:hidden"
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

      <div className={`mt-3 grid gap-2 compact:mt-0 ${columns}`}>
        {ptt.enabled ? (
          <ActionButton
            label="Hold"
            title={`Hold to talk (${keyLabel(ptt.code)})`}
            tone={ptt.talking ? "active" : "neutral"}
            ring={speaking}
            disabled={serverMuted || deafened}
            onHoldStart={() => ptt.talk(true)}
            onHoldEnd={() => ptt.talk(false, 120)}
          >
            {micOn ? <MicIcon /> : <MicOffIcon />}
          </ActionButton>
        ) : (
          <ActionButton
            label={micOn ? "Mute" : "Unmute"}
            title={serverMuted ? "Muted by the room owner" : undefined}
            tone={micOn ? "neutral" : "danger"}
            ring={speaking}
            disabled={serverMuted}
            onClick={voice.toggleMute}
          >
            {micOn ? <MicIcon /> : <MicOffIcon />}
          </ActionButton>
        )}
        <ActionButton
          label={deafened || serverDeafened ? "Undeafen" : "Deafen"}
          title={serverDeafened ? "Deafened by the room owner" : undefined}
          tone={deafened || serverDeafened ? "danger" : "neutral"}
          disabled={serverDeafened}
          onClick={voice.toggleDeafen}
        >
          {deafened || serverDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
        </ActionButton>
        {showShare && (
          <ActionButton
            label={sharing ? "Stop" : "Share"}
            title={!shareAllowed && !sharing ? "Only controllers can share their screen in this room" : sharing ? "Stop sharing" : "Share your screen"}
            tone={sharing ? "active" : "neutral"}
            disabled={!shareAllowed && !sharing}
            onClick={voice.toggleShare}
          >
            <ScreenIcon />
          </ActionButton>
        )}
        <span className="hidden compact:contents">
          <ActionButton label="Settings" title="Voice settings" onClick={() => setVoiceSettings(true)}>
            <GearIcon />
          </ActionButton>
        </span>
        <ActionButton label="Leave" tone="leave" onClick={props.onLeave}>
          <LeaveIcon />
        </ActionButton>
      </div>
      {voice.shareError && <p className="mt-2 text-xs text-danger">Couldn&apos;t start screen share.</p>}
      {voice.micError && <p role="alert" className="mt-2 text-xs text-danger">Microphone access is blocked. Allow it in your browser settings, then unmute again.</p>}
      {showShare && !shareAllowed && !sharing && <p className="mt-2 text-xs text-label-2 compact:hidden">Only controllers can share their screen in this room.</p>}
      {voiceSettings && <VoiceSettingsSheet onClose={() => setVoiceSettings(false)} />}
    </div>
  );
}

function ToolbarButton({ label, tone = "neutral", disabled, ring, onClick, children }: { label: string; tone?: Tone; disabled?: boolean; ring?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex size-9 items-center justify-center rounded-full text-lg transition active:scale-90 disabled:opacity-40 ${TONES[tone]} ${ring ? "ring-2 ring-live" : ""}`}
    >
      {children}
    </button>
  );
}

export function VoiceToolbar(props: Props) {
  const voice = useVoiceControls(props);
  const { showShare, shareAllowed, serverMuted, serverDeafened, deafened, micOn, sharing, ptt, speaking } = voice;

  return (
    <div role="toolbar" aria-label="Voice controls" className="flex items-center gap-1.5">
      {ptt.enabled ? (
        <ToolbarButton label={`Push to talk is on (${keyLabel(ptt.code)}). Hold the key to talk.`} tone={ptt.talking ? "active" : "neutral"} ring={speaking} disabled onClick={() => {}}>
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </ToolbarButton>
      ) : (
        <ToolbarButton label={serverMuted ? "Muted by the room owner" : micOn ? "Mute" : "Unmute"} tone={micOn ? "neutral" : "danger"} ring={speaking} disabled={serverMuted} onClick={voice.toggleMute}>
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </ToolbarButton>
      )}
      <ToolbarButton
        label={serverDeafened ? "Deafened by the room owner" : deafened ? "Undeafen" : "Deafen"}
        tone={deafened || serverDeafened ? "danger" : "neutral"}
        disabled={serverDeafened}
        onClick={voice.toggleDeafen}
      >
        {deafened || serverDeafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
      </ToolbarButton>
      {showShare && (
        <ToolbarButton
          label={sharing ? "Stop sharing" : shareAllowed ? "Share your screen" : "Only controllers can share"}
          tone={sharing ? "active" : "neutral"}
          disabled={!shareAllowed && !sharing}
          onClick={voice.toggleShare}
        >
          <ScreenIcon />
        </ToolbarButton>
      )}
      <ToolbarButton label="Leave room" tone="leave" onClick={props.onLeave}>
        <LeaveIcon />
      </ToolbarButton>
    </div>
  );
}
