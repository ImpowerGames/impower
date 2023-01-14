import { Create } from "../../core/types/Create";
import { Character } from "../types/Character";
import { _intonation } from "./_intonation";
import { _prosody } from "./_prosody";

export const _character: Create<Character> = () => ({
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
  intonation: _intonation(),
  prosody: _prosody(),
});
