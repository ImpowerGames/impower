/*!
 * bfxr2 <https://github.com/increpare/bfxr2>
 *
 * Copyright (c) 2021 Stephen Lavelle
 * Released under the MIT license.
 */

import { RecursiveRandomization } from "../../core/types/RecursiveRandomization";
import { SoundConfig } from "../types/Sound";

export type SoundGeneratorType =
  | "coin"
  | "zap"
  | "boom"
  | "powerup"
  | "lose"
  | "hurt"
  | "jump"
  | "blip"
  | "push"
  | "random";

export const MAJOR_ARPEGGIOS = [
  [0, 3, 9, 14],
  [0, 3, 9],
  [0, 4, 8, 14],
  [0, 4, 8],
  [0, 6, 10, 14],
  [0, 6, 10],
  [1, 4, 10],
  [1, 6, 9],
  [1, 7, 11],
  [2, 6, 11],
  [2, 7, 10],
  [2, 8, 12],
  [3, 7, 12],
  [3, 8, 11],
  [4, 9, 12],
];

export const SOUND_RANDOMIZATION: Record<
  SoundGeneratorType,
  RecursiveRandomization<SoundConfig>
> = {
  coin: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    frequency: {
      pitch: [0.05, 0.09],
    },
    amplitude: {
      decay: [0.001, 0.005],
      sustain: [0.2, 0.3],
      release: [0.1, 0.25],
    },
    arpeggio: {
      on: [true],
      rate: [0.6],
      maxNotes: [0],
      direction: ["up"],
      tones: [
        [0, 8],
        [0, 9],
        [0, 10],
        [0, 11],
        [0, 12],
        [0, 14],
      ],
    },
  },
  zap: {
    wave: ["sawtooth", "tangent", "square"],
    frequency: {
      pitch: [0.01, 0.5],
      pitchRamp: [0.01, 0.3],
    },
    amplitude: {
      decay: [0.05, 0.05],
      sustain: [0.05, 0.1],
      release: [0.1, 0.2],
    },
    vibrato: {
      on: [true, false],
      strength: [0.5, 0.9],
      rate: [0.6, 0.8],
    },
    distortion: {
      on: [".vibrato.on", false],
      edge: [0.4, 1],
      grit: [0.5, 0.9],
    },
  },
  boom: {
    wave: ["pinknoise", "whitenoise"],
    frequency: {
      pitch: [0.02, 0.06],
      pitchRamp: [0.3, 0.5],
    },
    reverb: {
      on: [true, true, false],
      strength: [0.01, 0.7],
      delay: [0.3, 0.8],
    },
    vibrato: {
      on: [true, false],
      strength: [0.01, 0.7],
      rate: [0.01, 0.6],
    },
  },
  hurt: {
    wave: ["triangle", "sawtooth", "square", "tangent", "whitenoise"],
    frequency: {
      pitch: [0.02, 0.08],
      pitchRamp: [0.01, 0.3],
    },
  },
  powerup: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    frequency: {
      pitch: [0.04, 0.06],
      pitchRamp: [0.5, 0.7],
    },
    arpeggio: {
      on: [true, false],
      rate: [0.5, 0.7],
      maxNotes: [0.5],
      direction: ["up"],
      tones: MAJOR_ARPEGGIOS,
    },
    vibrato: {
      on: [".arpeggio.on", true],
      strength: [0.01, 0.7],
      rate: [0.01, 0.6],
    },
  },
  lose: {
    wave: ["sine", "triangle", "sawtooth", "square", "tangent"],
    frequency: {
      pitch: [0.03, 0.06],
      pitchRamp: [0.3, 0.5],
    },
    arpeggio: {
      on: [true, false],
      rate: [0.5, 0.7],
      maxNotes: [0.5],
      direction: ["down"],
      tones: MAJOR_ARPEGGIOS,
    },
    vibrato: {
      on: [".arpeggio.on", true],
      strength: [0.01, 0.7],
      rate: [0.01, 0.6],
    },
  },
  jump: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    frequency: {
      pitch: [0.03, 0.06],
      pitchRamp: [0.6, 0.8],
    },
  },
  blip: {
    wave: ["square", "sawtooth"],
    frequency: {
      pitch: [0.02, 0.06],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
  },
  push: {
    wave: [
      "triangle",
      "sawtooth",
      "tangent",
      "whitenoise",
      "pinknoise",
      "brownnoise",
    ],
    frequency: {
      pitch: [0.01, 0.05],
      pitchRamp: [0.05, 0.25],
    },
    arpeggio: {
      on: [true],
      rate: [0.6, 0.9],
      direction: ["down"],
    },
    reverb: {
      on: [true],
      strength: [0.01, 0.7],
      delay: [0.3, 0.8],
    },
    harmony: {
      on: [true],
      count: [1],
      falloff: [0.2, 0.5],
      falloffRamp: [0.2, 0.5],
    },
  },
  random: {
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "tangent",
      "square",
      "whistle",
      "brownnoise",
      "pinknoise",
      "whitenoise",
    ],
    frequency: {
      pitch: [0.02, 0.08],
      pitchRamp: [0.45, 0.55],
      accel: [0, 1],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
      sustainLevel: [0, 0.5],
    },
    arpeggio: {
      on: [true, false],
      rate: [0, 1],
      direction: ["up", "down", "up-down", "down-up", "random"],
      tones: MAJOR_ARPEGGIOS,
    },
    vibrato: {
      on: [".arpeggio.on", true],
      strength: [0, 1],
      rate: [0, 1],
    },
    harmony: {
      on: [true, false],
      count: [0.1, 1],
      falloff: [0, 1],
      falloffRamp: [0, 1],
    },
    reverb: {
      on: [true, false],
      strength: [0, 0.7],
      delay: [0, 1],
    },
  },
};
