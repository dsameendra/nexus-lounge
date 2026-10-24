"use client";

import { useState } from "react";
import { isSilent } from "@nexus/shared";
import { VolumeIcon, VolumeOffIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { Switch } from "./Switch";
import { useVoiceSettings } from "./VoiceSettings";

export function VolumeRow({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const voice = useVoiceSettings();
  const personal = voice.get(userId);
  const percent = Math.round(personal.volume * 100);
  const silent = personal.muted || isSilent(personal.volume);

  return (
    <div className={compact ? "px-3 py-2.5" : "px-4 py-3"}>
      <div className={`mb-2 flex items-center justify-between ${compact ? "text-sm" : "text-[15px]"}`}>
        <label htmlFor={`volume-${userId}`}>Volume</label>
        <span className="text-label-2 tabular-nums">{silent ? "Muted" : `${percent}%`}</span>
      </div>
      <div className="flex items-center gap-2.5 text-lg text-label-2">
        <VolumeOffIcon />
        <input
          id={`volume-${userId}`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={silent ? 0 : percent}
          onChange={(event) => voice.set(userId, { volume: Number(event.target.value) / 100, muted: false })}
          className="h-1.5 min-w-0 flex-1 accent-white"
        />
        <VolumeIcon />
      </div>
      {percent !== 100 && !silent && (
        <button onClick={() => voice.set(userId, { volume: 1 })} className="mt-2 text-xs text-accent hover:underline">
          Reset to 100%
        </button>
      )}
    </div>
  );
}

export function MuteForMeRow({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const voice = useVoiceSettings();
  return (
    <Switch
      compact={compact}
      checked={voice.get(userId).muted}
      onChange={(muted) => voice.set(userId, { muted })}
      label="Mute for me"
      description={compact ? undefined : "Only you won't hear them."}
    />
  );
}

function RemoveRow({ userId, name, compact, onRemoved }: { userId: string; name: string; compact: boolean; onRemoved: () => void }) {
  const { send } = useRoom();
  const [confirming, setConfirming] = useState(false);
  const pad = compact ? "px-3 py-2" : "px-4 py-3";

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className={`w-full text-left ${pad} ${compact ? "text-sm" : "text-[15px]"} text-danger transition hover:bg-white/5`}>
        Remove from room…
      </button>
    );
  }
  return (
    <div className={pad}>
      <p className={`${compact ? "text-xs" : "text-sm"} mb-2 text-label-2`}>Remove {name}? They won&apos;t be able to rejoin this room.</p>
      <div className="flex gap-2">
        <button onClick={() => setConfirming(false)} className="h-9 flex-1 rounded-full bg-white/10 text-sm font-medium transition hover:bg-white/15 active:scale-95">
          Cancel
        </button>
        <button
          onClick={() => {
            send({ type: "moderation.kick", userId });
            onRemoved();
          }}
          className="h-9 flex-1 rounded-full bg-danger text-sm font-semibold transition hover:brightness-110 active:scale-95"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export function OwnerRows({
  userId,
  name,
  onRemoved,
  compact = false,
  withRole = false,
}: {
  userId: string;
  name: string;
  onRemoved: () => void;
  compact?: boolean;
  withRole?: boolean;
}) {
  const { state, send, memberById } = useRoom();
  const restriction = state.restrictions[userId] ?? { muted: false, deafened: false };
  const member = memberById(userId);
  const isController = state.room.controllerIds.includes(userId);
  const canPromote = withRole && member && !member.guest && userId !== state.room.hostId;
  const hint = (text: string) => (compact ? undefined : text);

  return (
    <>
      <Switch
        compact={compact}
        checked={restriction.muted || restriction.deafened}
        onChange={(muted) => send({ type: "moderation.set", userId, muted, ...(muted ? {} : { deafened: false }) })}
        label="Mute for everyone"
        description={hint("They can't use their microphone until you undo this.")}
      />
      <Switch
        compact={compact}
        checked={restriction.deafened}
        onChange={(deafened) => send({ type: "moderation.set", userId, deafened })}
        label="Deafen for everyone"
        description={hint("They can't hear the room, and are muted too.")}
      />
      {canPromote && (
        <Switch
          compact={compact}
          checked={isController}
          onChange={(enabled) => send({ type: "role.setController", userId, enabled })}
          label="Controller"
          description={hint("Can play, pause, seek and choose what the room watches.")}
        />
      )}
      <RemoveRow userId={userId} name={name} compact={compact} onRemoved={onRemoved} />
    </>
  );
}
