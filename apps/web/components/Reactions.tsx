"use client";

import { useEffect, useRef, useState } from "react";
import { REACTION_EMOJIS } from "@nexus/shared";
import type { ReactionEvent } from "@/lib/use-room-connection";
import { useRoom } from "./RoomProvider";

interface Floating extends ReactionEvent {
  left: number;
  drift: number;
}

const LIFETIME_MS = 3300;
const MAX_VISIBLE = 24;

function useReactionFeed() {
  const { onReaction } = useRoom();
  const [items, setItems] = useState<Floating[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    const stop = onReaction((reaction) => {
      const item: Floating = { ...reaction, left: 8 + Math.random() * 84, drift: Math.round((Math.random() - 0.5) * 70) };
      setItems((previous) => [...previous.slice(-(MAX_VISIBLE - 1)), item]);
      const timer = setTimeout(() => {
        setItems((previous) => previous.filter((entry) => entry.id !== item.id));
        pending.delete(timer);
      }, LIFETIME_MS);
      pending.add(timer);
    });
    return () => {
      stop();
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, [onReaction]);

  return items;
}

export function ReactionBar() {
  const { state, send, self } = useRoom();
  if (!state.room.settings.reactions) return null;

  return (
    <div role="group" aria-label="Send a reaction" className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1">
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => send({ type: "reaction.send", emoji })}
          aria-label={`React ${emoji}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/8 text-xl transition hover:bg-white/15 active:scale-90"
          disabled={self.id === "tv"}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

export function FloatingReactions() {
  const items = useReactionFeed();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {items.map((item) => (
        <div
          key={item.id}
          className="animate-reaction absolute bottom-10 flex flex-col items-center"
          style={{ left: `${item.left}%`, "--drift": `${item.drift}px` } as React.CSSProperties}
        >
          <span className="text-4xl drop-shadow-lg">{item.emoji}</span>
          <span className="mt-0.5 max-w-24 truncate rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white/90">{item.from.name}</span>
        </div>
      ))}
    </div>
  );
}

export function ReactionStrip() {
  const items = useReactionFeed();
  return (
    <div aria-live="off" className="flex min-h-9 items-center gap-2 overflow-hidden px-3 pt-2 lg:px-0">
      {items.slice(-8).map((item) => (
        <span key={item.id} className="animate-pop flex shrink-0 items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-sm">
          <span className="text-lg">{item.emoji}</span>
          <span className="max-w-20 truncate text-xs text-label-2">{item.from.name}</span>
        </span>
      ))}
    </div>
  );
}
