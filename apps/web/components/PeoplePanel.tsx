"use client";

import { useMemo, useState } from "react";
import { isScreenId, screenIdentity } from "@nexus/shared";
import { useParticipants } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";
import { Pill } from "./Badges";
import { CrownIcon, HeadphonesOffIcon, MicOffIcon, MoreIcon, ScreenIcon, VolumeIcon, VolumeOffIcon } from "./Icons";
import { MuteForMeRow, OwnerRows, VolumeRow } from "./PersonControls";
import { Popover } from "./Popover";
import { useRoom } from "./RoomProvider";
import { SpeakingRing, useSpeaking } from "./Speaking";
import { UserSheet } from "./UserSheet";
import { useParticipantMedia } from "./useParticipantMedia";
import { useVoiceSettings } from "./VoiceSettings";
import { isSilent } from "@nexus/shared";

interface MenuState {
  identity: string;
  x: number;
  y: number;
}

function useWatchingLabel(participants: Participant[]) {
  const { state } = useRoom();
  return (watching: string | null | undefined) => {
    if (!watching) return null;
    if (isScreenId(watching)) {
      const sharer = participants.find((participant) => participant.identity === screenIdentity(watching));
      return `${sharer ? sharer.name || sharer.identity : "someone"}'s screen`;
    }
    return state.streams.find((stream) => stream.id === watching)?.title ?? null;
  };
}

export function VoiceStatusIcon({ participant, className = "text-lg" }: { participant: Participant; className?: string }) {
  const { state, memberById } = useRoom();
  const { micOn } = useParticipantMedia(participant);
  const restriction = state.restrictions[participant.identity];
  const member = memberById(participant.identity);

  if (restriction?.deafened) {
    return (
      <span title="Deafened by the room owner" className={`${className} text-warn`}>
        <HeadphonesOffIcon />
      </span>
    );
  }
  if (restriction?.muted) {
    return (
      <span title="Muted by the room owner" className={`${className} text-warn`}>
        <MicOffIcon />
      </span>
    );
  }
  if (member?.deafened) {
    return (
      <span title="Deafened" className={`${className} text-danger`}>
        <HeadphonesOffIcon />
      </span>
    );
  }
  if (!micOn) {
    return (
      <span title="Muted" className={`${className} text-label-2`}>
        <MicOffIcon />
      </span>
    );
  }
  return null;
}

function Row({
  participant,
  watchingLabel,
  onOpen,
  onMenu,
}: {
  participant: Participant;
  watchingLabel: (watching: string | null | undefined) => string | null;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const { state, memberById } = useRoom();
  const voice = useVoiceSettings();
  const speaking = useSpeaking(participant);
  const { sharing } = useParticipantMedia(participant);
  const name = participant.name || participant.identity;
  const member = memberById(participant.identity);
  const isRoomHost = participant.identity === state.room.hostId;
  const isCtrl = state.room.controllerIds.includes(participant.identity);
  const restriction = state.restrictions[participant.identity];
  const personal = voice.get(participant.identity);
  const quietForMe = !participant.isLocal && (personal.muted || personal.volume < 1);
  const watching = watchingLabel(member?.watching);

  return (
    <li className="group relative">
      <button
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }}
        aria-label={`${name}, open profile`}
        className="flex w-full items-center gap-3 rounded-xl py-2 pr-12 pl-2 text-left transition hover:bg-white/5 active:bg-white/10"
      >
        <SpeakingRing speaking={speaking}>
          <Avatar name={name} image={member?.image ?? parseImage(participant.metadata)} className="size-10" />
        </SpeakingRing>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">
              {name}
              {participant.isLocal && <span className="font-normal text-label-2"> (you)</span>}
            </span>
            {isRoomHost && (
              <span title="Room owner" className="text-warn">
                <CrownIcon />
              </span>
            )}
            {isCtrl && <Pill tone="accent">Controller</Pill>}
            {member?.guest && <Pill>Guest</Pill>}
          </div>
          <p className="truncate text-xs text-label-2">
            {restriction?.deafened ? (
              <span className="text-warn">Deafened by the owner</span>
            ) : restriction?.muted ? (
              <span className="text-warn">Muted by the owner</span>
            ) : sharing ? (
              <span className="text-accent">Sharing their screen</span>
            ) : watching ? (
              `Watching ${watching}`
            ) : (
              "Not watching anything"
            )}
          </p>
        </div>
        {quietForMe && (
          <span title={personal.muted || isSilent(personal.volume) ? "Muted for you" : `Volume ${Math.round(personal.volume * 100)}%`} className="text-lg text-label-2">
            {personal.muted || isSilent(personal.volume) ? <VolumeOffIcon /> : <VolumeIcon />}
          </span>
        )}
        {sharing && (
          <span title="Sharing their screen" className="text-lg text-accent">
            <ScreenIcon />
          </span>
        )}
        <VoiceStatusIcon participant={participant} />
      </button>
      <button
        aria-label={`${name}: volume and controls`}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          onMenu(box.right - 288, box.bottom + 4);
        }}
        className="absolute top-1/2 right-1.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-lg text-label-2 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <MoreIcon />
      </button>
    </li>
  );
}

function QuickMenu({ participant, x, y, onClose, onProfile }: { participant: Participant; x: number; y: number; onClose: () => void; onProfile: () => void }) {
  const { isHost, self, state } = useRoom();
  const name = participant.name || participant.identity;
  const isMe = participant.identity === self.id || participant.isLocal;
  const member = state.members.find((item) => item.id === participant.identity);
  const showOwner = isHost && !isMe;

  return (
    <Popover x={x} y={y} onClose={onClose} label={`${name} controls`}>
      <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
        <Avatar name={name} image={member?.image ?? parseImage(participant.metadata)} className="size-7 text-xs" />
        <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
      </div>
      {!isMe && (
        <div className="divide-y divide-line">
          <VolumeRow userId={participant.identity} compact />
          <MuteForMeRow userId={participant.identity} compact />
        </div>
      )}
      {showOwner && (
        <div className="divide-y divide-line border-t border-line">
          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-label-2 uppercase">Room owner</p>
          <OwnerRows userId={participant.identity} name={name} compact onRemoved={onClose} />
        </div>
      )}
      <button
        onClick={() => {
          onClose();
          onProfile();
        }}
        className="flex w-full items-center justify-between border-t border-line px-3 py-2.5 text-sm transition hover:bg-white/10"
      >
        View profile
        <span className="text-label-2">›</span>
      </button>
    </Popover>
  );
}

export function PeoplePanel() {
  const { state } = useRoom();
  const everyone = useParticipants();
  const watchingLabel = useWatchingLabel(everyone);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const participants = useMemo(() => {
    const rank = (participant: Participant) =>
      participant.isLocal ? 0 : participant.identity === state.room.hostId ? 1 : state.room.controllerIds.includes(participant.identity) ? 2 : 3;
    return [...everyone].sort((a, b) => rank(a) - rank(b) || (a.name || a.identity).localeCompare(b.name || b.identity));
  }, [everyone, state.room.hostId, state.room.controllerIds]);

  const profile = participants.find((participant) => participant.identity === profileId);
  const menuTarget = menu ? participants.find((participant) => participant.identity === menu.identity) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-label-2 uppercase">In the room · {participants.length}</h2>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {participants.map((participant) => (
          <Row
            key={participant.identity}
            participant={participant}
            watchingLabel={watchingLabel}
            onOpen={() => setProfileId(participant.identity)}
            onMenu={(x, y) => setMenu({ identity: participant.identity, x, y })}
          />
        ))}
      </ul>
      <p className="px-4 pb-2 text-[11px] text-label-3">Click a person for their profile. Right-click for volume and mute.</p>
      {menu && menuTarget && (
        <QuickMenu participant={menuTarget} x={menu.x} y={menu.y} onClose={() => setMenu(null)} onProfile={() => setProfileId(menu.identity)} />
      )}
      {profile && <UserSheet participant={profile} onClose={() => setProfileId(null)} />}
    </div>
  );
}
