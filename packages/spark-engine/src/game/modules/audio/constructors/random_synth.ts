/*
 * Inspired by ChipTone <https://sfbgames.itch.io/chiptone>
 *
 * Each preset mirrors a ChipTone `generate*` function. Where ChipTone uses
 * normalized 0-1 sliders, we precompute the value of the slider after its
 * modifier chain so the result lands in the same audible range:
 *   pitch     Hz = 440 * 2^((s*160 + 3)/12 - 6)
 *   vib       Hz = (s*6 + 0.01)^2
 *   trem      Hz = (s*6)^2 + 0.1
 *   ring      Hz = (s*80)^2 + 20
 *   wah       Hz = (s*5)^2 + 0.1
 *   fm ratio     = 1 / round(s*8 + 2)
 *   arp       Hz = s*20
 *   delay      s = s*0.5
 *   envelope ADSR s = slider * 5  (ChipTone's ADSRSource applies a getLin(5)
 *      modifier to attackTime/decayTime/sustainTime/releaseTime — each slider
 *      represents 1/5 of a second)
 * Effect strengths/depths (vibrato, tremolo, ring, wahwah, fm, bitcrush)
 * stay 0-1 — ChipTone's internal multipliers are already applied by the
 * matching engine constants in synthesizeSound.ts.
 */

import { type Synth } from "../../..";
import { type Create } from "../../../core/types/Create";
import { type Random } from "../../../core/types/Random";
import { chanceOf, pow } from "../../../core/utils/randomSpec";
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
    "jitter",
    "tangent",
    "triangle",
    "sawtooth",
    "square",
    "whitenoise",
  ],
  envelope: {
    attack: pow(0.05, 1.05, 8),
    decay: [0.05, 1.0],
    sustain: pow(0.5, 4.5, 8),
    release: [0.05, 1.0],
    level: [0.3, 0.8],
  },
  pitch: {
    frequency: [52, 13298],
    frequency_ramp: [-0.2, 0.2],
    frequency_torque: [-0.1, 0.1],
  },
  vibrato: {
    on: chanceOf(true, 0.3),
    rate: pow(0, 29.27, 2),
    strength: [0, 0.9],
  },
  harmonics: {
    on: chanceOf(true, 0.3),
    count: [0, 5],
    falloff: [0, 0.9],
  },
  fm: {
    on: chanceOf(true, 0.3),
    ratio: [0.111, 0.5],
    strength: [0, 0.9],
  },
  arpeggio: {
    on: chanceOf(true, 0.2),
    rate: [0, 18],
    direction: ["up", "down", "up-down", "down-up"],
    tones: MAJOR_ARPEGGIOS_UP,
  },
  tremolo: {
    on: chanceOf(true, 0.3),
    rate: pow(0.1, 29.26, 2),
    strength: [0, 0.9],
  },
  ring: {
    on: chanceOf(true, 0.3),
    rate: pow(20, 5204, 2),
    strength: [0, 0.9],
  },
  wahwah: {
    on: chanceOf(true, 0.3),
    rate: pow(0.1, 20.35, 2),
    strength: [0, 0.9],
  },
  bitcrush: {
    on: chanceOf(true, 0.3),
    crush: [0, 0.3],
    skip: [0, 0.3],
  },
  delay: {
    on: chanceOf(true, 0.3),
    length: [0, 0.45],
    strength: [0, 0.9],
  },
  distortion: {
    on: chanceOf(true, 0.3),
    edge: [0, 1],
    grit: [0, 1],
  },
  reverb: {
    on: chanceOf(true, 0.3),
    room_size: [0, 1],
    mix: [0, 1],
  },
});

export const random_synth_coin: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:coin",
  shape: ["sine", "jitter", "tangent", "triangle", "sawtooth", "square"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.01],
    sustain: [0.05, 0.1],
    release: pow(0.05, 0.45, 2),
  },
  pitch: {
    frequency: [523, 5273],
  },
  arpeggio: {
    on: [true],
    rate: [10, 16],
    max_notes: [2],
    tones: [
      [0, 5],
      [0, 6],
      [0, 7],
      [0, 8],
      [0, 9],
      [0, 10],
      [0, 11],
      [0, 12],
    ],
  },
});

export const random_synth_jump: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:jump",
  shape: ["sine", "jitter", "tangent", "triangle", "sawtooth", "square"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.05],
    sustain: [0.05, 0.1],
    release: [0.005, 0.5],
  },
  pitch: {
    frequency: [131, 2093],
    frequency_ramp: [0.2, 0.4],
  },
  fm: {
    on: chanceOf(true, 0.2),
    ratio: [0.2, 0.5],
    strength: [0.1, 1.0],
  },
});

export const random_synth_powerup: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:powerup",
  shape: ["sine", "jitter", "tangent", "triangle", "sawtooth", "square"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.05],
    sustain: [0.05, 0.1],
    release: [0.5, 1.0],
  },
  pitch: {
    frequency: [131, 2093],
    frequency_ramp: [0.05, 0.4],
  },
  vibrato: {
    on: chanceOf(true, 0.4),
    rate: [3.28, 17.72],
    strength: [0.5, 1.0],
  },
  arpeggio: {
    on: chanceOf(true, 0.6),
    rate: [8, 14],
    direction: ["up"],
    tones: MAJOR_ARPEGGIOS_UP,
  },
  fm: {
    on: chanceOf(true, 0.2),
    ratio: [0.2, 0.5],
    strength: [0.1, 1.0],
  },
});

export const random_synth_lose: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:lose",
  shape: ["sine", "jitter", "tangent", "triangle", "sawtooth", "square"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.05],
    sustain: [0.05, 0.1],
    release: [0.5, 1.0],
  },
  pitch: {
    frequency: [131, 2093],
    frequency_ramp: [-0.4, -0.01],
  },
  vibrato: {
    on: chanceOf(true, 0.4),
    rate: [3.28, 17.72],
    strength: [0.5, 1.0],
  },
  arpeggio: {
    on: chanceOf(true, 0.6),
    rate: [8, 14],
    direction: ["down"],
    tones: MAJOR_ARPEGGIOS_DOWN,
  },
  fm: {
    on: chanceOf(true, 0.2),
    ratio: [0.2, 0.5],
    strength: [0.1, 1.0],
  },
});

export const random_synth_zap: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:zap",
  shape: ["jitter", "tangent", "triangle", "sawtooth", "square"],
  envelope: {
    attack: [0],
    decay: [0.05],
    sustain: [0.05, 0.25],
    release: [0.005, 0.25],
  },
  pitch: {
    frequency: [330, 5273],
    frequency_ramp: [-0.6, -0.1],
  },
  vibrato: {
    on: chanceOf(true, 0.2),
    rate: [17.72, 36.12],
    strength: [0.2, 0.8],
  },
  fm: {
    on: chanceOf(true, 0.2),
    ratio: [0.125, 0.333],
    strength: [0.4, 1.0],
  },
});

export const random_synth_hurt: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:hurt",
  shape: ["tangent", "triangle", "sawtooth", "square", "whitenoise"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.05],
    sustain: [0.025, 0.05],
    release: [0.025, 0.15],
  },
  pitch: {
    frequency: [52, 831],
    frequency_ramp: [-0.99, -0.5],
  },
});

export const random_synth_boom: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:boom",
  shape: ["whitenoise", "pinknoise"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.05],
    sustain: [0.05, 0.1],
    release: [0.005, 1.5],
  },
  pitch: {
    frequency: [52, 2093],
    frequency_ramp: [-0.3, 0],
  },
  vibrato: {
    on: chanceOf(true, 0.5),
    rate: [1.46, 29.27],
    strength: [0.1, 0.8],
  },
});

export const random_synth_blip: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:blip",
  shape: ["sine", "triangle", "sawtooth", "tangent", "square", "jitter"],
  envelope: {
    attack: [0],
    decay: [0],
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

export const random_synth_push: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:push",
  shape: ["pinknoise"],
  envelope: {
    attack: [0],
    decay: [0.05],
    sustain: [0.01, 0.05],
    release: [0.05, 0.1],
  },
  pitch: {
    frequency: [A[2], A[5]],
    frequency_ramp: [-1, -0.5],
  },
});

export const random_synth_beep: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:beep",
  shape: ["tangent", "triangle", "sawtooth", "square"],
  envelope: {
    attack: [0],
    decay: [0.005, 0.05],
    sustain: [0.025, 0.05],
    release: [0.025, 0.25],
  },
  pitch: {
    frequency: [208, 2093],
  },
  fm: {
    on: chanceOf(true, 0.2),
    ratio: [0.2, 0.5],
    strength: [0.1, 1.0],
  },
});

export const random_synth_tweet: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:tweet",
  shape: ["sine", "triangle"],
  envelope: {
    attack: [0.006, 0.008],
    decay: [0.002, 0.004],
    sustain: [0.02, 0.04],
    release: [0.005, 0.008],
  },
  pitch: {
    frequency: [A[5], A[9]],
    frequency_ramp: [-1, -0.5],
  },
});

export const random_synth_tap: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:tap",
  shape: ["sine", "triangle"],
  envelope: {
    attack: [0],
    decay: [0.003],
    sustain: [0],
    release: [0.05],
  },
  pitch: {
    frequency: [A[5], A[6]],
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
    tones: [[0]],
    levels: [[0, 0.1, 1]],
  },
});

export const random_synth_clack: Create<Random<Synth>> = () => ({
  $type: "synth",
  $name: "$random:clack",
  shape: ["sawtooth", "tangent", "square"],
  envelope: {
    attack: [0.01],
    decay: [0.003],
    sustain: [0.04],
    release: [0.01],
    level: [0.3],
  },
  pitch: {
    frequency: [A[4], A[8]],
  },
  highpass: {
    on: [true],
    cutoff: [1800, 4000],
  },
  vibrato: {
    on: [true],
    rate: [55],
  },
  arpeggio: {
    on: [true],
    rate: [100],
    max_notes: [7],
    tones: [[0]],
    levels: [[0.2, 1, 0.1, 0.05, 0.01, 1, 0]],
  },
});
