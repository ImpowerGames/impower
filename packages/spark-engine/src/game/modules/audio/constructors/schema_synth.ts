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
    tones: [1, 0, 16],
    levels: [0.01, 0, 1],
  },
  vibrato: {
    rate: [1, 0, A[1]],
    rate_ramp: [0.01, -1, 1],
    strength: [0.01, 0, 1],
    strength_ramp: [0.01, -1, 1],
    shape: ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
  },
  tremolo: {
    rate: [1, 0, A[1]],
    rate_ramp: [0.01, -1, 1],
    strength: [0.01, 0, 1],
    strength_ramp: [0.01, -1, 1],
    shape: ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
  },
  wahwah: {
    rate: [1, 0, A[1]],
    rate_ramp: [0.01, -1, 1],
    strength: [0.01, 0, 1],
    strength_ramp: [0.01, -1, 1],
    shape: ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
  },
  reverb: {
    mix: [0.01, 0, 1],
    room_size: [0.01, 0, 1],
    damping: [0.01, 0, 1],
  },
});
