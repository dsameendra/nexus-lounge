"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon, TvIcon } from "./Icons";
import { TvSheet } from "./TvSheet";
import { useRoom } from "./RoomProvider";

export function RoomHeader() {
  const { state, status } = useRoom();
  const [copied, setCopied] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const roomId = state.room.id;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <header className="material z-30 shrink-0 border-b border-line pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
      <div className="flex h-14 items-center justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[15px] font-semibold tracking-tight">Nexus Lounge</span>
        <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs text-label-2">{roomId}</span>
        {status === "reconnecting" && <span className="text-xs text-warn">Reconnecting…</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTvOpen(true)}
          aria-label="TV mode"
          className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3.5 text-sm font-medium transition hover:bg-white/15 active:scale-95"
        >
          <TvIcon /> <span className="hidden sm:inline">TV</span>
        </button>
        <button
          onClick={copyInvite}
          className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/15 active:scale-95"
        >
          {copied ? <CheckIcon className="text-live" /> : <LinkIcon />}
          {copied ? "Link copied" : "Invite"}
        </button>
      </div>
      </div>
      {tvOpen && <TvSheet onClose={() => setTvOpen(false)} />}
    </header>
  );
}
