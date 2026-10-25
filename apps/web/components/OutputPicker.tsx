"use client";

import { ScreenIcon, TvIcon, VolumeIcon, VolumeOffIcon } from "./Icons";
import { Segmented } from "./Segmented";
import { type Output, useTvOutput } from "./useTvOutput";

export function OutputPicker({ className = "" }: { className?: string }) {
  const { connected, tvs, mode, setMode, soundOn, setSound } = useTvOutput();
  if (!connected) return null;
  const tvName = tvs.length === 1 ? (tvs[0]?.name ?? "TV").replace(/^TV \((.*)\)$/, "$1's TV") : `${tvs.length} TVs`;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-semibold tracking-wide text-label-2 uppercase">Watch on · {tvName}</p>
      </div>
      <Segmented<Output>
        value={mode}
        onChange={setMode}
        options={[
          { value: "here", label: "This device", icon: <ScreenIcon /> },
          { value: "tv", label: "TV only", icon: <TvIcon /> },
          { value: "both", label: "Both" },
        ]}
      />
      {mode === "both" && (
        <button
          onClick={() => setSound(!soundOn)}
          aria-pressed={soundOn}
          className="flex h-9 items-center gap-2 rounded-full bg-white/10 px-3.5 text-sm font-medium transition hover:bg-white/15 active:scale-95"
        >
          {soundOn ? <VolumeIcon /> : <VolumeOffIcon />}
          {soundOn ? "Sound on this device" : "Sound is off here (TV plays it)"}
        </button>
      )}
    </div>
  );
}
