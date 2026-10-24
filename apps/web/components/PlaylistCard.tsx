"use client";

import { useEffect, useState } from "react";
import type { PlaylistSummary } from "@nexus/shared";
import { CheckIcon, ChevronDownIcon, PlaylistIcon, TrashIcon } from "./Icons";
import { MenuButton } from "./Menu";
import { useRoom } from "./RoomProvider";
import { Thumbnail } from "./Thumbnail";

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  const { send, self, isController, playlistItems, openPlaylist, canAdd } = useRoom();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const items = playlistItems[playlist.id];

  useEffect(() => {
    if (open && !items) openPlaylist(playlist.id);
  }, [open, items, openPlaylist, playlist.id]);

  const canRemove = isController || playlist.addedBy.id === self.id;
  const count = picked.size;
  const label = count > 0 ? `${count} selected` : `all ${playlist.count}`;

  function toggle(id: string) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function queue(position: "end" | "next") {
    send({ type: "queue.addPlaylist", listId: playlist.id, ...(count > 0 ? { videoIds: [...picked] } : {}), position });
    setPicked(new Set());
  }

  return (
    <div className="rounded-2xl bg-panel">
      <div className="flex items-center gap-1 pr-1.5">
        <button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`${playlist.title}, playlist, ${playlist.count} videos`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-panel-2"
        >
          <span className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-youtube/30 to-panel-2 text-3xl text-white/80 sm:w-32">
            {items?.[0] ? <Thumbnail videoId={items[0].id} className="size-full" /> : <PlaylistIcon />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-sm leading-snug font-medium">{playlist.title}</span>
            <span className="mt-0.5 block truncate text-xs text-label-2">
              Playlist · {playlist.count} videos · {playlist.addedBy.name}
            </span>
          </span>
          <ChevronDownIcon className={`shrink-0 text-lg text-label-2 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {canRemove && (
          <MenuButton
            label={`Actions for ${playlist.title}`}
            items={[{ label: "Remove playlist", icon: <TrashIcon />, danger: true, onSelect: () => send({ type: "playlist.remove", listId: playlist.id }) }]}
          />
        )}
      </div>

      {open && (
        <div className="border-t border-line px-2.5 pt-2 pb-2.5">
          {!items ? (
            <p className="px-1 py-3 text-sm text-label-2">Loading videos…</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between px-1 text-xs text-label-2">
                <span>{count > 0 ? `${count} of ${items.length} selected` : "Tap videos to pick some, or add them all."}</span>
                <button
                  onClick={() => setPicked(count === items.length ? new Set() : new Set(items.map((item) => item.id)))}
                  className="rounded-full px-2 py-1 font-medium text-accent transition hover:bg-white/10"
                >
                  {count === items.length ? "Select none" : "Select all"}
                </button>
              </div>
              <ul role="listbox" aria-multiselectable="true" aria-label={`Videos in ${playlist.title}`} className="scroll-thin max-h-72 space-y-1 overflow-y-auto pr-0.5">
                {items.map((item, index) => {
                  const on = picked.has(item.id);
                  return (
                    <li key={item.id} role="option" aria-selected={on}>
                      <button
                        onClick={() => toggle(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition ${on ? "bg-accent/15" : "hover:bg-panel-2"}`}
                      >
                        <span
                          className={`flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                            on ? "border-accent bg-accent text-white" : "border-label-3 text-transparent"
                          }`}
                        >
                          <CheckIcon />
                        </span>
                        <span className="w-5 shrink-0 text-center text-[11px] text-label-3 tabular-nums">{index + 1}</span>
                        <Thumbnail videoId={item.id} className="aspect-video w-16 shrink-0 rounded-md" />
                        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug">{item.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {canAdd ? (
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => queue("end")}
                    className="h-10 flex-1 rounded-xl bg-accent px-3 text-sm font-semibold transition hover:brightness-110 active:scale-[0.99]"
                  >
                    Add {label} to queue
                  </button>
                  <button
                    onClick={() => queue("next")}
                    className="h-10 rounded-xl bg-panel-2 px-3 text-sm font-semibold transition hover:bg-panel-3 active:scale-[0.99]"
                  >
                    Play next
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-label-2">Sign in with Discord to add videos to the queue.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
