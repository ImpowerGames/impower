import { RecursiveValidation } from "../../core";
import { Sound } from "../types/Sound";

const A0 = 27.5;
const A1 = 55;
const A2 = 110;
const A4 = 440;
const A6 = 1760;
const A8 = 7040;
const A10 = 28160;

export const SOUND_VALIDATION: RecursiveValidation<Sound> = {
  seed: [""],
  wave: [
    "triangle",
    [
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
    [true],
  ],
  amplitude: {
    volume: [0.5, [0, 1, 0.01], [true]],
    ramp: [0, [-1, 1, 0.01], []],
    attack: [0.01, [0, 5, 0.05], [true]],
    decay: [0.01, [0, 5, 0.05], [true]],
    sustain: [0.01, [0, 5, 0.05], [true]],
    release: [0.01, [0, 5, 0.05], [true]],
    sustainLevel: [0.5, [0, 1, 0.01], [true]],
  },
  frequency: {
    pitch: [A4, [0, A8, A1], [true]],
    ramp: [0, [-1, 1, 0.01], []],
    accel: [0, [-1, 1, 0.01], []],
    jerk: [0, [-1, 1, 0.01], []],
  },
  lowpass: {
    on: [false],
    cutoff: [0, [0, A10, A2], [true]],
    cutoffRamp: [0, [-1, 1, 0.01], []],
    resonance: [0, [0, 1, 0.01], [true]],
  },
  highpass: {
    on: [false],
    cutoff: [0, [0, A10, A2], [true]],
    cutoffRamp: [0, [-1, 1, 0.01], []],
  },
  vibrato: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1, 0.01], [true]],
    strengthRamp: [0, [-1, 1, 0.01], []],
    rate: [6, [0, A0, 0.5], [true]],
    rateRamp: [0, [-1, 1, 0.01], []],
  },
  tremolo: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1, 0.01], [true]],
    strengthRamp: [0, [-1, 1, 0.01], []],
    rate: [12, [0, A0, 0.5], [true]],
    rateRamp: [0, [-1, 1, 0.01], []],
  },
  wahwah: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1, 0.01], [true]],
    strengthRamp: [0, [-1, 1, 0.01], []],
    rate: [6, [0, A0, 0.5], [true]],
    rateRamp: [0, [-1, 1, 0.01], []],
  },
  ring: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1, 0.01], [true]],
    strengthRamp: [0, [-1, 1, 0.01], []],
    rate: [A6, [A0, A8, A1], [true]],
    rateRamp: [0, [-1, 1, 0.01], []],
  },
  arpeggio: {
    on: [false],
    shapes: [
      [],
      [
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
      "sine",
    ],
    rate: [6, [2, 20, 1], [true]],
    rateRamp: [0, [-1, 1, 0.01], []],
    maxOctaves: [1, [1, 8, 1], [true]],
    maxNotes: [160, [1, 900, 1], [true]],
    direction: ["down", ["down", "up", "down-up", "up-down", "random"], [true]],
    semitones: [
      [0, 4, 8],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      0,
    ],
  },
  harmony: {
    on: [false],
    count: [2, [0, 6, 1], [true]],
    strength: [0.5, [0, 1, 0.01], [true]],
    strengthRamp: [0, [-1, 1, 0.01], []],
    delay: [0.15, [0, 1, 0.01], [true]],
    delayRamp: [0, [-1, 1, 0.01], []],
  },
  reverb: {
    on: [false],
    strength: [0.5, [0, 1, 0.01], [true]],
    strengthRamp: [0, [-1, 1, 0.01], []],
    delay: [0.15, [0, 1, 0.01], [true]],
    delayRamp: [0, [-1, 1, 0.01], []],
  },
};
