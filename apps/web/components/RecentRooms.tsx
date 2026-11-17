"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadRecent, saveRecent, withoutRoom, type RecentRoom } from "@/lib/recent-rooms";
import { CloseIcon, LockIcon } from "./Icons";
import { StartsAt } from "./StartsAt";

type Lookup = { status: "checking" } | { status: "gone" } | { status: "unknown" } | { status: "open"; name: string; hasPassword: boolean; startsAt: number | null };

// One lookup per listed room per page load: the server allows 30 a minute per person.
async function lookUp(id: string): Promise<Lookup> {
  try {
    const response = await fetch(`/api/rooms/${id}`);
    if (response.status === 404) return { status: "gone" };
    if (!response.ok) return { status: "unknown" };
    const room = (await response.json()) as { name?: unknown; hasPassword?: unknown; startsAt?: unknown };
    return {
      status: "open",
      name: typeof room.name === "string" ? room.name : "",
      hasPassword: room.hasPassword === true,
      startsAt: typeof room.startsAt === "number" ? room.startsAt : null,
    };
  } catch {
    return { status: "unknown" };
  }
}

export function RecentRooms({ userId }: { userId: string }) {
  const [rooms, setRooms] = useState<RecentRoom[]>([]);
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});

  useEffect(() => {
    const listed = loadRecent(userId);
    setRooms(listed);
    setLookups(Object.fromEntries(listed.map((room) => [room.id, { status: "checking" }])));
    let cancelled = false;
    for (const room of listed) {
      void lookUp(room.id).then((result) => {
        if (cancelled) return;
        setLookups((previous) => ({ ...previous, [room.id]: result }));
        // Ended rooms stay greyed out on this visit and are gone from the list next time.
        if (result.status === "gone") saveRecent(userId, withoutRoom(loadRecent(userId), room.id));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (rooms.length === 0) return null;

  function remove(id: string) {
    const next = withoutRoom(rooms, id);
    setRooms(next);
    saveRecent(userId, withoutRoom(loadRecent(userId), id));
  }

  return (
    <section aria-label="Recent rooms" className="mt-5">
      <h2 className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-label-2 uppercase">Recent rooms</h2>
      <ul className="divide-y divide-line overflow-clip rounded-[var(--radius-card)] bg-panel">
        {rooms.map((room) => (
          <Row key={room.id} room={room} lookup={lookups[room.id] ?? { status: "checking" }} onRemove={() => remove(room.id)} />
        ))}
      </ul>
    </section>
  );
}

function Row({ room, lookup, onRemove }: { room: RecentRoom; lookup: Lookup; onRemove: () => void }) {
  const gone = lookup.status === "gone";
  const live = lookup.status === "open" ? lookup : null;
  const name = live?.name || room.name || `Room ${room.id}`;
  const startsAt = live ? (live.hasPassword ? room.startsAt : live.startsAt) : room.startsAt;
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium">{name}</span>
        {live?.hasPassword && <LockIcon aria-hidden={false} aria-label="Password protected" role="img" className="shrink-0 text-xs text-label-2" />}
      </span>
      <span className="flex min-w-0 items-center gap-2 text-xs text-label-2">
        <span className="font-mono">{room.id}</span>
        {gone ? <span>Ended</span> : <StartsAt startsAt={startsAt} className="truncate" />}
      </span>
    </>
  );

  return (
    <li className="flex items-center" data-room={room.id} data-status={lookup.status}>
      {gone ? (
        <div aria-disabled="true" className="flex min-w-0 flex-1 flex-col py-2.5 pl-4 opacity-50">
          {body}
        </div>
      ) : (
        <Link href={`/room/${room.id}`} className="flex min-w-0 flex-1 flex-col py-2.5 pl-4 transition hover:bg-white/5">
          {body}
        </Link>
      )}
      <button
        onClick={onRemove}
        aria-label={`Remove ${name} from recent rooms`}
        className="mx-2 flex size-8 shrink-0 items-center justify-center rounded-full text-label-2 transition hover:bg-white/10 hover:text-white active:scale-95"
      >
        <CloseIcon />
      </button>
    </li>
  );
}
