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
      "tangent",
      "square",
      "whistle",
      "brownnoise",
      "pinknoise",
      "whitenoise",
    ],
    [true],
  ],
  amplitude: {
    volume: [0.5, [0, 1], [0.01]],
    volumeRamp: [0, [-1, 1], [0.01]],
    attack: [0, [0, 1], [0.001]],
    decay: [0.01, [0, 1], [0.001]],
    sustain: [0.01, [0, 1], [0.001]],
    release: [0.01, [0, 1], [0.001]],
    sustainLevel: [0.5, [0, 1], [0.01]],
  },
  frequency: {
    pitch: [A4, [0, A8], [A1]],
    pitchRamp: [0, [-1, 1], [0.01]],
    accel: [0, [-1, 1], [0.01]],
    jerk: [0, [-1, 1], [0.01]],
  },
  lowpass: {
    cutoff: [A8, [0, A8], [A1]],
    cutoffRamp: [0, [-1, 1], [0.01]],
    resonance: [0, [0, 1], [0.01]],
  },
  highpass: {
    cutoff: [0, [0, A10], [A2]],
    cutoffRamp: [0, [-1, 1], [0.01]],
  },
  distortion: {
    on: [false],
    edge: [0.5, [0, 1], [0.01]],
    edgeRamp: [0, [-1, 1], [0.01]],
    grit: [0, [0, 1], [0.01]],
    gritRamp: [0, [-1, 1], [0.01]],
  },
  vibrato: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [0.01]],
    strengthRamp: [0, [-1, 1], [0.01]],
    rate: [6, [0, A0], [0.5]],
    rateRamp: [0, [-1, 1], [0.01]],
  },
  tremolo: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [0.01]],
    strengthRamp: [0, [-1, 1], [0.01]],
    rate: [12, [0, A0], [0.5]],
    rateRamp: [0, [-1, 1], [0.01]],
  },
  ring: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [0.01]],
    strengthRamp: [0, [-1, 1], [0.01]],
    rate: [A6, [A0, A8], [A1]],
    rateRamp: [0, [-1, 1], [0.01]],
  },
  wahwah: {
    on: [false],
    shape: [
      "sine",
      ["sine", "triangle", "sawtooth", "tangent", "square", "whitenoise"],
      [true],
    ],
    strength: [0.5, [0, 1], [0.01]],
    strengthRamp: [0, [-1, 1], [0.01]],
    rate: [6, [0, A0], [0.5]],
    rateRamp: [0, [-1, 1], [0.01]],
  },
  arpeggio: {
    on: [false],
    shapes: [
      [],
      [
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
      "sine",
    ],
    rate: [12, [0, 20], [1]],
    rateRamp: [0, [-1, 1], [0.01]],
    maxOctaves: [1, [1, 8], [1]],
    maxNotes: [160, [2, 900], [1]],
    direction: ["down", ["down", "up", "down-up", "up-down", "random"], [true]],
    tones: [
      [0, 4, 8],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
      0,
    ],
  },
  harmony: {
    on: [false],
    shapes: [
      [],
      [
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
      "sine",
    ],
    count: [1, [0, 6], [1]],
    falloff: [0.5, [0, 1], [0.01]],
    falloffRamp: [0, [-1, 1], [0.01]],
  },
  reverb: {
    on: [false],
    strength: [0.5, [0, 1], [0.01]],
    strengthRamp: [0, [-1, 1], [0.01]],
    delay: [0.15, [0, 1], [0.01]],
    delayRamp: [0, [-1, 1], [0.01]],
  },
};
