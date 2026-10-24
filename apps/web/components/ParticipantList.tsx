"use client";

import { useIsSpeaking, useParticipants } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";

function ParticipantRow({ participant, hostId }: { participant: Participant; hostId: string }) {
  const speaking = useIsSpeaking(participant);
  const name = participant.name || participant.identity;

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <span className={`rounded-full p-0.5 transition ${speaking ? "bg-live" : "bg-transparent"}`}>
        <Avatar name={name} image={parseImage(participant.metadata)} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {name}
        {participant.isLocal && <span className="text-slate-500"> (you)</span>}
      </span>
      {participant.identity === hostId && (
        <span className="rounded bg-accent-2/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-2">Host</span>
      )}
      {!participant.isMicrophoneEnabled && (
        <span title="Muted" className="text-xs text-danger">
          muted
        </span>
      )}
    </li>
  );
}

export function ParticipantList({ hostId }: { hostId: string }) {
  const participants = useParticipants();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        In voice — {participants.length}
      </h2>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {participants.map((participant) => (
          <ParticipantRow key={participant.identity} participant={participant} hostId={hostId} />
        ))}
      </ul>
    </div>
  );
}
