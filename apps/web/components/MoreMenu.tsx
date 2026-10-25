"use client";

import { useState } from "react";
import type { QualityOption } from "@/lib/players/types";
import { AirPlayIcon, ChevronLeftIcon, FillIcon, FitIcon, GearIcon, MoreIcon } from "./Icons";
import { Popover } from "./Popover";
import { QualityPanel } from "./QualityMenu";

const row = "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-white/10";

export function MoreMenu({
  qualityOptions,
  quality,
  qualityNote,
  qualityLink,
  onQuality,
  fullscreen,
  onFullscreen,
  fit,
  onFit,
  onAirPlay,
}: {
  qualityOptions: QualityOption[];
  quality: string;
  qualityNote?: string;
  qualityLink?: { href: string; label: string };
  onQuality: (id: string) => void;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  fit?: "fit" | "fill";
  onFit?: () => void;
  onAirPlay?: () => void;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [view, setView] = useState<"root" | "quality">("root");
  const hasQuality = qualityOptions.length > 0 || Boolean(qualityNote);
  const hasFit = Boolean(onFit && fit);
  if (!hasQuality && !hasFit && !onAirPlay) return null;
  const currentQuality = qualityOptions.find((option) => option.id === quality)?.label ?? "Auto";
  const close = () => {
    setAnchor(null);
    setView("root");
  };

  return (
    <>
      <button
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          if (anchor) close();
          else setAnchor({ x: box.right - 224, y: box.top - 8 });
        }}
        aria-label="More"
        aria-expanded={Boolean(anchor)}
        title="More"
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-label-2 transition hover:bg-white/10 hover:text-white active:scale-95 @md:hidden"
      >
        <MoreIcon />
      </button>
      {anchor && (
        <Popover x={anchor.x} y={anchor.y} placement="above" width="w-56" label="More" onClose={close}>
          {view === "quality" ? (
            <>
              <button onClick={() => setView("root")} className={`${row} border-b border-line text-[11px] font-semibold tracking-wide text-label-2 uppercase`}>
                <ChevronLeftIcon /> Quality
              </button>
              <QualityPanel
                options={qualityOptions}
                value={quality}
                note={qualityNote}
                link={qualityLink}
                fullscreen={fullscreen}
                onFullscreen={onFullscreen && (() => {
                  close();
                  onFullscreen();
                })}
                onSelect={(id) => {
                  onQuality(id);
                  close();
                }}
              />
            </>
          ) : (
            <div className="py-1">
              {hasQuality && (
                <button role="menuitem" onClick={() => setView("quality")} className={row}>
                  <GearIcon className="text-lg" />
                  <span className="flex-1">Quality</span>
                  <span className="text-label-2">{qualityOptions.length > 0 ? currentQuality : "Auto"}</span>
                </button>
              )}
              {hasFit && (
                <button
                  role="menuitem"
                  onClick={() => {
                    onFit?.();
                    close();
                  }}
                  className={row}
                >
                  {fit === "fill" ? <FitIcon className="text-lg" /> : <FillIcon className="text-lg" />}
                  <span className="flex-1">{fit === "fill" ? "Fit to screen" : "Fill screen"}</span>
                </button>
              )}
              {onAirPlay && (
                <button
                  role="menuitem"
                  onClick={() => {
                    onAirPlay();
                    close();
                  }}
                  className={row}
                >
                  <AirPlayIcon className="text-lg" />
                  <span className="flex-1">AirPlay</span>
                </button>
              )}
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
