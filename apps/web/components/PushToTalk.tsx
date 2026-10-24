"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { isAllowedPttKey, isTypingTarget, keyLabel } from "@nexus/shared";
import { useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { useRoom } from "./RoomProvider";
import { Sheet } from "./Sheet";
import { Switch } from "./Switch";

interface PttSettings {
  enabled: boolean;
  code: string;
}

interface PttValue extends PttSettings {
  talking: boolean;
  setEnabled: (enabled: boolean) => void;
  setCode: (code: string) => void;
  talk: (on: boolean, releaseDelay?: number) => void;
}

const STORAGE_KEY = "nexus-push-to-talk";
const DEFAULTS: PttSettings = { enabled: false, code: "KeyV" };
const Context = createContext<PttValue | null>(null);

function load(): PttSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<PttSettings>;
    return { enabled: Boolean(raw.enabled), code: typeof raw.code === "string" && isAllowedPttKey(raw.code) ? raw.code : DEFAULTS.code };
  } catch {
    return DEFAULTS;
  }
}

export function PushToTalkProvider({ deafened, children }: { deafened: boolean; children: React.ReactNode }) {
  const { localParticipant } = useLocalParticipant();
  const connection = useConnectionState();
  const { state, self } = useRoom();
  const restriction = state.restrictions[self.id];
  const blocked = deafened || Boolean(restriction?.muted || restriction?.deafened);
  const [settings, setSettings] = useState<PttSettings>(load);
  const [talking, setTalking] = useState(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback((patch: Partial<PttSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const talk = useCallback(
    (on: boolean, releaseDelay = 0) => {
      clearTimeout(releaseTimer.current);
      if (on) {
        if (blocked) return;
        setTalking(true);
        void localParticipant.setMicrophoneEnabled(true);
        return;
      }
      releaseTimer.current = setTimeout(() => {
        setTalking(false);
        void localParticipant.setMicrophoneEnabled(false);
      }, releaseDelay);
    },
    [blocked, localParticipant],
  );

  useEffect(() => {
    if (!settings.enabled || connection !== ConnectionState.Connected) return;
    setTalking(false);
    void localParticipant.setMicrophoneEnabled(false);
  }, [settings.enabled, connection, localParticipant]);

  useEffect(() => {
    if (!settings.enabled) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== settings.code || event.repeat || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (isTypingTarget(target?.tagName, Boolean(target?.isContentEditable))) return;
      event.preventDefault();
      talk(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === settings.code) talk(false, 180);
    };
    const release = () => talk(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      clearTimeout(releaseTimer.current);
    };
  }, [settings, talk]);

  const value = useMemo<PttValue>(
    () => ({ ...settings, talking, setEnabled: (enabled) => update({ enabled }), setCode: (code) => update({ code }), talk }),
    [settings, talking, update, talk],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePushToTalk() {
  const value = useContext(Context);
  if (!value) throw new Error("usePushToTalk must be used inside PushToTalkProvider");
  return value;
}

export function VoiceSettingsSheet({ onClose }: { onClose: () => void }) {
  const ptt = usePushToTalk();
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== "Escape" && isAllowedPttKey(event.code)) ptt.setCode(event.code);
      setCapturing(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, ptt]);

  return (
    <Sheet title="Voice settings" onClose={onClose}>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel-2">
        <Switch
          checked={ptt.enabled}
          onChange={ptt.setEnabled}
          label="Push to talk"
          description="Your microphone stays off until you hold the key below, or hold the microphone button."
        />
        {ptt.enabled && (
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-[15px]">Shortcut</span>
            <button
              onClick={() => setCapturing((value) => !value)}
              className={`min-w-24 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                capturing ? "bg-accent text-white" : "bg-panel-3 hover:brightness-125"
              }`}
            >
              {capturing ? "Press a key…" : keyLabel(ptt.code)}
            </button>
          </div>
        )}
      </div>
      <p className="mt-3 px-1 text-xs leading-relaxed text-label-2">
        The shortcut works while this tab is focused and is ignored while you type in the chat. Press Esc to cancel changing it.
      </p>
    </Sheet>
  );
}
