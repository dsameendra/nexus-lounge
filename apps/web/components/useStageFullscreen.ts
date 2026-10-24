"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";

interface OrientationLock {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
}

export function useStageFullscreen(box: RefObject<HTMLElement | null>) {
  const [native, setNative] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const active = native || immersive;

  useEffect(() => {
    const update = () => setNative(document.fullscreenElement === box.current && box.current !== null);
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, [box]);

  useEffect(() => {
    if (!immersive) return;
    document.documentElement.classList.add("immersive");
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setImmersive(false);
    window.addEventListener("keydown", onKey);
    const orientation = (screen as unknown as { orientation?: OrientationLock }).orientation;
    void orientation?.lock?.("landscape")?.catch?.(() => {});
    return () => {
      document.documentElement.classList.remove("immersive");
      window.removeEventListener("keydown", onKey);
      try {
        orientation?.unlock?.();
      } catch {}
    };
  }, [immersive]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (immersive) {
      setImmersive(false);
      return;
    }
    const element = box.current;
    if (element && document.fullscreenEnabled && element.requestFullscreen) {
      element.requestFullscreen().catch(() => setImmersive(true));
      return;
    }
    setImmersive(true);
  }, [box, immersive]);

  return { active, immersive, toggle };
}
