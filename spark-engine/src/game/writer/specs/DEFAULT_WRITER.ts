import { Writer } from "../types/Writer";

export const DEFAULT_WRITER: Writer = {
  className: "",
  letterDelay: 0.02,
  pauseScale: 3,
  fadeDuration: 0,
  clackSound: {
    wave: "brownnoise",
    amplitude: {
      attack: 0.01,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
      sustainLevel: 0.14,
    },
    frequency: { pitch: 9790 },
    arpeggio: { on: true, rate: 100, levels: [0.2, 1, 0.1, 0.05, 0.01, 1, 0] },
  },
};
