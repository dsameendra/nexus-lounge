"use client";

import { useCallback, useSyncExternalStore } from "react";

export type VideoFit = "fit" | "fill";

const KEY = "nexus-video-fit";
const listeners = new Set<() => void>();

function read(): VideoFit {
  try {
    return localStorage.getItem(KEY) === "fill" ? "fill" : "fit";
  } catch {
    return "fit";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVideoFit() {
  const fit = useSyncExternalStore(subscribe, read, () => "fit" as VideoFit);
  const setFit = useCallback((next: VideoFit) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    listeners.forEach((listener) => listener());
  }, []);
  const toggle = useCallback(() => setFit(read() === "fill" ? "fit" : "fill"), [setFit]);
  return { fit, setFit, toggle };
}
