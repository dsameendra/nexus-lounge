"use client";

import { useState } from "react";
import { FullscreenIcon, PauseIcon, PlayIcon, SyncIcon, VolumeIcon, VolumeOffIcon } from "./Icons";

export type SyncStatus = "synced" | "syncing" | "waiting" | "unsynced";

function format(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const STATUS_LABEL: Record<SyncStatus, string> = {
  synced: "In sync",
  syncing: "Syncing…",
  waiting: "Starting…",
  unsynced: "Not synced",
};

export function PlayerControls({
  variant,
  visible,
  playing,
  time,
  duration,
  live,
  atEdge,
  canControl,
  canSeek,
  status,
  volume,
  muted,
  onPlayPause,
  onSeek,
  onVolume,
  onMute,
  onFullscreen,
  onResync,
  onGoLive,
  canFullscreen,
}: {
  variant: "overlay" | "bar";
  visible: boolean;
  playing: boolean;
  time: number;
  duration: number;
  live: boolean;
  atEdge: boolean;
  canControl: boolean;
  canSeek: boolean;
  status: SyncStatus;
  volume: number;
  muted: boolean;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  onFullscreen: () => void;
  onResync: () => void;
  onGoLive: () => void;
  canFullscreen: boolean;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const dot = status === "synced" ? "bg-live" : status === "unsynced" ? "bg-warn" : "bg-label-3 animate-pulse";

  function commitScrub() {
    if (scrub === null) return;
    onSeek(scrub);
    setScrub(null);
  }

  return (
    <div
      className={
        variant === "overlay"
          ? `absolute inset-x-3 bottom-3 z-20 transition duration-300 sm:inset-x-4 sm:bottom-4 ${
              visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`
          : "px-3 pt-2 lg:px-0"
      }
    >
      <div className={`${variant === "overlay" ? "material" : "bg-panel"} flex items-center gap-2 rounded-2xl px-2 py-1.5 sm:gap-3 sm:px-3`}>
        {canControl && (
          <button
            onClick={onPlayPause}
            aria-label={playing ? "Pause for everyone" : "Play for everyone"}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95"
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
        )}

        <span className="w-11 shrink-0 text-xs text-label-2 tabular-nums">{format(time)}</span>

        {live && duration <= 0 ? (
          <div className="flex-1" />
        ) : (
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(duration, 1)}
            step={0.5}
            value={Math.min(scrub ?? time, Math.max(duration, 1))}
            disabled={!canSeek}
            onChange={(event) => setScrub(Number(event.target.value))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            className="h-1 min-w-0 flex-1 accent-white disabled:opacity-60"
          />
        )}

        {live && (
          <button
            onClick={onGoLive}
            disabled={atEdge && !canControl}
            title={atEdge ? "You're at the live edge" : canControl ? "Jump everyone to the live edge" : "Jump to where the room is"}
            className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold tracking-wide uppercase transition active:scale-95 ${
              atEdge ? "bg-danger text-white" : "bg-white/15 text-label-2 hover:bg-white/25 hover:text-white"
            }`}
          >
            <span className={`size-1.5 rounded-full ${atEdge ? "bg-white" : "bg-danger"}`} />
            {atEdge ? "Live" : "Go live"}
          </button>
        )}

        <button
          onClick={onResync}
          title={status === "unsynced" ? "This source can't be time-synced" : "Resync with the room"}
          className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-label-2 transition hover:bg-white/10 sm:flex"
        >
          <span className={`size-1.5 rounded-full ${dot}`} />
          {STATUS_LABEL[status]}
          {status !== "unsynced" && <SyncIcon className="text-sm" />}
        </button>

        <div className="group/vol flex shrink-0 items-center">
          <button
            onClick={onMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95"
          >
            {muted || volume === 0 ? <VolumeOffIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.02}
            value={muted ? 0 : volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            className="hidden h-1 w-20 accent-white sm:block"
          />
        </div>

        {canFullscreen && (
          <button
            onClick={onFullscreen}
            aria-label="Fullscreen"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95"
          >
            <FullscreenIcon />
          </button>
        )}
      </div>
    </div>
  );
}
