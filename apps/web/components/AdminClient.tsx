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
    members: { ref: string; name: string; guest: boolean; deafened: boolean; host: boolean }[];
    playing: { title: string; source: string } | null;
  }[];
}

function age(ms: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

type Pending = { kind: "close"; room: Overview["rooms"][number] } | { kind: "remove"; room: Overview["rooms"][number]; member: Overview["rooms"][number]["members"][number] };

export function AdminClient({ csrf }: { csrf: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string; reauth?: boolean } | null>(null);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    const body = pending.kind === "close" ? { room: pending.room.id } : { room: pending.room.id, ref: pending.member.ref };
    const response = await fetch(`/api/admin/${pending.kind}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-csrf": csrf },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    setPending(null);
    if (response?.ok) {
      setNotice({ kind: "ok", text: pending.kind === "close" ? "Room closed." : "Person removed." });
    } else {
      const result = (await response?.json().catch(() => ({}))) as { error?: string };
      if (response?.status === 403 && result.error === "reauth") setNotice({ kind: "error", text: "For safety, confirm with a fresh code first.", reauth: true });
      else if (response?.status === 404) window.location.href = "/admin/login";
      else if (result.error === "gone") setNotice({ kind: "error", text: "That is already gone." });
      else if (result.error === "host") setNotice({ kind: "error", text: "The host can't be removed. Close the room instead." });
      else if (response?.status === 429) setNotice({ kind: "error", text: "Slow down a little and try again." });
      else setNotice({ kind: "error", text: "That didn't work. Try again." });
    }
    const refreshed = await fetch("/api/admin/overview", { cache: "no-store" }).catch(() => null);
    if (refreshed?.ok) setData((await refreshed.json()) as Overview);
  }

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
      {notice && (
        <p role="status" className={`rounded-2xl px-4 py-3 text-sm ${notice.kind === "ok" ? "bg-live/15 text-live" : "bg-danger/15 text-danger"}`}>
          {notice.text}{" "}
          {notice.reauth && (
            <a href="/admin/login?reauth=1" className="font-semibold underline">
              Enter a code
            </a>
          )}
        </p>
      )}
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
              <p className="flex items-center gap-3 text-xs text-label-2">
                <span>
                  {room.memberCount} {room.memberCount === 1 ? "person" : "people"}
                  {room.tvCount > 0 && ` · ${room.tvCount} TV`}
                  {room.hasPassword && " · password"} · {age(room.createdAt)}
                </span>
                <button
                  onClick={() => setPending({ kind: "close", room })}
                  className="rounded-full bg-danger/15 px-3 py-1 font-semibold text-danger transition hover:bg-danger/25 active:scale-95"
                >
                  Close room
                </button>
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
                      {member.host ? " · host" : ""}
                      {member.guest ? " · guest" : ""}
                      {member.deafened ? " · deafened" : ""}
                    </span>
                    {!member.host && (
                      <button
                        onClick={() => setPending({ kind: "remove", room, member })}
                        aria-label={`Remove ${member.name}`}
                        className="ml-2 font-semibold text-danger hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {pending && (
        <div role="dialog" aria-modal="true" aria-label="Confirm" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
          <div className="w-full max-w-sm space-y-4 rounded-[var(--radius-sheet)] bg-panel p-6">
            <h2 className="text-lg font-semibold">{pending.kind === "close" ? "Close this room?" : "Remove this person?"}</h2>
            <p className="text-sm text-label-2">
              {pending.kind === "close" ? (
                <>
                  <bdi className="text-white">{pending.room.name || "Untitled room"}</bdi> will end for {pending.room.memberCount} {pending.room.memberCount === 1 ? "person" : "people"}. They are disconnected right away and the room is deleted.
                </>
              ) : (
                <>
                  <bdi className="text-white">{pending.member.name}</bdi>
                  {pending.member.guest ? " (guest)" : ""} will be removed from <bdi className="text-white">{pending.room.name || "this room"}</bdi> and can&apos;t rejoin it. A guest could still come back with a new guest name.
                </>
              )}
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirm}
                disabled={busy}
                className="h-11 flex-1 rounded-xl bg-danger font-semibold transition hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                {busy ? "Working…" : pending.kind === "close" ? "Close room" : "Remove"}
              </button>
              <button onClick={() => setPending(null)} className="h-11 flex-1 rounded-xl bg-panel-2 font-semibold transition hover:bg-panel-3 active:scale-95">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
