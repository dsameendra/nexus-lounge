"use client";

import type { QueueItem } from "@nexus/shared";
import { Pill, ProviderBadge } from "./Badges";
import { BroadcastIcon, ChevronDownIcon, ChevronUpIcon, QueueNextIcon, TrashIcon } from "./Icons";
import { MenuButton, type MenuItem } from "./Menu";
import { useRoom } from "./RoomProvider";
import { Thumbnail } from "./Thumbnail";

export function QueueSection() {
  const { state, send, isController, self } = useRoom();
  const { queue } = state;
  if (queue.length === 0) return null;

  return (
    <section aria-label="Up next" className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Up next <Pill>{queue.length}</Pill>
        </h3>
        {isController && (
          <button
            onClick={() => send({ type: "queue.clear" })}
            className="rounded-full px-3 py-1 text-xs font-medium text-label-2 transition hover:bg-white/10 hover:text-white active:scale-95"
          >
            Clear
          </button>
        )}
      </div>
      <ol className="space-y-1.5">
        {queue.map((item, index) => (
          <QueueRow key={item.id} item={item} index={index} last={index === queue.length - 1} canManage={isController} mine={item.addedBy.id === self.id} />
        ))}
      </ol>
      {!state.room.settings.autoplayNext && <p className="mt-2 text-xs text-label-2">Auto-play next is off in room settings, so the queue waits for a controller.</p>}
    </section>
  );
}

function QueueRow({ item, index, last, canManage, mine }: { item: QueueItem; index: number; last: boolean; canManage: boolean; mine: boolean }) {
  const { send } = useRoom();
  const items: MenuItem[] = [
    ...(canManage ? [{ label: "Play now", icon: <BroadcastIcon />, onSelect: () => send({ type: "queue.playNow", queueId: item.id }) }] : []),
    ...(canManage && index > 0 ? [{ label: "Move to top", icon: <QueueNextIcon />, onSelect: () => send({ type: "queue.move", queueId: item.id, direction: "top" }) }] : []),
    ...(canManage && index > 0 ? [{ label: "Move up", icon: <ChevronUpIcon />, onSelect: () => send({ type: "queue.move", queueId: item.id, direction: "up" }) }] : []),
    ...(canManage && !last ? [{ label: "Move down", icon: <ChevronDownIcon />, onSelect: () => send({ type: "queue.move", queueId: item.id, direction: "down" }) }] : []),
    ...(canManage || mine ? [{ label: "Remove from queue", icon: <TrashIcon />, danger: true, onSelect: () => send({ type: "queue.remove", queueId: item.id }) }] : []),
  ];

  return (
    <li data-queue-id={item.id} className="flex items-center gap-2.5 rounded-xl bg-panel p-2">
      <span className="w-5 shrink-0 text-center text-xs text-label-3 tabular-nums">{index + 1}</span>
      <Thumbnail videoId={item.source.id} className="aspect-video w-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug font-medium">{item.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-label-2">
          <ProviderBadge source={item.source} /> {item.addedBy.name}
        </p>
      </div>
      <MenuButton items={items} label={`Actions for ${item.title}`} />
    </li>
  );
}
