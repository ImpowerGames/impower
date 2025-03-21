import { Synth } from "../../..";
import { Create } from "../../../core/types/Create";
import { Schema } from "../../../core/types/Schema";
import { A } from "../constants/A";

export const schema_synth: Create<Schema<Synth>> = () => ({
  $type: "synth",
  $name: "$schema",
  volume: [0.01, 0, 1],
  shape: [
    "sine",
    "triangle",
    "sawtooth",
    "tangent",
    "square",
    "jitter",
    "whitenoise",
    "brownnoise",
    "pinknoise",
  ],
  envelope: {
    offset: [0.001, 0, 1],
    attack: [0.001, 0, 1],
    decay: [0.001, 0, 1],
    sustain: [0.001, 0, 1],
    release: [0.001, 0, 1],
    level: [0.01, 0, 1],
  },
  pitch: {
    frequency: [A[1], 0, A[9]],
    frequency_ramp: [0.01, -1, 1],
    frequency_torque: [0.01, -1, 1],
    frequency_jerk: [0.01, -1, 1],
    phase: [0.01, -1, 1],
  },
  lowpass: {
    cutoff: [A[1], 0, A[9]],
    cutoff_ramp: [0.01, -1, 1],
    resonance: [0.01, 0, 1],
  },
  highpass: {
    cutoff: [A[2], 0, A[9]],
    cutoff_ramp: [0.01, -1, 1],
  },
  distortion: {
    edge: [0.01, 0, 1],
    edge_ramp: [0.01, -1, 1],
    grit: [0.01, 0, 1],
    grit_ramp: [0.01, -1, 1],
  },
  arpeggio: {
    rate: [1, 0, 1000],
    rate_ramp: [0.01, -1, 1],
    max_octaves: [1, 0, 10],
    max_notes: [1, 0, 1000],
    direction: ["up", "down", "up-down", "down-up"],
    shapes: [
      "sine",
      "triangle",
      "sawtooth",
      "tangent",
      "square",
      "jitter",
      "brownnoise",
      "pinknoise",
      "whitenoise",
    ],
    tones: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    levels: [0.01, 0, 1],
  },
  vibrato: {
    shape: ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
    strength: [0.01, 0, 1],
    strength_ramp: [0.01, -1, 1],
    rate: [0.5, 0, A[0]],
    rate_ramp: [0.01, -1, 1],
  },
  tremolo: {
    shape: ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
    strength: [0.01, 0, 1],
    strength_ramp: [0.01, -1, 1],
    rate: [0.5, 0, A[8]],
    rate_ramp: [0.01, -1, 1],
  },
  wahwah: {
    shape: ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
    strength: [0.01, 0, 1],
    strength_ramp: [0.01, -1, 1],
    rate: [0.5, 0, A[0]],
    rate_ramp: [0.01, -1, 1],
  },
  reverb: {
    level: [0.01, 0, 1],
    delay: [0.01, 0, 1],
  },
});
