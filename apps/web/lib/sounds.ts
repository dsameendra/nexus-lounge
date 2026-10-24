import { CUES, type CueName } from "@nexus/shared";

const STORAGE_KEY = "nexus-sound-cues";
let context: AudioContext | null = null;

type AudioContextConstructor = typeof AudioContext;

export function cuesEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setCuesEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {}
}

export function unlockAudio() {
  try {
    const Constructor: AudioContextConstructor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!Constructor) return;
    context ??= new Constructor();
    if (context.state === "suspended") void context.resume();
  } catch {}
}

export function playCue(name: CueName) {
  if (!cuesEnabled()) return;
  unlockAudio();
  const audio = context;
  if (!audio) return;

  const cue = CUES[name];
  const start = audio.currentTime + 0.01;
  for (const note of cue.notes) {
    const at = start + note.at;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = cue.wave;
    oscillator.frequency.value = note.freq;
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(cue.gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + note.duration);
    oscillator.connect(envelope).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + note.duration + 0.03);
  }
}
