/*!
 * Inspired by ChipTone <https://sfbgames.itch.io/chiptone>
 */

import { A, MAJOR_ARPEGGIOS_DOWN, MAJOR_ARPEGGIOS_UP, Synth } from "../../game";
import { RecursiveRandomization } from "../types/RecursiveRandomization";

export const SYNTH_RANDOMIZATIONS: Record<
  string,
  RecursiveRandomization<Synth>
> = {
  coin: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    amplitude: {
      decay: [0.02],
      sustain: [0.2, 0.3],
      release: [0.1, 0.25],
    },
    frequency: {
      pitch: [A[3], A[5]],
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
      pitch: [A[3], A[5]],
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
      pitch: [A[3], A[5]],
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
      pitch: [A[3], A[5]],
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
      pitch: [A[2], A[7]],
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
    wave: [
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "whitenoise",
      "brownnoise",
    ],
    amplitude: {
      decay: [0.05],
      sustain: [0.05, 0.1],
      release: [0.1, 0.2],
    },
    frequency: {
      pitch: [A[2], A[5]],
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
      pitch: [A[3], A[5]],
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
      pitch: [A[2], A[5]],
      pitchRamp: [-1, -0.5],
    },
  },
  blip: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square", "whistle"],
    amplitude: {
      sustain: [0.049],
      release: [0.001],
    },
    frequency: {
      pitch: [A[4], A[5]],
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
  beep: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square"],
    amplitude: {
      decay: [0.01, 0.05],
      sustain: [0.001, 0.1],
      release: [0.001, 0.1],
    },
    frequency: {
      pitch: [A[3], A[5]],
    },
    distortion: {
      on: [false, true],
      grit: [0.01, 0.02],
    },
  },
  snap: {
    wave: ["sine", "triangle", "sawtooth", "tangent", "square", "whistle"],
    amplitude: {
      delay: [0.005],
      attack: [0.005],
      decay: [0.001],
      sustain: [0],
    },
    frequency: {
      pitch: [A[5], A[7]],
    },
    lowpass: {
      cutoff: [".frequency.pitch", true],
    },
    arpeggio: {
      on: [true],
      rate: [200],
      levels: [[0, 0.1, 1]],
    },
    distortion: {
      on: [false, true],
      edge: [0.01, 1],
    },
  },
  tap: {
    wave: ["sine", "triangle"],
    amplitude: {
      decay: [0.003],
      sustain: [0],
      release: [0.05],
    },
    frequency: {
      pitch: [A[5], A[6]],
    },
    distortion: {
      on: [false, true],
      edge: [0.01, 1],
    },
  },
  clack: {
    wave: ["whitenoise", "brownnoise"],
    amplitude: {
      attack: [0.01],
      decay: [0.003],
      sustain: [0.04],
      release: [0.01],
      sustainLevel: [0.15],
    },
    frequency: {
      pitch: [A[7], A[9]],
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
      pitch: [A[2], A[6]],
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
      rate: [0, A[0]],
    },
    tremolo: {
      on: [true, false],
      rate: [0, A[0]],
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
