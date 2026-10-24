"use client";

import { Avatar } from "./Avatar";
import { Pill } from "./Badges";
import { Sheet } from "./Sheet";
import { Switch } from "./Switch";
import { useRoom } from "./RoomProvider";
import { useVoiceSettings } from "./VoiceSettings";

export function UserSheet({ userId, name, image, onClose }: { userId: string; name: string; image: string | null; onClose: () => void }) {
  const { state, send, isHost, self, memberById } = useRoom();
  const voice = useVoiceSettings();
  const member = memberById(userId);
  const isMe = userId === self.id;
  const personal = voice.get(userId);
  const restriction = state.restrictions[userId] ?? { muted: false, deafened: false };
  const isRoomHost = userId === state.room.hostId;
  const isController = state.room.controllerIds.includes(userId);
  const percent = Math.round(personal.volume * 100);
  const showOwnerControls = isHost && !isMe;
  const canPromote = showOwnerControls && member && !member.guest;

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar name={name} image={image} className="size-14" />
        <div className="flex flex-wrap items-center gap-1.5">
          {isMe && <Pill>You</Pill>}
          {isRoomHost && <Pill tone="warn">Room owner</Pill>}
          {isController && <Pill tone="accent">Controller</Pill>}
          {member?.guest && <Pill>Guest</Pill>}
          {restriction.muted && <Pill tone="warn">Muted by owner</Pill>}
          {restriction.deafened && <Pill tone="warn">Deafened by owner</Pill>}
        </div>
      </div>

      {!isMe && (
        <section className="mb-4">
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Just for you</h3>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel-2">
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-[15px]">
                <label htmlFor={`volume-${userId}`}>Volume</label>
                <span className="text-label-2 tabular-nums">{personal.muted ? "Muted" : `${percent}%`}</span>
              </div>
              <input
                id={`volume-${userId}`}
                type="range"
                min={0}
                max={100}
                step={1}
                value={personal.muted ? 0 : percent}
                onChange={(event) => voice.set(userId, { volume: Number(event.target.value) / 100, muted: false })}
                className="h-1.5 w-full accent-white"
              />
              {percent !== 100 && !personal.muted && (
                <button onClick={() => voice.set(userId, { volume: 1 })} className="mt-2 text-xs text-accent hover:underline">
                  Reset to 100%
                </button>
              )}
            </div>
            <Switch checked={personal.muted} onChange={(muted) => voice.set(userId, { muted })} label="Mute for me" description="Only you won't hear them." />
          </div>
        </section>
      )}

      {showOwnerControls && (
        <section>
          <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Room owner</h3>
          <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel-2">
            <Switch
              checked={restriction.muted || restriction.deafened}
              onChange={(muted) => send({ type: "moderation.set", userId, muted, ...(muted ? {} : { deafened: false }) })}
              label="Mute for everyone"
              description="They can't use their microphone until you undo this."
            />
            <Switch
              checked={restriction.deafened}
              onChange={(deafened) => send({ type: "moderation.set", userId, deafened })}
              label="Deafen for everyone"
              description="They can't hear the room, and are muted too."
            />
            {canPromote && !isRoomHost && (
              <Switch
                checked={isController}
                onChange={(enabled) => send({ type: "role.setController", userId, enabled })}
                label="Controller"
                description="Can play, pause, seek and choose what the room watches."
              />
            )}
          </div>
        </section>
      )}

      {isMe && <p className="rounded-2xl bg-panel-2 px-4 py-3 text-sm text-label-2">Use the microphone and headphones buttons below the video to control your own sound.</p>}
    </Sheet>
  );
}
