"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

interface AirPlayVideo extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
}

const subscribe = () => () => {};

export function useAppleAirPlaySupport() {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && "WebKitPlaybackTargetAvailabilityEvent" in window,
    () => false,
  );
}

export function openTvSheet() {
  window.dispatchEvent(new CustomEvent("nexus:open-tv"));
}

export function useVideoAirPlay(video: HTMLVideoElement | null) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!video) return;
    const onChange = (event: Event) => setAvailable((event as Event & { availability?: string }).availability === "available");
    video.addEventListener("webkitplaybacktargetavailabilitychanged", onChange);
    return () => {
      video.removeEventListener("webkitplaybacktargetavailabilitychanged", onChange);
      setAvailable(false);
    };
  }, [video]);

  const showPicker = useCallback(() => (video as AirPlayVideo | null)?.webkitShowPlaybackTargetPicker?.(), [video]);
  return { available, showPicker };
}
