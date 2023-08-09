import { _writer } from "./_writer";

export const WRITER_DEFAULTS = {
  "": _writer(),
  action: {
    className: "Action",
    letterDelay: 0.02,
    pauseScale: 5,
    fadeDuration: 0,
    clackSound: {
      shape: "brownnoise",
      envelope: {
        attack: 0.01,
        decay: 0.003,
        sustain: 0.04,
        release: 0.01,
        level: 0.14,
      },
      pitch: { frequency: 9790 },
      arpeggio: {
        on: true,
        rate: 100,
        levels: [0.2, 1, 0.1, 0.05, 0.01, 1, 0],
      },
    },
    hidden: "beat",
  },
  dialogue: {
    className: "Dialogue",
    letterDelay: 0.02,
    pauseScale: 5,
    fadeDuration: 0,
    clackSound: {
      shape: "brownnoise",
      envelope: {
        attack: 0.01,
        decay: 0.003,
        sustain: 0.04,
        release: 0.01,
        level: 0.14,
      },
      pitch: { frequency: 9790 },
      arpeggio: {
        on: true,
        rate: 100,
        levels: [0.2, 1, 0.1, 0.05, 0.01, 1, 0],
      },
    },
    hidden: "beat",
  },
};
