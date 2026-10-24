"use client";

import { SCREEN_ID } from "@nexus/shared";
import { useIsSpeaking, useParticipants } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";
import { Pill } from "./Badges";
import { CrownIcon, MicOffIcon } from "./Icons";
import { MenuButton } from "./Menu";
import { useRoom } from "./RoomProvider";

function Row({ participant }: { participant: Participant }) {
  const { state, send, isHost, memberById } = useRoom();
  const speaking = useIsSpeaking(participant);
  const name = participant.name || participant.identity;
  const member = memberById(participant.identity);
  const isRoomHost = participant.identity === state.room.hostId;
  const isCtrl = state.room.controllerIds.includes(participant.identity);

  const watching =
    member?.watching === SCREEN_ID
      ? "Screen share"
      : member?.watching
        ? (state.streams.find((stream) => stream.id === member.watching)?.title ?? null)
        : null;

  const canPromote = isHost && !participant.isLocal && member && !member.guest && !isRoomHost;

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
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
            <span title="Host" className="text-warn">
              <CrownIcon />
            </span>
          )}
          {isCtrl && <Pill tone="accent">Controller</Pill>}
          {member?.guest && <Pill>Guest</Pill>}
        </div>
        <p className="truncate text-xs text-label-2">{watching ? `Watching ${watching}` : "Not watching anything"}</p>
      </div>
      {!participant.isMicrophoneEnabled && (
        <span title="Muted" className="text-lg text-danger">
          <MicOffIcon />
        </span>
      )}
      {canPromote && (
        <MenuButton
          items={[
            {
              label: isCtrl ? "Remove controller" : "Make controller",
              onSelect: () => send({ type: "role.setController", userId: participant.identity, enabled: !isCtrl }),
            },
          ]}
        />
      )}
    </li>
  );
}

export function PeoplePanel() {
  const participants = useParticipants();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-label-2 uppercase">In the room · {participants.length}</h2>
      <ul className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {participants.map((participant) => (
          <Row key={participant.identity} participant={participant} />
        ))}
      </ul>
    </div>
  );
}
