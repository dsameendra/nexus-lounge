"use client";

import { useState } from "react";

export function RoomHeader({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <header className="flex items-center justify-between border-b border-line bg-panel px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text font-bold text-transparent">Nexus Lounge</span>
        <span className="rounded bg-panel-2 px-2 py-0.5 font-mono text-xs text-slate-400">{roomId}</span>
      </div>
      <button
        onClick={copyInvite}
        className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm transition hover:border-accent"
      >
        {copied ? "Copied!" : "Copy invite link"}
      </button>
    </header>
  );
}
