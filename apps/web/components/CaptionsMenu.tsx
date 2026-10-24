"use client";

import { useState } from "react";
import type { CaptionState } from "@/lib/players/types";
import { CaptionsIcon, CheckIcon } from "./Icons";
import { Popover } from "./Popover";

const SIZES = [
  { value: -1, label: "Small", className: "text-xs" },
  { value: 0, label: "Normal", className: "text-sm" },
  { value: 1, label: "Large", className: "text-base" },
  { value: 2, label: "Extra large", className: "text-lg" },
];

export function CaptionsMenu({
  captions,
  onTrack,
  onSize,
}: {
  captions: CaptionState;
  onTrack: (id: string | null) => void;
  onSize: (size: number) => void;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const on = captions.active !== null;

  return (
    <>
      <button
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAnchor(anchor ? null : { x: box.right - 224, y: box.top - 8 });
        }}
        aria-label="Subtitles"
        aria-expanded={Boolean(anchor)}
        aria-pressed={on}
        title={on ? "Subtitles on" : "Subtitles off"}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95 ${
          on ? "text-accent" : "text-label-2 hover:text-white"
        }`}
      >
        <CaptionsIcon />
      </button>
      {anchor && (
        <Popover x={anchor.x} y={anchor.y} placement="above" width="w-56" label="Subtitles" onClose={() => setAnchor(null)}>
          <p className="border-b border-line px-3 py-2 text-[11px] font-semibold tracking-wide text-label-2 uppercase">Subtitles</p>
          <ul className="scroll-thin max-h-56 overflow-y-auto py-1">
            {[{ id: null as string | null, label: "Off" }, ...captions.tracks].map((track) => (
              <li key={track.id ?? "off"}>
                <button
                  role="menuitemradio"
                  aria-checked={track.id === captions.active}
                  onClick={() => {
                    onTrack(track.id);
                    setAnchor(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/10"
                >
                  <span className="truncate">{track.label}</span>
                  {track.id === captions.active && <CheckIcon className="shrink-0 text-accent" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-3 py-2.5">
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-label-2 uppercase">Text size</p>
            <div className="flex gap-1" role="group" aria-label="Subtitle text size">
              {SIZES.map((size) => (
                <button
                  key={size.value}
                  onClick={() => onSize(size.value)}
                  aria-label={size.label}
                  aria-pressed={captions.size === size.value}
                  title={size.label}
                  className={`flex h-9 flex-1 items-center justify-center rounded-lg font-semibold transition ${size.className} ${
                    captions.size === size.value ? "bg-accent text-white" : "bg-white/10 text-label-2 hover:bg-white/15"
                  }`}
                >
                  A
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
