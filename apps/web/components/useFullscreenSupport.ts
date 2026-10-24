import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useFullscreenSupport() {
  return useSyncExternalStore(
    subscribe,
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );
}
