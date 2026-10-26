"use client";

import { useState } from "react";
import { isSilent } from "@nexus/shared";
import type { CaptionState, QualityOption } from "@/lib/players/types";
import { CaptionsMenu } from "./CaptionsMenu";
import { AirPlayIcon, FillIcon, FitIcon, FullscreenIcon, PauseIcon, PlayIcon, SyncIcon, VolumeIcon, VolumeOffIcon } from "./Icons";
import { MoreMenu } from "./MoreMenu";
import { QualityMenu } from "./QualityMenu";

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

const iconButton = "flex size-10 shrink-0 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95";

export interface PlayerControlsProps {
  variant: "overlay" | "bar";
  visible: boolean;
  minimal?: boolean;
  minimalLabel?: string;
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
  canFullscreen: boolean;
  fullscreen?: boolean;
  hideVolume?: boolean;
  fit?: "fit" | "fill";
  onFit?: () => void;
  qualityOptions: QualityOption[];
  quality: string;
  qualityNote?: string;
  qualityLink?: { href: string; label: string };
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
  onMute: () => void;
  onFullscreen: () => void;
  onResync: () => void;
  onGoLive: () => void;
  onQuality: (id: string) => void;
  onAirPlay?: () => void;
  captions?: CaptionState | null;
  onCaptionTrack?: (id: string | null) => void;
  onCaptionSize?: (size: number) => void;
  captionActions?: { label: string; onClick: () => void }[];
  captionNote?: { text: string; error: boolean } | null;
}

export function PlayerControls(props: PlayerControlsProps) {
  const {
    variant, visible, minimal = false, minimalLabel = "Live on Twitch", playing, time, duration, live, atEdge, canControl, canSeek, status, volume, muted, canFullscreen, fullscreen = false, hideVolume = false, fit, onFit,
    qualityOptions, quality, qualityNote, qualityLink, onPlayPause, onSeek, onVolume, onMute, onFullscreen, onResync, onGoLive, onQuality, onAirPlay, captions, onCaptionTrack, onCaptionSize, captionActions, captionNote,
  } = props;
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
          ? `@container absolute right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 transition duration-300 ${
              visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
            }`
          : "@container px-3 pt-2 lg:px-0"
      }
    >
      <div className={`${variant === "overlay" ? "material" : "bg-panel"} flex items-center gap-1.5 rounded-2xl px-2 py-1.5 @md:gap-3 @md:px-3`}>
        {!minimal && (
          <>
            {canControl && (
              <button onClick={onPlayPause} aria-label={playing ? "Pause for everyone" : "Play for everyone"} className={iconButton}>
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
                title={atEdge ? "You're at the live edge" : canControl ? "Jump everyone to the live edge" : "Jump to the live edge"}
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
              className="hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-label-2 transition hover:bg-white/10 @lg:flex"
            >
              <span className={`size-1.5 rounded-full ${dot}`} />
              {STATUS_LABEL[status]}
              {status !== "unsynced" && <SyncIcon className="text-sm" />}
            </button>
          </>
        )}

        {minimal && <span className="flex-1 truncate px-1 text-sm text-label-2">{minimalLabel}</span>}

        {captions && onCaptionTrack && onCaptionSize && <CaptionsMenu captions={captions} onTrack={onCaptionTrack} onSize={onCaptionSize} actions={captionActions} note={captionNote} />}

        <div className="hidden @md:contents">
          <QualityMenu options={qualityOptions} value={quality} note={qualityNote} link={qualityLink} fullscreen={fullscreen} onFullscreen={canFullscreen ? onFullscreen : undefined} onSelect={onQuality} />

          {onAirPlay && (
            <button onClick={onAirPlay} aria-label="AirPlay and screen mirroring" title="AirPlay and screen mirroring" className={iconButton}>
              <AirPlayIcon />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center">
          <button onClick={onMute} aria-label={muted ? "Unmute" : "Mute"} className={iconButton}>
            {muted || isSilent(volume) ? <VolumeOffIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.02}
            value={muted || isSilent(volume) ? 0 : volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            className={`hidden h-1 w-20 accent-white ${hideVolume ? "" : "@md:block"}`}
          />
        </div>

        <MoreMenu
          qualityOptions={qualityOptions}
          quality={quality}
          qualityNote={qualityNote}
          qualityLink={qualityLink}
          onQuality={onQuality}
          fullscreen={fullscreen}
          onFullscreen={canFullscreen ? onFullscreen : undefined}
          fit={minimal ? undefined : fit}
          onFit={minimal ? undefined : onFit}
          onAirPlay={onAirPlay}
        />

        {!minimal && onFit && fit && (
          <button
            onClick={onFit}
            aria-label={fit === "fill" ? "Fit to screen" : "Fill screen"}
            aria-pressed={fit === "fill"}
            title={fit === "fill" ? "Showing the whole picture: tap to fit" : "Fill the screen (crops the edges)"}
            className={`${iconButton} max-@md:hidden`}
          >
            {fit === "fill" ? <FitIcon /> : <FillIcon />}
          </button>
        )}

        {!minimal && canFullscreen && (
          <button onClick={onFullscreen} aria-label="Fullscreen" className={iconButton}>
            <FullscreenIcon />
          </button>
        )}
      </div>
    </div>
  );
}
