import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function useScreenShareSupport() {
  return useSyncExternalStore(
    subscribe,
    () => typeof navigator.mediaDevices?.getDisplayMedia === "function",
    () => false,
  );
}
