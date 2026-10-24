"use client";

import { useState } from "react";
import { SCREEN_ID } from "@nexus/shared";
import { useIsSpeaking, useParticipants } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";
import { Pill } from "./Badges";
import { CrownIcon, MicOffIcon, VolumeIcon, VolumeOffIcon } from "./Icons";
import { useRoom } from "./RoomProvider";
import { UserSheet } from "./UserSheet";
import { useVoiceSettings } from "./VoiceSettings";

function Row({ participant, onOpen }: { participant: Participant; onOpen: () => void }) {
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
    <li>
      <button
        onClick={onOpen}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpen();
        }}
        aria-label={`${name}: voice settings`}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/5 active:bg-white/10"
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
    </li>
  );
}

export function PeoplePanel() {
  const participants = useParticipants();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = participants.find((participant) => participant.identity === openId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-label-2 uppercase">In the room · {participants.length}</h2>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {participants.map((participant) => (
          <Row key={participant.identity} participant={participant} onOpen={() => setOpenId(participant.identity)} />
        ))}
      </ul>
      {open && (
        <UserSheet
          userId={open.identity}
          name={open.name || open.identity}
          image={parseImage(open.metadata)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
