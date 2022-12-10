import { RecursiveValidation } from "../../core";
import { Sound } from "../types/Sound";

const AN1 = 13.75;
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
  frequency: {
    pitch: [A4, [0, A8], [true, false]],
    ramp: [0, [-1, 1], [false, false]],
    accel: [0, [-1, 1], [false, false]],
    jerk: [0, [-1, 1], [false, false]],
  },
  amplitude: {
    volume: [0.5, [0, 1], [true, false]],
    ramp: [0, [-1, 1], [false, false]],
    attack: [0.01, [0, 5], [true, false]],
    decay: [0.01, [0, 5], [true, false]],
    sustain: [0.01, [0, 5], [true, false]],
    release: [0.01, [0, 5], [true, false]],
    sustainLevel: [0.5, [0, 1], [true, false]],
  },
  lowpass: {
    cutoff: [-1, [0, A10], [true, false]],
    cutoffRamp: [0, [-1, 1], [false, false]],
    resonance: [0, [0, 1], [true, false]],
  },
  highpass: {
    cutoff: [-1, [0, A10], [true, false]],
    cutoffRamp: [0, [-1, 1], [false, false]],
  },
  vibrato: {
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [-1, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [AN1, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  tremolo: {
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [-1, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [AN1, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  wahwah: {
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [-1, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [AN1, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  ring: {
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "square", "tangent", "whitenoise"],
      [true],
    ],
    strength: [-1, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    rate: [A6, [A0, A8], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  arpeggio: {
    direction: ["down", ["down", "up", "both", "random"], [true]],
    intervals: [
      [1, 3, 5],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    ],
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
    ],
    rate: [-1, [0, A0], [true, false]],
    rateRamp: [0, [-1, 1], [false, false]],
  },
  harmony: {
    count: [-1, [0, 6], [true, false]],
    strength: [-1, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    delay: [0.15, [0, 0.5], [true, false]],
    delayRamp: [0, [-1, 1], [false, false]],
  },
  reverb: {
    strength: [-1, [0, 1], [true, false]],
    strengthRamp: [0, [-1, 1], [false, false]],
    delay: [0.15, [0, 0.5], [true, false]],
    delayRamp: [0, [-1, 1], [false, false]],
  },
};
