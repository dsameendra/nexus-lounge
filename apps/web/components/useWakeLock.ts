"use client";

import { useEffect } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

export function useWakeLock() {
  useEffect(() => {
    const api = (navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!api) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await api.request("screen");
        if (stopped) {
          void next.release().catch(() => {});
          return;
        }
        sentinel = next;
      } catch {}
    };

    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onVisible);
    window.addEventListener("pageshow", onVisible);
    void acquire();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onVisible);
      window.removeEventListener("pageshow", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, []);
}
