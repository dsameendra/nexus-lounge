"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "./Icons";
import { useRoom } from "./RoomProvider";

export function RoomHeader() {
  const { state, status } = useRoom();
  const [copied, setCopied] = useState(false);
  const roomId = state.room.id;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <header className="material z-30 flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[15px] font-semibold tracking-tight">Nexus Lounge</span>
        <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs text-label-2">{roomId}</span>
        {status === "reconnecting" && <span className="text-xs text-warn">Reconnecting…</span>}
      </div>
      <button
        onClick={copyInvite}
        className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium transition hover:bg-white/15 active:scale-95"
      >
        {copied ? <CheckIcon className="text-live" /> : <LinkIcon />}
        {copied ? "Link copied" : "Invite"}
      </button>
    </header>
  );
}
