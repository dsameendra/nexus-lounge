"use client";

import { useState } from "react";
import { SCREEN_ID } from "@nexus/shared";
import { useIsSpeaking, useParticipants } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";
import { Pill } from "./Badges";
import { CrownIcon, MicOffIcon, MoreIcon, VolumeIcon, VolumeOffIcon } from "./Icons";
import { MuteForMeRow, OwnerRows, VolumeRow } from "./PersonControls";
import { Popover } from "./Popover";
import { useRoom } from "./RoomProvider";
import { UserSheet } from "./UserSheet";
import { useVoiceSettings } from "./VoiceSettings";

interface MenuState {
  identity: string;
  x: number;
  y: number;
}

function Row({ participant, onOpen, onMenu }: { participant: Participant; onOpen: () => void; onMenu: (x: number, y: number) => void }) {
  const { state, memberById } = useRoom();
  const voice = useVoiceSettings();
  const speaking = useIsSpeaking(participant);
  const name = participant.name || participant.identity;
  const member = memberById(participant.identity);
  const isRoomHost = participant.identity === state.room.hostId;
  const isCtrl = state.room.controllerIds.includes(participant.identity);
  const restriction = state.restrictions[participant.identity];
  const personal = voice.get(participant.identity);
  const quietForMe = !participant.isLocal && (personal.muted || personal.volume < 1);
  const ownerMuted = Boolean(restriction?.muted || restriction?.deafened);

  const watching =
    member?.watching === SCREEN_ID
      ? "Screen share"
      : member?.watching
        ? (state.streams.find((stream) => stream.id === member.watching)?.title ?? null)
        : null;

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
        <span className={`rounded-full p-[2.5px] transition-colors duration-150 ${speaking ? "bg-live" : "bg-transparent"}`}>
          <span className="block rounded-full bg-bg p-[1.5px]">
            <Avatar name={name} image={member?.image ?? parseImage(participant.metadata)} className="size-10" />
          </span>
        </span>
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
          <p className="truncate text-xs text-label-2">{watching ? `Watching ${watching}` : "Not watching anything"}</p>
        </div>
        {quietForMe && (
          <span title={personal.muted ? "Muted for you" : `Volume ${Math.round(personal.volume * 100)}%`} className="text-lg text-label-2">
            {personal.muted ? <VolumeOffIcon /> : <VolumeIcon />}
          </span>
        )}
        {(!participant.isMicrophoneEnabled || ownerMuted) && (
          <span title={ownerMuted ? "Muted by the room owner" : "Muted"} className={`text-lg ${ownerMuted ? "text-warn" : "text-danger"}`}>
            <MicOffIcon />
          </span>
        )}
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
  const participants = useParticipants();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
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
            onOpen={() => setProfileId(participant.identity)}
            onMenu={(x, y) => setMenu({ identity: participant.identity, x, y })}
          />
        ))}
      </ul>
      <p className="px-4 pb-2 text-[11px] text-label-3">Click a person for their profile. Right-click for volume and mute.</p>
      {menu && menuTarget && (
        <QuickMenu
          participant={menuTarget}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onProfile={() => setProfileId(menu.identity)}
        />
      )}
      {profile && <UserSheet participant={profile} onClose={() => setProfileId(null)} />}
    </div>
  );
}
