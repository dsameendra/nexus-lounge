import { useSyncExternalStore } from "react";

export const PHONE_LANDSCAPE = "(orientation: landscape) and (max-height: 500px) and (max-width: 1023px)";
export const COMPACT_SCREEN = "(max-width: 1023px)";

export function hasElementFullscreen() {
  return typeof document !== "undefined" && Boolean(document.fullscreenEnabled);
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
