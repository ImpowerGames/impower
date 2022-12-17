import { RecursiveValidation } from "../../core";
import { Sound } from "../types/Sound";

const A0 = 27.5;
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
    volume: [0.5, [0, 1], [true, false]],
    ramp: [0, [-1, 1], [false, false]],
    attack: [0.01, [0, 5], [true, false]],
    decay: [0.01, [0, 5], [true, false]],
    sustain: [0.01, [0, 5], [true, false]],
    release: [0.01, [0, 5], [true, false]],
    sustainLevel: [0.5, [0, 1], [true, false]],
  },
  frequency: {
    pitch: [A4, [0, A8], [true, false]],
    ramp: [0, [-1, 1], [false, false]],
    accel: [0, [-1, 1], [false, false]],
    jerk: [0, [-1, 1], [false, false]],
  },
  lowpass: {
    cutoff: [0, [0, A10], [true, false]],
    cutoffRamp: [0, [-1, 1], [false, false]],
    resonance: [0, [0, 1], [true, false]],
  },
  highpass: {
    cutoff: [0, [0, A10], [true, false]],
    cutoffRamp: [0, [-1, 1], [false, false]],
  },
  vibrato: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [6, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  tremolo: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [12, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  wahwah: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [6, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  ring: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [A6, [A0, A8], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
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
    rate: [6, [0, 20], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
    maxOctaves: [1, [1, 8], [true, false]],
    maxNotes: [160, [1, 900], [true, false]],
    direction: ["down", ["down", "up", "both", "random"], [true]],
    semitones: [
      [0, 4, 8],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      0,
    ],
  },
  harmony: {
    on: [false],
    count: [4, [0, 6], [true, false]],
    strength: [0.5, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    delay: [0.15, [0, 0.5], [true, false]],
    delayRamp: [0, [-1, 1], [false, false]],
  },
  reverb: {
    on: [false],
    strength: [0.5, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    delay: [0.15, [0, 0.5], [true, false]],
    delayRamp: [0, [-1, 1], [false, false]],
  },
};
