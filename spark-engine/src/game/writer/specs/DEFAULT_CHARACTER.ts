import { Character } from "../types/Character";
import { DEFAULT_INTONATION } from "./DEFAULT_INTONATION";
import { DEFAULT_PROSODY } from "./DEFAULT_PROSODY";

export const DEFAULT_CHARACTER: Character = {
  intonation: DEFAULT_INTONATION,
  prosody: DEFAULT_PROSODY,
  name: "",
  image: "",
  color: "",
  voiceSound: {
    wave: "sine",
    amplitude: {
      sustain: 0.049,
      release: 0.001,
    },
    frequency: {
      pitch: 440,
    },
    lowpass: {
      cutoff: 4840,
    },
    distortion: {
      on: true,
    },
    arpeggio: {
      on: true,
      rate: 54,
      tones: [0, 9, 3],
    },
  },
};
