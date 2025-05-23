/*
 * Inspired by ChipTone <https://sfbgames.itch.io/chiptone>
 */

import { Synth } from "../../..";
import { Create } from "../../../core/types/Create";
import { Random } from "../../../core/types/Random";
import { A } from "../constants/A";
import {
  MAJOR_ARPEGGIOS_DOWN,
  MAJOR_ARPEGGIOS_UP,
} from "../constants/ARPEGGIOS";

export const random_synth: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random",
  shape: [
    "sine",
    "triangle",
    "sawtooth",
    "tangent",
    "square",
    "jitter",
    "brownnoise",
  ],
  envelope: {
    decay: [0.05],
    sustain: [0.2, 0.5],
    release: [0.2, 0.5],
  },
  pitch: {
    frequency: [A[2], A[6]],
    frequency_ramp: [-0.5, 0.5],
  },
  distortion: {
    on: [true, false],
    edge: [0, 1],
    grit: [0, 1],
  },
  arpeggio: {
    on: [true, false],
    rate: [0, 100],
    direction: ["up", "down"],
    tones: MAJOR_ARPEGGIOS_UP,
  },
  vibrato: {
    on: [".arpeggio.on", true],
    strength: [0, 1],
    rate: [0, A[0]],
  },
  tremolo: {
    on: [true, false],
    rate: [0, A[0]],
  },
  reverb: {
    on: [true, false],
    level: [0, 1],
    delay: [0, 1],
  },
});

export const random_synth_coin: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:coin",
  shape: ["sine", "triangle", "sawtooth", "tangent", "square"],
  envelope: {
    decay: [0.02],
    sustain: [0.2, 0.3],
    release: [0.1, 0.25],
  },
  pitch: {
    frequency: [A[3], A[5]],
  },
  arpeggio: {
    on: [true],
    rate: [15, 20],
    max_notes: [2],
    tones: [
      [0, 8],
      [0, 9],
      [0, 10],
      [0, 11],
      [0, 12],
      [0, 14],
    ],
  },
});

export const random_synth_jump: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:jump",
  shape: ["sine", "triangle", "sawtooth", "tangent", "square"],
  envelope: {
    decay: [0.05],
    sustain: [0.05, 0.1],
    release: [0.1, 0.2],
  },
  pitch: {
    frequency: [A[3], A[5]],
    frequency_ramp: [0.2, 1],
  },
  distortion: {
    on: [true, false],
    edge: [0.4, 1],
    grit: [0.5, 0.9],
  },
});

export const random_synth_powerup: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:powerup",
  shape: ["sine", "triangle", "sawtooth", "tangent", "square"],
  envelope: {
    decay: [0.05],
    sustain: [0.4, 0.6],
    release: [0.6, 0.7],
  },
  pitch: {
    frequency: [A[3], A[5]],
    frequency_ramp: [1],
  },
  arpeggio: {
    on: [true, false],
    rate: [10, 16],
    tones: MAJOR_ARPEGGIOS_UP,
  },
  vibrato: {
    on: [".arpeggio.on", true],
    strength: [0.01, 0.7],
    rate: [12, 16],
  },
  distortion: {
    on: [".vibrato.on", false],
    edge: [0.4, 1],
    grit: [0.01, 1],
  },
});

export const random_synth_lose: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:lose",
  shape: ["sine", "triangle", "sawtooth", "square", "tangent"],
  envelope: {
    decay: [0.05],
    sustain: [0.4, 0.6],
    release: [0.6, 0.7],
  },
  pitch: {
    frequency: [A[3], A[5]],
    frequency_ramp: [-1],
  },
  arpeggio: {
    on: [true, false],
    rate: [10, 16],
    tones: MAJOR_ARPEGGIOS_DOWN,
  },
  vibrato: {
    on: [".arpeggio.on", true],
    strength: [0.01, 0.03],
    rate: [12, 16],
  },
  distortion: {
    on: [".vibrato.on", false],
    edge: [0.4, 1],
    grit: [0.01, 1],
  },
});

export const random_synth_zap: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:zap",
  shape: ["jitter", "sawtooth", "tangent", "square"],
  envelope: {
    decay: [0.05],
    sustain: [0.1, 0.2],
    release: [0.1, 0.2],
  },
  pitch: {
    frequency: [A[2], A[7]],
    frequency_ramp: [-1, -0.2],
  },
  distortion: {
    on: [".vibrato.on", false],
    edge: [0.4, 1],
    grit: [0.5, 0.9],
  },
  vibrato: {
    on: [true, false],
    strength: [0.5, 0.9],
    rate: [16, 22],
  },
});

export const random_synth_hurt: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:hurt",
  shape: [
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "whitenoise",
    "brownnoise",
  ],
  envelope: {
    decay: [0.05],
    sustain: [0.05, 0.1],
    release: [0.1, 0.2],
  },
  pitch: {
    frequency: [A[2], A[5]],
    frequency_ramp: [-1, -0.2],
  },
});

export const random_synth_boom: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:boom",
  shape: ["whitenoise", "brownnoise"],
  envelope: {
    decay: [0.05],
    sustain: [0.05, 0.1],
    release: [0.4, 0.7],
  },
  pitch: {
    frequency: [A[3], A[5]],
    frequency_ramp: [-0.5, 0],
  },
  reverb: {
    on: [true, true, false],
    level: [0.01, 0.7],
    delay: [0.3, 0.8],
  },
  vibrato: {
    on: [true, false],
    strength: [0.01, 0.05],
    rate: [2, 12],
  },
});

export const random_synth_push: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:push",
  shape: ["pinknoise"],
  envelope: {
    decay: [0.05],
    sustain: [0.01, 0.05],
    release: [0.05, 0.1],
  },
  pitch: {
    frequency: [A[2], A[5]],
    frequency_ramp: [-1, -0.5],
  },
});

export const random_synth_blip: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:blip",
  shape: ["sine", "triangle", "sawtooth", "tangent", "square", "jitter"],
  envelope: {
    sustain: [0.049],
    release: [0.001],
  },
  pitch: {
    frequency: [A[4], A[5]],
  },
  lowpass: {
    cutoff: [4840],
  },
  distortion: {
    on: [true],
  },
  arpeggio: {
    on: [true],
    rate: [54],
    tones: [
      [0, 3, 0],
      [0, 9, 3],
      [0, 8, 4],
      [0, 10, 6],
      [0, 14, 10],
      [0, 20, 16],
      [0, 24, 20],
    ],
  },
});

export const random_synth_beep: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:beep",
  shape: ["sine", "triangle", "sawtooth", "tangent", "square"],
  envelope: {
    decay: [0.01, 0.05],
    sustain: [0.001, 0.1],
    release: [0.001, 0.1],
  },
  pitch: {
    frequency: [A[3], A[5]],
  },
  distortion: {
    on: [false, true],
    grit: [0.01, 0.02],
  },
});

export const random_synth_tap: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:tap",
  shape: ["sine", "triangle"],
  envelope: {
    decay: [0.003],
    sustain: [0],
    release: [0.05],
  },
  pitch: {
    frequency: [A[5], A[6]],
  },
  distortion: {
    on: [false, true],
    edge: [0.01, 1],
  },
});

export const random_synth_snap: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:snap",
  shape: ["sine", "triangle", "square"],
  envelope: {
    offset: [0.005],
    attack: [0.005],
    decay: [0.001],
    sustain: [0],
    release: [0],
  },
  pitch: {
    frequency: [A[6], A[7]],
  },
  arpeggio: {
    on: [true],
    rate: [200],
    levels: [[0, 0.1, 1]],
  },
});

export const random_synth_clack: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:clack",
  shape: ["whitenoise", "brownnoise"],
  envelope: {
    attack: [0.01],
    decay: [0.003],
    sustain: [0.04],
    release: [0.01],
    level: [0.15],
  },
  pitch: {
    frequency: [A[7], A[9]],
  },
  lowpass: {
    cutoff: [8085],
    resonance: [0, 1],
  },
  arpeggio: {
    on: [true],
    rate: [100],
    levels: [[0.2, 1, 0.1, 0.05, 0.01, 1, 0]],
  },
  reverb: {
    on: [true],
  },
});
