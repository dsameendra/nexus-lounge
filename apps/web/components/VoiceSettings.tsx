"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export interface PersonVoice {
  volume: number;
  muted: boolean;
}

const DEFAULT_VOICE: PersonVoice = { volume: 1, muted: false };
const STORAGE_KEY = "nexus-voice-settings";

interface VoiceSettingsValue {
  get: (userId: string) => PersonVoice;
  set: (userId: string, patch: Partial<PersonVoice>) => void;
}

const Context = createContext<VoiceSettingsValue | null>(null);

function load(): Record<string, PersonVoice> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, Partial<PersonVoice>>;
    return Object.fromEntries(
      Object.entries(raw).map(([id, value]) => [
        id,
        { volume: Math.min(1, Math.max(0, Number(value.volume ?? 1))), muted: Boolean(value.muted) },
      ]),
    );
  } catch {
    return {};
  }
}

export function VoiceSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Record<string, PersonVoice>>(load);

  const get = useCallback((userId: string) => settings[userId] ?? DEFAULT_VOICE, [settings]);

  const set = useCallback((userId: string, patch: Partial<PersonVoice>) => {
    setSettings((previous) => {
      const next = { ...previous, [userId]: { ...(previous[userId] ?? DEFAULT_VOICE), ...patch } };
      if (next[userId]!.volume === 1 && !next[userId]!.muted) delete next[userId];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const value = useMemo(() => ({ get, set }), [get, set]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVoiceSettings() {
  const value = useContext(Context);
  if (!value) throw new Error("useVoiceSettings must be used inside VoiceSettingsProvider");
  return value;
}
