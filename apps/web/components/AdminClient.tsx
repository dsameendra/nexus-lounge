"use client";

import { useEffect, useState } from "react";

interface Overview {
  generatedAt: number;
  totals: { rooms: number; people: number };
  truncated: boolean;
  rooms: {
    id: string;
    name: string;
    host: string;
    createdAt: number;
    hasPassword: boolean;
    memberCount: number;
    tvCount: number;
    members: { name: string; guest: boolean; deafened: boolean }[];
    playing: { title: string; source: string } | null;
  }[];
}

function age(ms: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AdminClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let delay = 5000;
    let stopped = false;
    async function load() {
      if (document.hidden) return schedule();
      const response = await fetch("/api/admin/overview", { cache: "no-store" }).catch(() => null);
      if (stopped) return;
      if (response?.status === 404) {
        window.location.href = "/admin/login";
        return;
      }
      if (response?.ok) {
        setData((await response.json()) as Overview);
        setError(false);
        delay = 5000;
      } else {
        setError(true);
        delay = Math.min(delay * 2, 60_000);
      }
      schedule();
    }
    function schedule() {
      timer = setTimeout(load, delay);
    }
    void load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  if (!data) return <p className="text-label-2">{error ? "Couldn't load. Retrying…" : "Loading…"}</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-label-2 uppercase">Active rooms</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{data.totals.rooms}</p>
        </div>
        <div className="rounded-2xl bg-panel p-4">
          <p className="text-xs font-semibold tracking-wide text-label-2 uppercase">People online</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{data.totals.people}</p>
        </div>
      </div>
      {error && <p className="text-sm text-warn">Connection problem. Showing the last update.</p>}
      {data.truncated && <p className="text-sm text-warn">Showing the first {data.rooms.length} rooms only.</p>}
      {data.rooms.length === 0 && <p className="rounded-2xl bg-panel p-4 text-label-2">No rooms right now.</p>}
      <ul className="space-y-3">
        {data.rooms.map((room) => (
          <li key={room.id} className="rounded-2xl bg-panel p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0 truncate font-semibold">
                <bdi>{room.name || "Untitled room"}</bdi> <span className="font-mono text-xs text-label-3">{room.id}</span>
              </p>
              <p className="text-xs text-label-2">
                {room.memberCount} {room.memberCount === 1 ? "person" : "people"}
                {room.tvCount > 0 && ` · ${room.tvCount} TV`}
                {room.hasPassword && " · password"} · {age(room.createdAt)}
              </p>
            </div>
            <p className="mt-1 text-sm text-label-2">
              Host <bdi className="text-white">{room.host}</bdi>
              {room.playing && (
                <>
                  {" "}
                  · {room.playing.source}: <bdi className="text-white">{room.playing.title}</bdi>
                </>
              )}
            </p>
            {room.members.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {room.members.map((member, index) => (
                  <li key={index} className="rounded-full bg-white/10 px-3 py-1 text-xs">
                    <bdi>{member.name}</bdi>
                    <span className="text-label-3">
                      {member.guest ? " · guest" : ""}
                      {member.deafened ? " · deafened" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
