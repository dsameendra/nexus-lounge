"use client";

import { isDeviceSource, screenId, streamKey, type Stream } from "@nexus/shared";
import { useLocalParticipant } from "@livekit/components-react";
import { Avatar } from "./Avatar";
import { Pill, ProviderBadge } from "./Badges";
import { BroadcastIcon, ChevronDownIcon, ChevronUpIcon, PlaylistIcon, PlusIcon, QueueNextIcon, ScreenIcon, TrashIcon } from "./Icons";
import { DeviceFooter } from "./DeviceFooter";
import { MenuButton, type MenuItem } from "./Menu";
import { PlaylistCard } from "./PlaylistCard";
import { QueueSection } from "./QueueSection";
import { useRoom } from "./RoomProvider";
import { StreamArt } from "./StreamArt";
import { shareName, useEffectiveSource } from "./useEffectiveSource";

export function StreamLibrary({ onAdd }: { onAdd: () => void }) {
  const { state, self, select, send, isController, isHost, canControlStream, canAdd } = useRoom();
  const { effectiveId, featuredId, shares } = useEffectiveSource();
  const { localParticipant } = useLocalParticipant();

  const featuredIndex = state.streams.findIndex((stream) => stream.id === featuredId);
  const queuedHead = state.queue[0];
  const upNextId = !state.room.settings.autoplayNext
    ? undefined
    : queuedHead
      ? streamKey(queuedHead.source)
      : featuredIndex >= 0
        ? state.streams[featuredIndex + 1]?.id
        : undefined;
  const watchers = (id: string) => state.members.filter((member) => member.watching === id);
  const empty = state.streams.length === 0 && shares.length === 0 && state.playlists.length === 0;

  return (
    <section aria-label="Streams" className="px-4 pt-5 pb-6 lg:px-0 lg:pt-7">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Streams</h2>
        {canAdd && (
          <button
            onClick={onAdd}
            className="flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold transition hover:brightness-110 active:scale-95"
          >
            <PlusIcon /> Add
          </button>
        )}
      </div>

      {self.guest && (
        <p className="mb-3 rounded-xl bg-panel px-4 py-3 text-sm text-label-2">
          You're watching along as a guest. Sign in with Discord to pick your own stream and add links.
        </p>
      )}

      {empty && (
        <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-label-2">
          {canAdd ? "Add a YouTube, Twitch or Kick link to build your watch list." : "The host hasn't added anything yet."}
        </div>
      )}

      <QueueSection />

      {state.playlists.length > 0 && (
        <section aria-label="Playlists" className="mb-5 space-y-2">
          <h3 className="text-sm font-semibold">Playlists</h3>
          {state.playlists.map((playlist) => (
            <PlaylistCard key={playlist.id} playlist={playlist} />
          ))}
        </section>
      )}

      {(state.streams.length > 0 || shares.length > 0) && state.playlists.length + state.queue.length > 0 && <h3 className="mb-2 text-sm font-semibold">Library</h3>}

      <ul className="grid gap-3 sm:grid-cols-2 pl:grid-cols-1 lg:grid-cols-1 xl:grid-cols-2">
        {shares.map((share) => {
          const id = screenId(share.participant.identity);
          const mine = share.participant.isLocal;
          const protectedOwner = share.participant.identity === state.room.hostId && !isHost;
          const menu = [
            ...(isController
              ? [
                  featuredId === id
                    ? { label: "Stop showing to everyone", icon: <BroadcastIcon />, onSelect: () => send({ type: "stream.feature", streamId: null }) }
                    : { label: "Show to everyone", icon: <BroadcastIcon />, onSelect: () => send({ type: "stream.feature", streamId: id }) },
                ]
              : []),
            ...(mine
              ? [{ label: "Stop sharing", icon: <TrashIcon />, danger: true, onSelect: () => void localParticipant.setScreenShareEnabled(false) }]
              : isController && !protectedOwner
                ? [{ label: "Stop their screen share", icon: <TrashIcon />, danger: true, onSelect: () => send({ type: "share.stop", userId: share.participant.identity }) }]
                : []),
          ];
          return (
            <li key={id}>
              <Card
                active={effectiveId === id}
                clickable={!self.guest}
                onClick={() => select(id)}
                art={
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-accent/40 to-panel-2 text-3xl text-white/80">
                    <ScreenIcon />
                  </div>
                }
                title={`${shareName(share)}'s screen`}
                subtitle={mine ? "You're sharing" : "Live screen share"}
                badges={
                  <>
                    <Pill tone="live">Live</Pill>
                    {featuredId === id && <Pill tone="accent">On air</Pill>}
                  </>
                }
                viewers={watchers(id)}
                menu={menu}
              />
            </li>
          );
        })}

        {state.streams.map((stream, index) => (
          <li key={stream.id}>
            <StreamCard
              stream={stream}
              active={effectiveId === stream.id}
              onAir={featuredId === stream.id}
              upNext={stream.id === upNextId}
              viewers={watchers(stream.id)}
              clickable={!self.guest}
              onSelect={() => select(stream.id)}
              menu={[
                ...(isController
                  ? [
                      featuredId === stream.id
                        ? { label: "Stop showing to everyone", icon: <BroadcastIcon />, onSelect: () => send({ type: "stream.feature", streamId: null }) }
                        : { label: "Show to everyone", icon: <BroadcastIcon />, onSelect: () => send({ type: "stream.feature", streamId: stream.id }) },
                    ]
                  : []),
                ...(canAdd && !stream.source.isLive && !isDeviceSource(stream.source)
                  ? [
                      { label: "Add to queue", icon: <PlaylistIcon />, onSelect: () => send({ type: "queue.addStream", streamId: stream.id, position: "end" }) },
                      { label: "Play next", icon: <QueueNextIcon />, onSelect: () => send({ type: "queue.addStream", streamId: stream.id, position: "next" }) },
                    ]
                  : []),
                ...(isController && index > 0
                  ? [{ label: "Move up", icon: <ChevronUpIcon />, onSelect: () => send({ type: "stream.move", streamId: stream.id, direction: "up" }) }]
                  : []),
                ...(isController && index < state.streams.length - 1
                  ? [{ label: "Move down", icon: <ChevronDownIcon />, onSelect: () => send({ type: "stream.move", streamId: stream.id, direction: "down" }) }]
                  : []),
                ...(canControlStream(stream)
                  ? [{ label: "Remove", icon: <TrashIcon />, danger: true, onSelect: () => send({ type: "stream.remove", streamId: stream.id }) }]
                  : []),
              ]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StreamCard({
  stream,
  active,
  onAir,
  upNext,
  viewers,
  clickable,
  onSelect,
  menu,
}: {
  stream: Stream;
  active: boolean;
  onAir: boolean;
  upNext: boolean;
  viewers: ReturnType<typeof useRoom>["state"]["members"];
  clickable: boolean;
  onSelect: () => void;
  menu: MenuItem[];
}) {
  const live = stream.source.isLive;
  return (
    <Card
      active={active}
      clickable={clickable}
      onClick={onSelect}
      art={<StreamArt stream={stream} className="size-full" />}
      title={stream.title}
      subtitle={`Added by ${stream.addedBy.name}`}
      badges={
        <>
          <ProviderBadge source={stream.source} />
          {live && <Pill tone="live">Live</Pill>}
          {onAir && <Pill tone="accent">On air</Pill>}
          {upNext && <Pill>Up next</Pill>}
        </>
      }
      viewers={viewers}
      menu={menu}
      footer={isDeviceSource(stream.source) ? <DeviceFooter stream={stream} /> : undefined}
    />
  );
}

function Card({
  active,
  clickable,
  onClick,
  art,
  title,
  subtitle,
  badges,
  viewers,
  menu = [],
  footer,
}: {
  active: boolean;
  clickable: boolean;
  onClick: () => void;
  art: React.ReactNode;
  title: string;
  subtitle: string;
  badges: React.ReactNode;
  viewers: ReturnType<typeof useRoom>["state"]["members"];
  menu?: MenuItem[];
  footer?: React.ReactNode;
}) {
  return (
    <div
      className={`relative rounded-2xl bg-panel p-2.5 transition ${
        active ? "ring-2 ring-accent" : clickable ? "hover:bg-panel-2" : ""
      } ${clickable ? "active:scale-[0.99]" : ""}`}
    >
      {clickable && (
        <button type="button" onClick={onClick} aria-pressed={active} aria-label={`Watch ${title}`} className="absolute inset-0 rounded-2xl" />
      )}
      <div className="flex gap-3">
      <div className="pointer-events-none aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-panel-2 sm:w-32">{art}</div>
      <div className="pointer-events-none flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div className={`min-w-0 ${menu.length > 0 ? "pr-8" : ""}`}>
          <p className="line-clamp-2 text-sm leading-snug font-medium">{title}</p>
          <p className="mt-0.5 truncate text-xs text-label-2">{subtitle}</p>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">{badges}</div>
          {viewers.length > 0 && (
            <div className="flex shrink-0 items-center" title={viewers.map((viewer) => viewer.name).join(", ")}>
              <div className="flex -space-x-1.5">
                {viewers.slice(0, 3).map((viewer) => (
                  <Avatar key={viewer.id} name={viewer.name} image={viewer.image} className="size-5 ring-2 ring-panel" />
                ))}
              </div>
              {viewers.length > 3 && <span className="ml-1 text-[11px] text-label-2">+{viewers.length - 3}</span>}
            </div>
          )}
        </div>
      </div>
      </div>
      {footer}
      {menu.length > 0 && (
        <div className="absolute top-1.5 right-1.5 z-10">
          <MenuButton items={menu} />
        </div>
      )}
    </div>
  );
}
