"use client";

import { SCREEN_ID, type Stream } from "@nexus/shared";
import { Avatar } from "./Avatar";
import { Pill, ProviderBadge } from "./Badges";
import { BroadcastIcon, PlusIcon, ScreenIcon, TrashIcon } from "./Icons";
import { MenuButton, type MenuItem } from "./Menu";
import { useRoom } from "./RoomProvider";
import { StreamArt } from "./StreamArt";
import { useEffectiveSource } from "./useEffectiveSource";

export function StreamLibrary({ onAdd }: { onAdd: () => void }) {
  const { state, self, select, send, isController, canControlStream, canAdd } = useRoom();
  const { effectiveId, featuredId, screenActive } = useEffectiveSource();

  const watchers = (id: string) => state.members.filter((member) => member.watching === id);
  const empty = state.streams.length === 0 && !screenActive;

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
          {canAdd ? "Add a YouTube or Twitch link to build your watch list." : "The host hasn't added anything yet."}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {screenActive && (
          <li>
            <Card
              active={effectiveId === SCREEN_ID}
              clickable={!self.guest}
              onClick={() => select(SCREEN_ID)}
              art={
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-accent/40 to-panel-2 text-3xl text-white/80">
                  <ScreenIcon />
                </div>
              }
              title="Screen share"
              subtitle="Live from someone in the room"
              badges={
                <>
                  <Pill tone="live">Live</Pill>
                  {featuredId === SCREEN_ID && <Pill tone="accent">On air</Pill>}
                </>
              }
              viewers={watchers(SCREEN_ID)}
              menu={
                isController
                  ? [
                      featuredId === SCREEN_ID
                        ? { label: "Stop showing to everyone", icon: <BroadcastIcon />, onSelect: () => send({ type: "stream.feature", streamId: null }) }
                        : { label: "Show to everyone", icon: <BroadcastIcon />, onSelect: () => send({ type: "stream.feature", streamId: SCREEN_ID }) },
                    ]
                  : []
              }
            />
          </li>
        )}

        {state.streams.map((stream) => (
          <li key={stream.id}>
            <StreamCard
              stream={stream}
              active={effectiveId === stream.id}
              onAir={featuredId === stream.id}
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
  viewers,
  clickable,
  onSelect,
  menu,
}: {
  stream: Stream;
  active: boolean;
  onAir: boolean;
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
        </>
      }
      viewers={viewers}
      menu={menu}
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
}) {
  return (
    <div
      className={`relative flex gap-3 rounded-2xl bg-panel p-2.5 transition ${
        active ? "ring-2 ring-accent" : clickable ? "hover:bg-panel-2" : ""
      } ${clickable ? "cursor-pointer active:scale-[0.99]" : ""}`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(event) => clickable && (event.key === "Enter" || event.key === " ") && (event.preventDefault(), onClick())}
      aria-pressed={clickable ? active : undefined}
    >
      <div className="aspect-video w-28 shrink-0 overflow-hidden rounded-xl bg-panel-2 sm:w-32">{art}</div>
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
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
      {menu.length > 0 && (
        <div className="absolute top-1.5 right-1.5">
          <MenuButton items={menu} />
        </div>
      )}
    </div>
  );
}
