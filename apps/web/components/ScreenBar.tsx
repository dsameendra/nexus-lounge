"use client";

import { useEffect, useState } from "react";
import type { TrackReference } from "@livekit/components-react";
import { VideoQuality, type RemoteTrackPublication } from "livekit-client";
import { AirPlayIcon, FullscreenIcon } from "./Icons";
import { QualityMenu } from "./QualityMenu";
import { openTvSheet, useAppleAirPlaySupport, useVideoAirPlay } from "./useAirPlay";
import { useFullscreenSupport } from "./useFullscreenSupport";

const OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "high", label: "High (source)" },
  { id: "low", label: "Low (saves data)" },
];

export function ScreenBar({ share, container, onFullscreen }: { share: TrackReference; container: HTMLElement | null; onFullscreen: () => void }) {
  const canFullscreen = useFullscreenSupport();
  const appleAirPlay = useAppleAirPlaySupport();
  const [quality, setQuality] = useState("auto");
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const airplay = useVideoAirPlay(video);

  useEffect(() => {
    if (!appleAirPlay) return;
    const find = () => setVideo(container?.querySelector("video") ?? null);
    find();
    const id = setInterval(find, 1500);
    return () => clearInterval(id);
  }, [container, appleAirPlay]);

  if (share.participant.isLocal) return null;
  const publication = share.publication as RemoteTrackPublication;

  function choose(id: string) {
    setQuality(id);
    if (id === "low") return publication.setVideoQuality(VideoQuality.LOW);
    if (id === "high") return publication.setVideoQuality(VideoQuality.HIGH);
    const element = container?.querySelector("video");
    const scale = window.devicePixelRatio || 1;
    if (element && element.clientWidth > 0) {
      publication.setVideoDimensions({ width: Math.ceil(element.clientWidth * scale), height: Math.ceil(element.clientHeight * scale) });
    } else {
      publication.setVideoQuality(VideoQuality.HIGH);
    }
  }

  return (
    <div className="px-3 pt-2 lg:px-0">
      <div className="flex items-center gap-2 rounded-2xl bg-panel px-3 py-1.5">
        <span className="flex-1 truncate text-sm text-label-2">{share.participant.name || share.participant.identity}&apos;s screen</span>
        <QualityMenu options={OPTIONS} value={quality} onSelect={choose} />
        {airplay.available ? (
          <button onClick={airplay.showPicker} aria-label="AirPlay" className="flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95">
            <AirPlayIcon />
          </button>
        ) : (
          appleAirPlay && (
            <button onClick={openTvSheet} aria-label="AirPlay and screen mirroring" className="flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95">
              <AirPlayIcon />
            </button>
          )
        )}
        {canFullscreen && (
          <button onClick={onFullscreen} aria-label="Fullscreen" className="flex size-10 items-center justify-center rounded-full text-xl transition hover:bg-white/10 active:scale-95">
            <FullscreenIcon />
          </button>
        )}
      </div>
    </div>
  );
}
