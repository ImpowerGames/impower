/*!
 * bfxr2 <https://github.com/increpare/bfxr2>
 *
 * Copyright (c) 2021 Stephen Lavelle
 * Released under the MIT license.
 */

import { RecursiveRandomization } from "../../core/types/RecursiveRandomization";
import { SoundConfig } from "../types/Sound";

const A0 = 27.5;
const A2 = 110;
const A3 = 220;
const A4 = 440;
const A5 = 880;
const A6 = 1760;
const A7 = 3520;
const A10 = 28160;
const A11 = 56320;

export const MAJOR_ARPEGGIOS_UP = [
  [0, 3, 9],
  [0, 4, 8],
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

export const MAJOR_ARPEGGIOS_DOWN = MAJOR_ARPEGGIOS_UP.map((arr) =>
  [...arr].reverse()
);

export const SOUND_RANDOMIZATION: Record<
  string,
  RecursiveRandomization<SoundConfig>
> = {
  coin: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    amplitude: {
      decay: [0.005],
      sustain: [0.2, 0.3],
      release: [0.1, 0.25],
    },
    frequency: {
      pitch: [A3, A5],
    },
    arpeggio: {
      on: [true],
      rate: [15, 20],
      maxNotes: [2],
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
  jump: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    amplitude: {
      decay: [0.05],
      sustain: [0.05, 0.1],
      release: [0.1, 0.2],
    },
    frequency: {
      pitch: [A3, A5],
      pitchRamp: [0.2, 1],
    },
    distortion: {
      on: [true, false],
      edge: [0.4, 1],
      grit: [0.5, 0.9],
    },
  },
  powerup: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    amplitude: {
      decay: [0.05],
      sustain: [0.4, 0.6],
      release: [0.6, 0.7],
    },
    frequency: {
      pitch: [A3, A5],
      pitchRamp: [1],
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
  },
  lose: {
    wave: ["sine", "triangle", "sawtooth", "square", "tangent"],
    amplitude: {
      decay: [0.05],
      sustain: [0.4, 0.6],
      release: [0.6, 0.7],
    },
    frequency: {
      pitch: [A3, A5],
      pitchRamp: [-1],
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
  },
  zap: {
    wave: ["whistle", "sawtooth", "tangent", "square"],
    amplitude: {
      decay: [0.05],
      sustain: [0.1, 0.2],
      release: [0.1, 0.2],
    },
    frequency: {
      pitch: [A2, A7],
      pitchRamp: [-1, -0.2],
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
  },
  hurt: {
    wave: ["triangle", "sawtooth", "square", "tangent", "whitenoise"],
    amplitude: {
      decay: [0.05],
      sustain: [0.05, 0.1],
      release: [0.1, 0.2],
    },
    frequency: {
      pitch: [A2, A5],
      pitchRamp: [-1, -0.2],
    },
  },
  boom: {
    wave: ["whitenoise", "brownnoise"],
    amplitude: {
      decay: [0.05],
      sustain: [0.05, 0.1],
      release: [0.4, 0.7],
    },
    frequency: {
      pitch: [A3, A5],
      pitchRamp: [-0.5, 0],
    },
    reverb: {
      on: [true, true, false],
      strength: [0.01, 0.7],
      delay: [0.3, 0.8],
    },
    vibrato: {
      on: [true, false],
      strength: [0.01, 0.05],
      rate: [2, 12],
    },
  },
  push: {
    wave: ["whitenoise", "brownnoise", "pinknoise"],
    amplitude: {
      decay: [0.05],
      sustain: [0.05, 0.1],
      release: [0.1, 0.2],
    },
    frequency: {
      pitch: [A2, A5],
      pitchRamp: [-1, -0.5],
    },
  },
  beep: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    frequency: {
      pitch: [A3, A5],
    },
    arpeggio: {
      on: [true, false],
      rate: [36],
      tones: [
        [3, 0],
        [4, 0],
        [5, 0],
        [6, 0],
        [7, 0],
        [8, 0],
        [9, 0],
        [10, 0],
        [11, 0],
        [12, 0],
        [14, 0],
      ],
    },
    distortion: {
      on: [".arpeggio.on", false],
      grit: [0.01, 0.02],
    },
  },
  blip: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square", "whistle"],
    amplitude: {
      sustain: [0.049],
      release: [0.001],
    },
    frequency: {
      pitch: [A4, A5],
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
  },
  clack: {
    wave: ["brownnoise"],
    amplitude: {
      sustain: [0.08],
    },
    frequency: {
      pitch: [A10, A11],
    },
    lowpass: {
      cutoff: [4840],
    },
    distortion: {
      on: [true],
      edge: [0],
      grit: [0, 1],
    },
    arpeggio: {
      on: [true],
      rate: [100],
      levels: [[0.1, 1.5, 0.3, 0.1, 0.1, 0.1, 1, 0.1, 0.1]],
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
    ],
    amplitude: {
      decay: [0.05],
      sustain: [0.2, 0.5],
      release: [0.2, 0.5],
    },
    frequency: {
      pitch: [A2, A6],
      pitchRamp: [-0.5, 0.5],
    },
    distortion: {
      on: [true, false],
      edge: [0, 1],
      grit: [0, 1],
    },
    arpeggio: {
      on: [true, false],
      rate: [0, 100],
      direction: ["up", "down", "random"],
      tones: MAJOR_ARPEGGIOS_UP,
    },
    vibrato: {
      on: [".arpeggio.on", true],
      strength: [0, 1],
      rate: [0, A0],
    },
    tremolo: {
      on: [true, false],
      rate: [0, A0],
    },
    harmony: {
      on: [true, false],
      count: [1, 2],
    },
    reverb: {
      on: [true, false],
      strength: [0, 1],
      delay: [0, 1],
    },
  },
};
