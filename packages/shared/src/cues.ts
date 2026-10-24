export interface CueNote {
  freq: number;
  at: number;
  duration: number;
}

export interface CueDefinition {
  wave: "sine" | "triangle";
  gain: number;
  notes: CueNote[];
}

const C4 = 261.63;
const F4 = 349.23;
const G4 = 392;
const A4 = 440;
const E4 = 329.63;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;

const down = (freqs: number[], step = 0.075, duration = 0.11): CueNote[] => freqs.map((freq, index) => ({ freq, at: index * step, duration }));

export const CUES = {
  mute: { wave: "sine", gain: 0.07, notes: down([C5, G4], 0.07, 0.12) },
  unmute: { wave: "sine", gain: 0.07, notes: down([G4, C5], 0.07, 0.12) },
  deafen: { wave: "sine", gain: 0.07, notes: down([A4, F4, C4]) },
  undeafen: { wave: "sine", gain: 0.07, notes: down([C4, F4, A4]) },
  join: { wave: "triangle", gain: 0.06, notes: down([C5, E5], 0.09, 0.16) },
  leave: { wave: "triangle", gain: 0.06, notes: down([E5, C5], 0.09, 0.16) },
  restricted: { wave: "triangle", gain: 0.08, notes: [{ freq: E4, at: 0, duration: 0.1 }, { freq: E4, at: 0.14, duration: 0.1 }] },
  released: { wave: "triangle", gain: 0.07, notes: down([G4, D5], 0.09, 0.14) },
} satisfies Record<string, CueDefinition>;

export type CueName = keyof typeof CUES;

export const MAX_CUE_GAIN = 0.1;
export const MAX_CUE_SECONDS = 0.5;

export function cueLength(cue: CueDefinition) {
  return Math.max(...cue.notes.map((note) => note.at + note.duration));
}
