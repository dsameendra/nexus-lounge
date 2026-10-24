"use client";

import { Avatar } from "./Avatar";
import { useRoom } from "./RoomProvider";

export function JoinRequests() {
  const { state, send, isHost } = useRoom();
  if (!isHost || state.pending.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Join requests"
      className="fixed right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 top-[calc(3.5rem+env(safe-area-inset-top)+0.5rem)]"
    >
      {state.pending.map((request) => (
        <div key={request.id} className="material animate-sheet rounded-2xl border border-line p-3 shadow-2xl">
          <div className="flex items-center gap-3">
            <Avatar name={request.name} image={request.image} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{request.name}</p>
              <p className="text-xs text-label-2">Guest, waiting to join</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => send({ type: "join.respond", userId: request.id, allow: false })}
              className="h-10 flex-1 rounded-full bg-white/10 text-sm font-medium transition hover:bg-white/15 active:scale-95"
            >
              Decline
            </button>
            <button
              onClick={() => send({ type: "join.respond", userId: request.id, allow: true })}
              className="h-10 flex-1 rounded-full bg-accent text-sm font-semibold transition hover:brightness-110 active:scale-95"
            >
              Let in
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
