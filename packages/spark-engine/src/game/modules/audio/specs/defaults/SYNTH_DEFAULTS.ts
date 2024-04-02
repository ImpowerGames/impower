import { _synth } from "./_synth";

const BEEP_SYNTH = _synth({
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
});

const CLACK_SYNTH = _synth({
  shape: "whitenoise",
  envelope: {
    attack: 0.01,
    decay: 0.003,
    sustain: 0.04,
    release: 0.01,
    level: 0.14,
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
});

export const SYNTH_DEFAULTS = {
  default: _synth(),
  character: BEEP_SYNTH,
  writer: CLACK_SYNTH,
};
