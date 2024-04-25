import { _synth } from "../_synth";

export const SYNTH_DEFAULTS = {
  default: _synth({ $name: "default" }),
  character: _synth({
    $name: "character",
    shape: "triangle",
    envelope: {
      attack: 0.007,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
    },
    pitch: {
      frequency: 440,
    },
  }),
  writer: _synth({
    $name: "writer",
    shape: "whitenoise",
    envelope: {
      attack: 0.01,
      decay: 0.003,
      sustain: 0.04,
      release: 0.01,
      level: 0.3,
    },
    pitch: { frequency: 4790 },
    arpeggio: {
      on: true,
      rate: 100,
      levels: [0.05, 0.15, 0.1, 0.01, 0, 0.05, 0],
    },
    reverb: {
      on: true,
    },
  }),
};
