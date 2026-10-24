"use client";

import { useEffect, useState } from "react";
import { VoiceToolbar } from "./Dock";
import { CheckIcon, GearIcon, LinkIcon, SidebarIcon, TvIcon } from "./Icons";
import { Logo } from "./Logo";
import { RoomSettingsSheet } from "./RoomSettingsSheet";
import { TvSheet } from "./TvSheet";
import { useRoom } from "./RoomProvider";

export function RoomHeader({
  panelOpen,
  onTogglePanel,
  unread,
  deafened,
  onDeafenedChange,
  onLeave,
}: {
  panelOpen: boolean;
  onTogglePanel: () => void;
  unread: number;
  deafened: boolean;
  onDeafenedChange: (value: boolean) => void;
  onLeave: () => void;
}) {
  const { state, status, isHost } = useRoom();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tvOpen, setTvOpen] = useState(false);
  const roomId = state.room.id;
  const title = state.room.name || "Nexus Lounge";

  useEffect(() => {
    document.title = state.room.name ? `${state.room.name} · Nexus Lounge` : "Nexus Lounge";
  }, [state.room.name]);

  useEffect(() => {
    const open = () => setTvOpen(true);
    window.addEventListener("nexus:open-tv", open);
    return () => window.removeEventListener("nexus:open-tv", open);
  }, []);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <header className="material z-30 shrink-0 border-b border-line pt-[env(safe-area-inset-top)] max-lg:px-4 lg:px-4 pl:px-3">
      <div className="flex h-14 items-center justify-between pl:h-11">
      <div className="flex min-w-0 items-center gap-3">
        <Logo size={28} />
        <span className="max-w-[40vw] truncate text-[15px] font-semibold tracking-tight">{title}</span>
        <span className="hidden rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs text-label-2 sm:inline-block pl:hidden">{roomId}</span>
        {status === "reconnecting" && <span className="text-xs text-warn">Reconnecting…</span>}
      </div>
      <div className="flex items-center gap-2">
        {!panelOpen && (
          <div className="mr-1 hidden lg:block pl:block">
            <VoiceToolbar deafened={deafened} onDeafenedChange={onDeafenedChange} onLeave={onLeave} />
          </div>
        )}
        {isHost && (
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Room settings"
            className="flex size-9 items-center justify-center rounded-full bg-white/10 text-lg pl:size-8 transition hover:bg-white/15 active:scale-95"
          >
            <GearIcon />
          </button>
        )}
        <button
          onClick={() => setTvOpen(true)}
          aria-label="TV mode"
          className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3.5 text-sm pl:h-8 pl:px-3 font-medium transition hover:bg-white/15 active:scale-95"
        >
          <TvIcon /> <span className="hidden sm:inline pl:sr-only">TV</span>
        </button>
        <button
          onClick={copyInvite}
          className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-4 text-sm pl:h-8 pl:px-3 font-medium transition hover:bg-white/15 active:scale-95"
        >
          {copied ? <CheckIcon className="text-live" /> : <LinkIcon />}
          <span className="pl:sr-only">{copied ? "Link copied" : "Invite"}</span>
        </button>
        <button
          onClick={onTogglePanel}
          aria-label={panelOpen ? "Hide side panel" : "Show side panel"}
          aria-pressed={!panelOpen}
          title={`${panelOpen ? "Hide" : "Show"} side panel (\\)`}
          className="relative hidden size-9 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-white/15 active:scale-95 pl:size-8 lg:flex pl:flex"
        >
          <SidebarIcon />
          {!panelOpen && unread > 0 && (
            <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-semibold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
      </div>
      {tvOpen && <TvSheet onClose={() => setTvOpen(false)} />}
      {settingsOpen && <RoomSettingsSheet onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
