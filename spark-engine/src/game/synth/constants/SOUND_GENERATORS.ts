/*!
 * bfxr2 <https://github.com/increpare/bfxr2>
 *
 * Copyright (c) 2021 Stephen Lavelle
 * Released under the MIT license.
 */

import { denormalize, normalize, pick } from "../../core";
import { create } from "../../core/utils/create";
import { SoundConfig } from "../types/Sound";
import { OSCILLATOR_TYPES } from "./OSCILLATOR_TYPES";
import { SOUND_VALIDATION } from "./SOUND_VALIDATION";

const MAJOR_ARPEGGIOS = [
  [0, 4, 8],
  [0, 4, 8, 14],
  [2, 7, 10],
  [4, 9, 12],
  [0, 6, 10],
  [0, 6, 10, 14],
  [2, 8, 12],
  [1, 4, 10],
  [3, 7, 12],
  [1, 6, 9],
  [3, 8, 11],
  [1, 7, 11],
  [0, 3, 9],
  [0, 3, 9, 14],
  [2, 6, 11],
];

const MINOR_ARPEGGIOS = [
  [0, 3, 8],
  [0, 3, 8, 14],
  [4, 8, 12],
  [0, 6, 9],
  [0, 6, 9, 14],
  [2, 8, 11],
  [0, 4, 10],
  [0, 4, 10, 14],
  [2, 7, 12],
  [1, 4, 9],
  [3, 7, 11],
  [1, 7, 10],
  [3, 9, 12],
  [1, 6, 11],
];

const frnd = (range: number, rng: (() => number) | undefined) => {
  const r = rng || Math.random;
  return r() * range;
};

const rnd = (max: number, rng: (() => number) | undefined) => {
  const r = rng || Math.random;
  return Math.floor(r() * (max + 1));
};

const coin = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "sine",
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "breaker",
    "whistle",
  ]);
  result.frequency.pitch = 0.4 + frnd(0.5, rng);
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = frnd(0.1, rng);
  result.amplitude.release = 0.1 + frnd(0.4, rng);
  if (rnd(1, rng)) {
    result.arpeggio.rate = 0.5 + frnd(0.2, rng);
    result.arpeggio.maxNotes = 2;
    result.arpeggio.direction = "up";
    result.arpeggio.semitones = pick(
      [
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
      rng
    );
  }
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const zap = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "sine",
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "breaker",
    "whistle",
  ]);
  result.frequency.pitch = 0.5 + frnd(0.5, rng);
  // TODO: result.frequency.limit = result.frequency.pitch - 0.2 - frnd(0.6, rng);
  // if (result.frequency.limit < 0.2) {
  //   result.frequency.limit = 0.2;
  // }
  result.frequency.ramp = -0.15 - frnd(0.2, rng);
  if (rnd(2, rng) === 0) {
    result.frequency.pitch = 0.3 + frnd(0.6, rng);
    // TODO: result.frequency.limit = frnd(0.1, rng);
    result.frequency.ramp = -0.35 - frnd(0.3, rng);
  }
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = 0.1 + frnd(0.2, rng);
  result.amplitude.release = frnd(0.4, rng);
  if (rnd(2, rng) === 0) {
    // TODO: result.harmony.countRamp = frnd(0.2, rng);
    // TODO: result.harmony.falloff = -frnd(0.2, rng);
  }
  if (rnd(1, rng)) {
    result.highpass.cutoff = frnd(0.3, rng);
  }
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const boom = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  if (rnd(1, rng)) {
    result.frequency.pitch = 0.1 + frnd(0.4, rng);
    result.frequency.ramp = -0.1 + frnd(0.4, rng);
  } else {
    result.frequency.pitch = 0.2 + frnd(0.7, rng);
    result.frequency.ramp = -0.2 - frnd(0.2, rng);
  }
  result.frequency.pitch *= result.frequency.pitch;
  if (rnd(4, rng) === 0) {
    result.frequency.ramp = 0.0;
  }
  if (rnd(2, rng) === 0) {
    result.reverb.strength = frnd(0.7, rng);
    result.reverb.delay = 0.3 + frnd(0.5, rng);
  }
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = 0.1 + frnd(0.3, rng);
  result.amplitude.release = frnd(0.5, rng);
  if (rnd(1, rng) === 0) {
    // TODO: result.harmony.countRamp = -0.3 + frnd(0.9, rng);
    // TODO: result.harmony.falloff = -frnd(0.3, rng);
  }
  if (rnd(1, rng)) {
    result.vibrato.strength = frnd(0.7, rng);
    result.vibrato.rate = frnd(0.6, rng);
  }
  if (rnd(2, rng) === 0) {
    result.arpeggio.rate = 0.6 + frnd(0.3, rng);
    result.arpeggio.direction = "down";
  }
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const push = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "triangle",
    "sawtooth",
    "tangent",
    "breaker",
    "whistle",
    "whitenoise",
    "pinknoise",
    "brownnoise",
  ]);
  result.frequency.pitch = 0.1 + frnd(0.4, rng);
  result.frequency.ramp = 0.05 + frnd(0.2, rng);
  result.amplitude.attack = 0.01 + frnd(0.09, rng);
  result.amplitude.sustain = 0.01 + frnd(0.09, rng);
  result.amplitude.release = 0.01 + frnd(0.09, rng);
  result.reverb.strength = frnd(0.7, rng);
  result.reverb.delay = 0.3 + frnd(0.5, rng);
  // TODO: result.harmony.countRamp = -0.3 + frnd(0.9, rng);
  // TODO: result.harmony.falloff = -frnd(0.3, rng);
  result.arpeggio.rate = 0.6 + frnd(0.3, rng);
  result.arpeggio.direction = "down";
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const hurt = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "sine",
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "breaker",
    "whistle",
    "whitenoise",
    "pinknoise",
    "brownnoise",
  ]);
  result.frequency.pitch = 0.2 + frnd(0.6, rng);
  result.frequency.ramp = -0.3 - frnd(0.4, rng);
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = frnd(0.1, rng);
  result.amplitude.release = 0.1 + frnd(0.2, rng);
  if (rnd(1, rng)) {
    result.highpass.cutoff = frnd(0.3, rng);
  }
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const powerup = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "sine",
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "breaker",
    "whistle",
  ]);
  if (rnd(1, rng)) {
    result.frequency.pitch = 0.2 + frnd(0.3, rng);
    result.frequency.ramp = 0.1 + frnd(0.4, rng);
    result.arpeggio.rate = 0.5 + frnd(0.2, rng);
    result.arpeggio.maxNotes = 160;
    result.arpeggio.direction = "up";
    result.arpeggio.semitones = pick(MAJOR_ARPEGGIOS, rng);
  } else {
    result.frequency.pitch = 0.2 + frnd(0.3, rng);
    result.frequency.ramp = 0.05 + frnd(0.2, rng);
    if (rnd(1, rng)) {
      result.vibrato.strength = frnd(0.7, rng);
      result.vibrato.rate = frnd(0.6, rng);
    }
  }
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = frnd(0.4, rng);
  result.amplitude.release = 0.1 + frnd(0.4, rng);
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const lose = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "sine",
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "breaker",
    "whistle",
  ]);
  if (rnd(1, rng)) {
    result.frequency.pitch = 0.2 + frnd(0.3, rng);
    result.frequency.ramp = 0.1 + frnd(0.2, rng);
    result.arpeggio.rate = 0.5 + frnd(0.3, rng);
    result.arpeggio.maxNotes = 160;
    result.arpeggio.direction = "down";
    result.arpeggio.semitones = pick(MINOR_ARPEGGIOS, rng);
  } else {
    result.frequency.pitch = 0.2 + frnd(0.3, rng);
    result.frequency.ramp = 0.05 + frnd(0.2, rng);
    if (rnd(1, rng)) {
      result.vibrato.strength = frnd(0.7, rng);
      result.vibrato.rate = frnd(0.6, rng);
    }
  }
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = frnd(0.4, rng);
  result.amplitude.release = 0.1 + frnd(0.4, rng);
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const jump = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick([
    "sine",
    "triangle",
    "sawtooth",
    "square",
    "tangent",
    "breaker",
    "whistle",
  ]);
  result.frequency.pitch = 0.3 + frnd(0.3, rng);
  result.frequency.ramp = 0.1 + frnd(0.2, rng);
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = 0.1 + frnd(0.3, rng);
  result.amplitude.release = 0.1 + frnd(0.2, rng);
  if (rnd(1, rng)) {
    result.highpass.cutoff = frnd(0.3, rng);
  }
  if (rnd(1, rng)) {
    result.lowpass.cutoff = 1.0 - frnd(0.6, rng);
  }
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const blip = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick(["square", "sawtooth"]);
  result.frequency.pitch = 0.2 + frnd(0.4, rng);
  result.amplitude.attack = 0.0;
  result.amplitude.sustain = 0.1 + frnd(0.1, rng);
  result.amplitude.release = frnd(0.2, rng);
  result.highpass.cutoff = 0.1;
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const chirp = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  if (frnd(10, rng) < 1) {
    result.wave = pick([
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ]);
    result.amplitude.attack = 0.4304400932967592 + frnd(0.2, rng) - 0.1;
    result.amplitude.sustain = 0.15739346034252394 + frnd(0.2, rng) - 0.1;
    result.amplitude.release = 0.07478075528212291 + frnd(0.2, rng) - 0.1;
    result.frequency.pitch = 0.9865265720147687 + frnd(0.2, rng) - 0.1;
    // TODO: result.frequency.limit = 0 + frnd(0.2, rng) - 0.1;
    result.frequency.ramp = -0.2995018224359539 + frnd(0.2, rng) - 0.1;
    if (frnd(1.0, rng) < 0.5) {
      result.frequency.ramp = 0.1 + frnd(0.15, rng);
    }
    result.frequency.accel = 0.004598608156964473 + frnd(0.1, rng) - 0.05;
    result.vibrato.strength = -0.2202799497929496 + frnd(0.2, rng) - 0.1;
    result.vibrato.rate = 0.8084998703158364 + frnd(0.2, rng) - 0.1;
    result.arpeggio.rate = 0;
    result.reverb.strength = frnd(0.7, rng);
    result.reverb.delay = 0.6014860189319991 + frnd(0.2, rng) - 0.1;
    // TODO: result.harmony.countRamp = -0.9424902314367765 + frnd(0.2, rng) - 0.1;
    // TODO: result.harmony.falloff = -0.1055482222272056 + frnd(0.2, rng) - 0.1;
    result.lowpass.cutoff = 0.9989765717851521 + frnd(0.2, rng) - 0.1;
    result.lowpass.cutoffRamp = -0.25051720626043017 + frnd(0.2, rng) - 0.1;
    result.lowpass.resonance = 0.32777871505494693 + frnd(0.2, rng) - 0.1;
    result.highpass.cutoff = 0.0023548750981756753 + frnd(0.2, rng) - 0.1;
    result.highpass.cutoffRamp = -0.002375673204842568 + frnd(0.2, rng) - 0.1;
    denormalize(result, SOUND_VALIDATION);
    return result;
  }

  if (frnd(10, rng) < 1) {
    result.wave = pick([
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ]);
    result.amplitude.attack = 0.5277795946672003 + frnd(0.2, rng) - 0.1;
    result.amplitude.sustain = 0.18243733568468432 + frnd(0.2, rng) - 0.1;
    result.amplitude.release = 0.1561353422051903 + frnd(0.2, rng) - 0.1;
    result.frequency.pitch = 0.9028855606533718 + frnd(0.2, rng) - 0.1;
    // TODO: result.frequency.limit = -0.008842787837148716;
    result.frequency.ramp = -0.1;
    result.frequency.accel = -0.012891241489551925;
    result.vibrato.strength = -0.17923136138403065 + frnd(0.2, rng) - 0.1;
    result.vibrato.rate = 0.908263385610142 + frnd(0.2, rng) - 0.1;
    result.arpeggio.rate = 0.0010766233195860703 + frnd(0.2, rng) - 0.1;
    result.reverb.strength = frnd(0.7, rng);
    result.reverb.delay = 0.0591789344172107 + frnd(0.2, rng) - 0.1;
    // TODO: result.harmony.countRamp = -0.9961184222777699 + frnd(0.2, rng) - 0.1;
    // TODO: result.harmony.falloff = -0.08234769395850523 + frnd(0.2, rng) - 0.1;
    result.lowpass.cutoff = 0.9412475115697335 + frnd(0.2, rng) - 0.1;
    result.lowpass.cutoffRamp = -0.18261358925834958 + frnd(0.2, rng) - 0.1;
    result.lowpass.resonance = 0.24541438107389477 + frnd(0.2, rng) - 0.1;
    result.highpass.cutoff = -0.01831940280978611 + frnd(0.2, rng) - 0.1;
    result.highpass.cutoffRamp = -0.03857383633171346 + frnd(0.2, rng) - 0.1;
    denormalize(result, SOUND_VALIDATION);
    return result;
  }
  if (frnd(10, rng) < 1) {
    result.wave = pick([
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ]);
    result.amplitude.attack = 0.4304400932967592 + frnd(0.2, rng) - 0.1;
    result.amplitude.sustain = 0.15739346034252394 + frnd(0.2, rng) - 0.1;
    result.amplitude.release = 0.07478075528212291 + frnd(0.2, rng) - 0.1;
    result.frequency.pitch = 0.9865265720147687 + frnd(0.2, rng) - 0.1;
    // TODO: result.frequency.limit = 0 + frnd(0.2, rng) - 0.1;
    result.frequency.ramp = -0.2995018224359539 + frnd(0.2, rng) - 0.1;
    result.frequency.accel = 0.004598608156964473 + frnd(0.2, rng) - 0.1;
    result.vibrato.strength = -0.2202799497929496 + frnd(0.2, rng) - 0.1;
    result.vibrato.rate = 0.8084998703158364 + frnd(0.2, rng) - 0.1;
    result.arpeggio.rate = -0.10955361249587248 + frnd(0.2, rng) - 0.1;
    result.reverb.strength = frnd(0.7, rng);
    result.reverb.delay = 0.7014860189319991 + frnd(0.2, rng) - 0.1;
    // TODO: result.harmony.countRamp = -0.9424902314367765 + frnd(0.2, rng) - 0.1;
    // TODO: result.harmony.falloff = -0.1055482222272056 + frnd(0.2, rng) - 0.1;
    result.lowpass.cutoff = 0.9989765717851521 + frnd(0.2, rng) - 0.1;
    result.lowpass.cutoffRamp = -0.25051720626043017 + frnd(0.2, rng) - 0.1;
    result.lowpass.resonance = 0.32777871505494693 + frnd(0.2, rng) - 0.1;
    result.highpass.cutoff = 0.0023548750981756753 + frnd(0.2, rng) - 0.1;
    result.highpass.cutoffRamp = -0.002375673204842568 + frnd(0.2, rng) - 0.1;
    denormalize(result, SOUND_VALIDATION);
    return result;
  }
  if (frnd(5, rng) > 1) {
    result.wave = pick([
      "sine",
      "triangle",
      "sawtooth",
      "square",
      "tangent",
      "breaker",
      "whistle",
    ]);
    if (rnd(1, rng)) {
      result.arpeggio.rate = -0.3131172257760948 + frnd(0.2, rng) - 0.1;
      result.frequency.pitch = 0.8090588299313949 + frnd(0.2, rng) - 0.1;
      result.amplitude.attack = 0.004321877246874195 + frnd(0.2, rng) - 0.1;
      result.amplitude.release = 0.1 + frnd(0.2, rng) - 0.1;
      result.amplitude.sustain = 0.4987252564798832 + frnd(0.2, rng) - 0.1;
      result.frequency.accel = 0.31700340314222614 + frnd(0.2, rng) - 0.1;
      // TODO: result.frequency.limit = 0 + frnd(0.2, rng) - 0.1;
      result.frequency.ramp = -0.163380391341416 + frnd(0.2, rng) - 0.1;
      result.highpass.cutoff = 0.4709005021145149 + frnd(0.2, rng) - 0.1;
      result.highpass.cutoffRamp = 0.6924667290539194 + frnd(0.2, rng) - 0.1;
      result.lowpass.cutoff = 0.8351398631384511 + frnd(0.2, rng) - 0.1;
      result.lowpass.cutoffRamp = 0.36616557192873134 + frnd(0.2, rng) - 0.1;
      result.lowpass.resonance = -0.08685777111664439 + frnd(0.2, rng) - 0.1;
      // TODO: result.harmony.countRamp = -0.036084571580025544 + frnd(0.2, rng) - 0.1;
      // TODO: result.harmony.falloff = -0.014806445085568108 + frnd(0.2, rng) - 0.1;
      result.reverb.strength = frnd(0.7, rng);
      result.reverb.delay = -0.8094368475518489 + frnd(0.2, rng) - 0.1;
      result.vibrato.rate = 0.4496665457171294 + frnd(0.2, rng) - 0.1;
      result.vibrato.strength = 0.23413762515532424 + frnd(0.2, rng) - 0.1;
    } else {
      result.arpeggio.rate = 0.3581140690559588 + frnd(0.2, rng) - 0.1;
      result.frequency.pitch = 1.3260897696157528 + frnd(0.2, rng) - 0.1;
      result.amplitude.attack = 0.3160357835682254 + frnd(0.2, rng) - 0.1;
      result.amplitude.release = 0.1 + frnd(0.2, rng) - 0.1;
      result.amplitude.sustain = 0.4 + frnd(0.2, rng) - 0.1;
      result.frequency.accel = 0.2866475886237244 + frnd(0.2, rng) - 0.1;
      // TODO: result.frequency.limit = 0 + frnd(0.2, rng) - 0.1;
      result.frequency.ramp = -0.10956352368742976 + frnd(0.2, rng) - 0.1;
      result.highpass.cutoff = 0.20772718017889846 + frnd(0.2, rng) - 0.1;
      result.highpass.cutoffRamp = 0.1564090637378835 + frnd(0.2, rng) - 0.1;
      result.lowpass.cutoff = 0.6021372770637031 + frnd(0.2, rng) - 0.1;
      result.lowpass.cutoffRamp = 0.24016227139979027 + frnd(0.2, rng) - 0.1;
      result.lowpass.resonance = -0.08787383821160144 + frnd(0.2, rng) - 0.1;
      // TODO: result.harmony.countRamp = -0.381597686151701 + frnd(0.2, rng) - 0.1;
      // TODO: result.harmony.falloff = -0.0002481687661373495 + frnd(0.2, rng) - 0.1;
      result.reverb.strength = frnd(0.7, rng);
      result.reverb.delay = 0.07812112809425686 + frnd(0.2, rng) - 0.1;
      result.vibrato.rate = -0.13648848579133943 + frnd(0.2, rng) - 0.1;
      result.vibrato.strength = 0.0018874158972302657 + frnd(0.2, rng) - 0.1;
    }
    denormalize(result, SOUND_VALIDATION);
    return result;
  }
  result.wave = pick([
    "sine",
    "triangle",
    "square",
    "tangent",
    "breaker",
    "whistle",
  ]);
  result.frequency.pitch = 0.85 + frnd(0.15, rng);
  result.frequency.ramp = 0.3 + frnd(0.15, rng);
  result.amplitude.attack = 0 + frnd(0.09, rng);
  result.amplitude.sustain = 0.2 + frnd(0.3, rng);
  result.amplitude.release = 0 + frnd(0.1, rng);
  result.reverb.strength = frnd(0.7, rng);
  result.reverb.delay = 0.5 + frnd(0.1, rng);
  // TODO: result.harmony.countRamp = -0.3 + frnd(0.9, rng);
  // TODO: result.harmony.falloff = -frnd(0.3, rng);
  result.arpeggio.rate = 0.4 + frnd(0.6, rng);
  result.arpeggio.direction = "random";
  result.lowpass.resonance = frnd(2.0, rng) - 1.0;
  result.lowpass.cutoff = 1.0 - Math.pow(frnd(1.0, rng), 3.0);
  result.lowpass.cutoffRamp = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  if (result.lowpass.cutoff < 0.1 && result.lowpass.cutoffRamp < -0.05) {
    result.lowpass.cutoffRamp = -result.lowpass.cutoffRamp;
  }
  result.highpass.cutoff = Math.pow(frnd(1.0, rng), 5.0);
  result.highpass.cutoffRamp = Math.pow(frnd(2.0, rng) - 1.0, 5.0);
  denormalize(result, SOUND_VALIDATION);
  return result;
};

const random = (rng?: () => number): SoundConfig => {
  const result = create(SOUND_VALIDATION);
  normalize(result, SOUND_VALIDATION);
  result.wave = pick(OSCILLATOR_TYPES);
  result.frequency.pitch = Math.pow(frnd(2.0, rng) - 1.0, 2.0);
  if (rnd(1, rng)) {
    result.frequency.pitch = Math.pow(frnd(2.0, rng) - 1.0, 3.0) + 0.5;
  }
  // TODO: result.frequency.limit = 0.0;
  result.frequency.ramp = Math.pow(frnd(2.0, rng) - 1.0, 5.0);
  if (result.frequency.pitch > 0.7 && result.frequency.ramp > 0.2) {
    result.frequency.ramp = -result.frequency.ramp;
  }
  if (result.frequency.pitch < 0.2 && result.frequency.ramp < -0.05) {
    result.frequency.ramp = -result.frequency.ramp;
  }
  result.frequency.accel = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  result.vibrato.strength = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  result.vibrato.rate = frnd(2.0, rng) - 1.0;
  result.amplitude.attack = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  result.amplitude.sustain = Math.pow(frnd(2.0, rng) - 1.0, 2.0);
  result.amplitude.release = frnd(2.0, rng) - 1.0;
  if (
    result.amplitude.attack +
      result.amplitude.sustain +
      result.amplitude.release <
    0.2
  ) {
    result.amplitude.sustain += 0.2 + frnd(0.3, rng);
    result.amplitude.release += 0.2 + frnd(0.3, rng);
  }
  result.lowpass.resonance = frnd(2.0, rng) - 1.0;
  result.lowpass.cutoff = 1.0 - Math.pow(frnd(1.0, rng), 3.0);
  result.lowpass.cutoffRamp = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  if (result.lowpass.cutoff < 0.1 && result.lowpass.cutoffRamp < -0.05) {
    result.lowpass.cutoffRamp = -result.lowpass.cutoffRamp;
  }
  result.highpass.cutoff = Math.pow(frnd(1.0, rng), 5.0);
  result.highpass.cutoffRamp = Math.pow(frnd(2.0, rng) - 1.0, 5.0);
  // TODO: result.harmony.countRamp = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  // TODO: result.harmony.falloff = Math.pow(frnd(2.0, rng) - 1.0, 3.0);
  result.reverb.strength = frnd(0.7, rng);
  result.reverb.delay = frnd(2.0, rng) - 1.0;
  result.arpeggio.rate = frnd(2.0, rng) - 1.0;
  result.arpeggio.direction = "up";
  denormalize(result, SOUND_VALIDATION);
  return result;
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
  | "chirp"
  | "random";

export const SOUND_GENERATORS: Record<
  SoundGeneratorType,
  (rng?: () => number) => SoundConfig
> = {
  coin,
  zap,
  boom,
  hurt,
  powerup,
  lose,
  jump,
  blip,
  push,
  chirp,
  random,
};

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
  "chirp",
  "random",
];
