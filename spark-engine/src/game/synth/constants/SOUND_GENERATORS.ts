/*!
 * bfxr2 <https://github.com/increpare/bfxr2>
 *
 * Copyright (c) 2021 Stephen Lavelle
 * Released under the MIT license.
 */

import { RecursiveRandomization } from "../../core/types/RecursiveRandomization";
import { SoundConfig } from "../types/Sound";

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

export const MINOR_ARPEGGIOS = [
  [0, 3, 8, 14],
  [0, 3, 8],
  [0, 4, 10, 14],
  [0, 4, 10],
  [0, 6, 9, 14],
  [0, 6, 9],
  [1, 4, 9],
  [1, 6, 11],
  [1, 7, 10],
  [2, 7, 12],
  [2, 8, 11],
  [3, 7, 11],
  [3, 9, 12],
  [4, 8, 12],
];

export const SOUND_RANDOMIZATIONS: Record<
  SoundGeneratorType,
  RecursiveRandomization<SoundConfig>
> = {
  coin: {
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ],
    frequency: {
      pitch: [0.4, 0.9],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
    arpeggio: {
      on: [true],
      rate: [0.6, 0.7],
      maxNotes: [0],
      direction: ["up"],
      semitones: [
        [0, 4],
        [0, 6],
        [0, 7],
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
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ],
    frequency: {
      pitch: [0.5, 0.7],
      ramp: [0.2, 0.4],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
    harmony: {
      on: [true, false],
      delay: [0],
      strength: [0.2, 0.5],
    },
  },
  boom: {
    wave: ["pinknoise", "whitenoise"],
    frequency: {
      pitch: [0.2, 0.6],
      ramp: [0.3, 0.5],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
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
    wave: [
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whitenoise",
    ],
    frequency: {
      pitch: [0.2, 0.8],
      ramp: [0.01, 0.3],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
  },
  powerup: {
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ],
    frequency: {
      pitch: [0.4, 0.6],
      ramp: [0.5, 0.7],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
    arpeggio: {
      on: [true, false],
      rate: [0.5, 0.7],
      maxNotes: [0.5],
      direction: ["up"],
      semitones: MAJOR_ARPEGGIOS,
    },
    vibrato: {
      on: [".arpeggio.on", false],
      strength: [0.01, 0.7],
      rate: [0.01, 0.6],
    },
  },
  lose: {
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ],
    frequency: {
      pitch: [0.3, 0.6],
      ramp: [0.3, 0.5],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
    arpeggio: {
      on: [true, false],
      rate: [0.5, 0.7],
      maxNotes: [0.5],
      direction: ["down"],
      semitones: MAJOR_ARPEGGIOS,
    },
    vibrato: {
      on: [".arpeggio.on", false],
      strength: [0.01, 0.7],
      rate: [0.01, 0.6],
    },
  },
  jump: {
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ],
    frequency: {
      pitch: [0.3, 0.6],
      ramp: [0.6, 0.8],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
  },
  blip: {
    wave: ["square", "sawtooth"],
    frequency: {
      pitch: [0.2, 0.6],
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
      "breaker",
      "whistle",
      "whitenoise",
      "pinknoise",
      "brownnoise",
    ],
    frequency: {
      pitch: [0.1, 0.5],
      ramp: [0.05, 0.25],
    },
    amplitude: {
      attack: [0.01, 0.01],
      sustain: [0.01, 0.02],
      release: [0.01, 0.01],
    },
    reverb: {
      on: [true],
      strength: [0.01, 0.7],
      delay: [0.3, 0.8],
    },
    harmony: {
      on: [true],
      delay: [0],
      strength: [0.2, 0.5],
      strengthRamp: [0.2, 0.5],
    },
    arpeggio: {
      on: [true],
      rate: [0.6, 0.9],
      direction: ["down"],
    },
  },
  random: {
    wave: [
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
      "brownnoise",
      "pinknoise",
      "whitenoise",
    ],
    frequency: {
      pitch: [0.2, 0.8],
      ramp: [0.45, 0.55],
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
      semitones: MAJOR_ARPEGGIOS,
    },
    vibrato: {
      on: [".arpeggio.on", false],
      strength: [0, 1],
      rate: [0, 1],
    },
    harmony: {
      on: [true, false],
      count: [0, 0.5],
      delay: [0, 0.5],
      strength: [0, 1],
      strengthRamp: [0, 1],
    },
    reverb: {
      on: [true, false],
      strength: [0, 0.7],
      delay: [0, 1],
    },
  },
};

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

export const SOUND_GENERATOR_TYPES: SoundGeneratorType[] = [
  "coin",
  "zap",
  "boom",
  "powerup",
  "hurt",
  "lose",
  "jump",
  "blip",
  "push",
  "random",
];
