"use client";

import { isScreenId, screenId, screenIdentity } from "@nexus/shared";
import { useConnectionQualityIndicator, useLocalParticipant } from "@livekit/components-react";
import { ConnectionQuality, type Participant } from "livekit-client";
import { Avatar, parseImage } from "./Avatar";
import { Pill, ProviderBadge } from "./Badges";
import { MuteForMeRow, OwnerRows, VolumeRow } from "./PersonControls";
import { useRoom } from "./RoomProvider";
import { Sheet } from "./Sheet";
import { SpeakingRing, useSpeaking } from "./Speaking";
import { StreamArt } from "./StreamArt";
import { useParticipantMedia } from "./useParticipantMedia";

const QUALITY: Record<string, { label: string; tone: string }> = {
  [ConnectionQuality.Excellent]: { label: "Excellent", tone: "text-live" },
  [ConnectionQuality.Good]: { label: "Good", tone: "text-live" },
  [ConnectionQuality.Poor]: { label: "Poor", tone: "text-warn" },
  [ConnectionQuality.Lost]: { label: "Lost", tone: "text-danger" },
};

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      {title && <h3 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel-2">{children}</div>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-[15px]">
      <span className="shrink-0 text-label-2">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );
}

function ActionRow({ label, tone = "accent", onClick }: { label: string; tone?: "accent" | "danger"; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-center gap-2 px-4 py-3 text-[15px] font-medium transition hover:bg-white/5 ${tone === "danger" ? "text-danger" : "text-accent"}`}>
      {label}
    </button>
  );
}

export function UserSheet({ participant, onClose }: { participant: Participant; onClose: () => void }) {
  const { state, send, isHost, isController, self, memberById, select } = useRoom();
  const { localParticipant } = useLocalParticipant();
  const speaking = useSpeaking(participant);
  const { micOn, sharing } = useParticipantMedia(participant);
  const { quality } = useConnectionQualityIndicator({ participant });
  const userId = participant.identity;
  const name = participant.name || userId;
  const member = memberById(userId);
  const isMe = userId === self.id || participant.isLocal;
  const restriction = state.restrictions[userId];
  const isRoomHost = userId === state.room.hostId;
  const isCtrl = state.room.controllerIds.includes(userId);
  const watchingId = member?.watching ?? null;
  const watchingStream = watchingId && !isScreenId(watchingId) ? state.streams.find((stream) => stream.id === watchingId) : undefined;
  const watchingScreenName = watchingId && isScreenId(watchingId) ? (memberById(screenIdentity(watchingId))?.name ?? "someone") : null;
  const showOwner = isHost && !isMe;
  const canStopTheirShare = sharing && !isMe && isController && (!isRoomHost || isHost);

  const status = restriction?.deafened
    ? { text: "Deafened by the room owner", tone: "text-warn" }
    : restriction?.muted
      ? { text: "Muted by the room owner", tone: "text-warn" }
      : member?.deafened
        ? { text: "Deafened", tone: "text-danger" }
        : !micOn
          ? { text: "Microphone off", tone: "text-label-2" }
          : speaking
            ? { text: "Speaking", tone: "text-live" }
            : { text: "Listening", tone: "text-label-2" };
  const connection = QUALITY[quality] ?? { label: "Unknown", tone: "text-label-2" };

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="mb-5 flex flex-col items-center text-center">
        <SpeakingRing speaking={speaking}>
          <Avatar name={name} image={member?.image ?? parseImage(participant.metadata)} className="size-20 text-3xl" />
        </SpeakingRing>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {isMe && <Pill>You</Pill>}
          {isRoomHost && <Pill tone="warn">Room owner</Pill>}
          {isCtrl && <Pill tone="accent">Controller</Pill>}
          {member?.guest && <Pill>Guest</Pill>}
          {sharing && <Pill tone="accent">Sharing screen</Pill>}
        </div>
      </div>

      <Group>
        <InfoRow label="Status">
          <span className={status.tone}>{status.text}</span>
        </InfoRow>
        <InfoRow label="Watching">
          {watchingStream ? (
            <span className="flex items-center justify-end gap-2.5">
              <span className="line-clamp-1 text-sm">{watchingStream.title}</span>
              <span className="aspect-video w-12 shrink-0 overflow-hidden rounded-md">
                <StreamArt stream={watchingStream} className="size-full" />
              </span>
            </span>
          ) : watchingScreenName ? (
            `${watchingScreenName}'s screen`
          ) : (
            <span className="text-label-2">Nothing</span>
          )}
        </InfoRow>
        {participant.joinedAt && (
          <InfoRow label="In the room since">{participant.joinedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</InfoRow>
        )}
        <InfoRow label="Connection">
          <span className={connection.tone}>{connection.label}</span>
        </InfoRow>
        {watchingId && !isMe && !self.guest && (
          <button
            onClick={() => {
              select(watchingId);
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 px-4 py-3 text-[15px] font-medium text-accent transition hover:bg-white/5"
          >
            {watchingStream && <ProviderBadge source={watchingStream.source} />}
            Watch what they&apos;re watching
          </button>
        )}
      </Group>

      {sharing && (
        <Group title="Screen share">
          {!isMe && !self.guest && (
            <ActionRow
              label="Watch their screen"
              onClick={() => {
                select(screenId(userId));
                onClose();
              }}
            />
          )}
          {isController && (
            <ActionRow
              label={state.featuredId === screenId(userId) ? "Stop showing to everyone" : "Show their screen to everyone"}
              onClick={() => send({ type: "stream.feature", streamId: state.featuredId === screenId(userId) ? null : screenId(userId) })}
            />
          )}
          {isMe && <ActionRow label="Stop sharing" tone="danger" onClick={() => void localParticipant.setScreenShareEnabled(false)} />}
          {canStopTheirShare && <ActionRow label="Stop their screen share" tone="danger" onClick={() => send({ type: "share.stop", userId })} />}
        </Group>
      )}

      {!isMe && (
        <Group title="Just for you">
          <VolumeRow userId={userId} />
          <MuteForMeRow userId={userId} />
        </Group>
      )}

      {showOwner && (
        <Group title="Room owner">
          <OwnerRows userId={userId} name={name} withRole onRemoved={onClose} />
        </Group>
      )}

      {isMe && <p className="rounded-2xl bg-panel-2 px-4 py-3 text-sm text-label-2">Use the buttons at the bottom of the side panel to control your own sound.</p>}
    </Sheet>
  );
}
