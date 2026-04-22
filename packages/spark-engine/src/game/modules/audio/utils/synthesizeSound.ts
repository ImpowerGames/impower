/*
 * Based on bfxr2 <https://github.com/increpare/bfxr2>
 *
 * Copyright (c) 2021 Stephen Lavelle
 * Released under the MIT license.
 */

export type OscillatorType =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "square"
  | "tangent"
  | "jitter"
  | "brownnoise"
  | "pinknoise"
  | "whitenoise";

export interface Modulator {
  on: boolean;
  shape: OscillatorType;
  rate: number;
  rate_ramp: number;
  strength: number;
  strength_ramp: number;
}

export interface Synth {
  shape: OscillatorType;
  volume: number;
  envelope: {
    offset: number;
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    level: number;
  };
  pitch: {
    frequency: number;
    frequency_ramp: number;
    frequency_torque: number;
    frequency_jerk: number;
    phase: number;
  };
  lowpass: {
    on: boolean;
    cutoff: number;
    cutoff_ramp: number;
    resonance: number;
  };
  highpass: {
    on: boolean;
    cutoff: number;
    cutoff_ramp: number;
  };
  distortion: {
    on: boolean;
    grit: number;
    grit_ramp: number;
    edge: number;
    edge_ramp: number;
  };
  arpeggio: {
    on: boolean;
    rate: number;
    rate_ramp: number;
    max_octaves: number;
    max_notes: number;
    direction: "up" | "down" | "down-up" | "up-down";
    tones: number[];
    levels: number[];
    shapes: OscillatorType[];
  };
  vibrato: Modulator;
  tremolo: Modulator;
  wahwah: Modulator;
  reverb: {
    on: boolean;
    mix: number;
    room_size: number;
    damping: number;
  };
}

export interface OscillatorState {
  prevPhase?: number;
  prevRandom?: number;
  b?: [number, number, number, number, number, number, number];
  rng?: () => number;
}

export const PI2 = 2 * Math.PI;

const fix = (x: number, fractionDigits = 10): number => {
  // Fix float precision errors
  const result = Number(x.toFixed(fractionDigits));
  return result === 0 ? 0 : result;
};

const clamp = (x: number, min: number, max: number) => {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
};

const frac = (x: number): number => {
  return x - Math.floor(x);
};

const random = (range: number, rng: (() => number) | undefined): number => {
  const r = rng || Math.random;
  return Math.ceil(r() * range) * (Math.round(r()) ? 1 : -1);
};

const sin = (x: number): number => {
  return Math.sin(x);
};

const sgn = (x: number): number => {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
};

const sine = (x: number): number => {
  return sin(PI2 * x);
};

const triangle = (x: number): number => {
  return 1 - 4 * Math.abs(Math.round(x - 1 / 4) - (x - 1 / 4));
};

const sawtooth = (x: number): number => {
  if (x % 0.5 === 0) {
    return 0;
  }
  return 2 * (x - Math.round(x));
};

const square = (x: number): number => {
  return sgn(fix(sin(PI2 * x)));
};

const tangent = (x: number): number => {
  return clamp(0.3 * Math.tan(Math.PI * x), -1, 1);
};

const jitter = (x: number): number => {
  return 0.75 * Math.sin(PI2 * x) + 0.25 * Math.sin(20 * PI2 * x);
};

export const randomizer = (seed: number): (() => number) => {
  return function (): number {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rng = randomizer(0);

const whiteState: OscillatorState = {
  prevPhase: 0,
  prevRandom: 0,
  b: [0, 0, 0, 0, 0, 0, 0],
  rng,
};

const whitenoise = (x: number, state?: OscillatorState): number => {
  const s = state || whiteState;
  const prevPhase = s.prevPhase || 0;
  const prevRandom = s.prevRandom || 0;
  const currPhase = frac(x * 2);
  const currRandom = currPhase < prevPhase ? random(1, s.rng) : prevRandom;
  const value = currRandom;
  s.prevPhase = currPhase;
  s.prevRandom = currRandom;
  return value;
};

const pinkState: OscillatorState = {
  prevPhase: 0,
  prevRandom: 0,
  b: [0, 0, 0, 0, 0, 0, 0],
  rng,
};

const pinknoise = (x: number, state?: OscillatorState): number => {
  const s = state || pinkState;
  const prevPhase = s.prevPhase || 0;
  const prevRandom = s.prevRandom || 0;
  const currPhase = frac(x * 2);
  let currRandom = prevRandom;
  if (currPhase < prevPhase) {
    const white = random(1, s.rng) * 2;
    if (!s.b) {
      s.b = [0, 0, 0, 0, 0, 0, 0];
    }
    s.b[0] = 0.99886 * s.b[0] + white * 0.0555179;
    s.b[1] = 0.99332 * s.b[1] + white * 0.0750759;
    s.b[2] = 0.969 * s.b[2] + white * 0.153852;
    s.b[3] = 0.8665 * s.b[3] + white * 0.3104856;
    s.b[4] = 0.55 * s.b[4] + white * 0.5329522;
    s.b[5] = -0.7616 * s.b[5] + white * 0.016898;
    currRandom =
      (s.b[0] +
        s.b[1] +
        s.b[2] +
        s.b[3] +
        s.b[4] +
        s.b[5] +
        s.b[6] +
        white * 0.5362) /
      7;
    s.b[6] = white * 0.115926;
  }
  const value = currRandom;
  s.prevPhase = currPhase;
  s.prevRandom = currRandom;
  return value;
};

const brownState: OscillatorState = {
  prevPhase: 0,
  prevRandom: 0,
  b: [0, 0, 0, 0, 0, 0, 0],
  rng,
};

const brownnoise = (x: number, state?: OscillatorState): number => {
  const s = state || brownState;
  const prevPhase = s.prevPhase || 0;
  const prevRandom = s.prevRandom || 0;
  const currPhase = frac(x * 2);
  const currRandom =
    currPhase < prevPhase
      ? clamp(prevRandom + random(1, s.rng), -1, 1)
      : prevRandom;
  const value = currRandom;
  s.prevPhase = currPhase;
  s.prevRandom = currRandom;
  return value;
};

export const OSCILLATORS: Record<
  OscillatorType,
  (t: number, state?: OscillatorState) => number
> = {
  sine,
  triangle,
  sawtooth,
  square,
  tangent,
  jitter,
  whitenoise,
  brownnoise,
  pinknoise,
};

export const lerp = (t: number, a: number, b: number): number => {
  if (t <= 0) {
    return a;
  }
  const p = t > 1 ? t - Math.floor(t) : t;
  return a * (1 - p) + b * p;
};

export const unlerp = (value: number, min: number, max: number) => {
  return (value - min) / (max - min);
};

export const convertSemitonesToFrequencyFactor = (
  semitones: number,
): number => {
  return Math.pow(2, semitones / 12);
};

class CombFilter {
  buffer: Float32Array;
  bufIdx: number = 0;
  filterStore: number = 0;
  damp1: number = 0;
  damp2: number = 0;
  feedback: number = 0;

  constructor(size: number) {
    this.buffer = new Float32Array(size);
  }

  process(input: number): number {
    const output = this.buffer[this.bufIdx]!;
    this.filterStore = output * this.damp2 + this.filterStore * this.damp1;
    this.buffer[this.bufIdx] = input + this.filterStore * this.feedback;
    if (++this.bufIdx >= this.buffer.length) this.bufIdx = 0;
    return output;
  }
}

class AllpassFilter {
  buffer: Float32Array;
  bufIdx: number = 0;
  feedback: number = 0.5;

  constructor(size: number) {
    this.buffer = new Float32Array(size);
  }

  process(input: number): number {
    const bufOut = this.buffer[this.bufIdx]!;
    const output = -input + bufOut;
    this.buffer[this.bufIdx] = input + bufOut * this.feedback;
    if (++this.bufIdx >= this.buffer.length) this.bufIdx = 0;
    return output;
  }
}

class ReverbState {
  combs: CombFilter[];
  allpasses: AllpassFilter[];

  constructor(sampleRate: number) {
    const scale = sampleRate / 44100;
    this.combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(
      (s) => new CombFilter(Math.floor(s * scale)),
    );
    this.allpasses = [225, 341, 441, 556].map(
      (s) => new AllpassFilter(Math.floor(s * scale)),
    );
  }

  process(input: number, roomSize: number, damp: number): number {
    let out = 0;
    const combFeedback = 0.7 + 0.28 * roomSize;
    const combDamp = 0.4 * damp;

    for (let i = 0; i < this.combs.length; i++) {
      this.combs[i]!.feedback = combFeedback;
      this.combs[i]!.damp1 = combDamp;
      this.combs[i]!.damp2 = 1 - combDamp;
      out += this.combs[i]!.process(input);
    }

    out *= 0.15;

    for (let i = 0; i < this.allpasses.length; i++) {
      out = this.allpasses[i]!.process(out);
    }

    return out;
  }
}

export interface SynthesisState {
  waveState: OscillatorState;
  vibratoState: OscillatorState;
  tremoloState: OscillatorState;
  wahwahState: OscillatorState;
  reverbState: ReverbState;
  lowpassInput: [number, number];
  lowpassOutput: [number, number, number];
  highpassInput: [number, number];
  highpassOutput: [number, number, number];
}

export const createSynthesisState = (
  sampleRate: number,
  rng: () => number,
): SynthesisState => {
  const waveState: OscillatorState = {
    rng,
  };
  const vibratoState: OscillatorState = {
    rng,
  };
  const tremoloState: OscillatorState = {
    rng,
  };
  const wahwahState: OscillatorState = {
    rng,
  };
  const lowpassInput: [number, number] = [0, 0];
  const lowpassOutput: [number, number, number] = [0, 0, 0];
  const highpassInput: [number, number] = [0, 0];
  const highpassOutput: [number, number, number] = [0, 0, 0];
  return {
    waveState,
    vibratoState,
    tremoloState,
    wahwahState,
    lowpassInput,
    lowpassOutput,
    highpassInput,
    highpassOutput,
    reverbState: new ReverbState(sampleRate),
  };
};

export const roundToNearestMultiple = (n: number, period: number): number => {
  return Math.floor(n / period) * period;
};

export const normalizeOsc = (mod: number, min: number, max: number) => {
  const p = unlerp(mod, -1, 1);
  return lerp(p, min, max);
};

export const getCycleIndex = (
  numNotesPlayed: number,
  choicesLength: number,
): number => {
  return Math.floor(numNotesPlayed / choicesLength);
};

export const isChoicesReversed = (
  cycleIndex: number,
  direction: "down" | "up" | "down-up" | "up-down",
): boolean => {
  const isEvenCycle = cycleIndex % 2 === 0;
  const isReversed =
    direction === "down" ||
    (direction === "down-up" && isEvenCycle) ||
    (direction === "up-down" && !isEvenCycle);
  return isReversed;
};

export const getOctaveSemitones = (
  cycleIndex: number,
  isReversed: boolean | undefined,
  maxOctaves: number,
): number => {
  const octave = Math.min(maxOctaves - 1, cycleIndex) * (isReversed ? -1 : 1);
  return octave * 12;
};

export const choose = <T>(
  choices: T[],
  numNotesInArp: number,
  numNotesPlayed: number,
  isReversed: boolean,
): T | undefined => {
  const index = isReversed
    ? (numNotesInArp - 1 - numNotesPlayed) % numNotesInArp
    : numNotesPlayed % numNotesInArp;
  return choices[index];
};

export const getDeltaPerSample = (
  thingsPerSecond: number,
  samplesPerSecond: number,
): number => {
  if (thingsPerSecond === 0) {
    return 0;
  }
  const thingsPerSample = thingsPerSecond / samplesPerSecond;
  return thingsPerSample;
};

export const modulate = (
  sampleRate: number,
  localIndex: number,
  shape: OscillatorType,
  hertz: number,
  amplitude: number,
  state: OscillatorState,
): number => {
  const angle = (localIndex / sampleRate) * hertz;
  const oscillator = OSCILLATORS?.[shape] || OSCILLATORS.sine;
  return oscillator(angle, state) * amplitude;
};

export const filter = (
  sampleRate: number,
  value: number,
  cutoff: number,
  resonance: number,
  input: [number, number],
  output: [number, number, number],
): number => {
  const min = Math.sqrt(2);
  const r = lerp(resonance, min, min * 2);
  const c = 1 / Math.tan((Math.PI * cutoff) / sampleRate);
  const a1 = 1 / (1 + r * c + c * c);
  const a2 = 2 * a1;
  const a3 = a1;
  const b1 = 2 * (1 - c * c) * a1;
  const b2 = (1 - r * c + c * c) * a1;
  const newOutput =
    a1 * value +
    a2 * input[0] +
    a3 * input[1] -
    b1 * output[0] -
    b2 * output[1];
  input[1] = input[0];
  input[0] = value;
  output[2] = output[1];
  output[1] = output[0];
  output[0] = newOutput;
  return newOutput;
};

const getEnvelopeVolume = (
  i: number,
  startIndex: number,
  endIndex: number,
  sampleRate: number,
  delayDuration: number,
  attackDuration: number,
  decayDuration: number,
  sustainDuration: number,
  releaseDuration: number,
  sustainLevel: number,
  sustainSound: boolean,
  limitSound: boolean,
): number => {
  const localIndex = i - startIndex;
  const length = endIndex - startIndex - 1;
  const duration = length / sampleRate;
  const soundDuration =
    delayDuration +
    attackDuration +
    decayDuration +
    sustainDuration +
    releaseDuration;
  const minDuration =
    delayDuration + attackDuration + decayDuration + releaseDuration;
  if (soundDuration > duration && limitSound) {
    // Limit sound to duration
    if (minDuration <= duration) {
      sustainDuration = duration - minDuration;
    } else {
      const delayFactor = delayDuration / minDuration;
      const attackFactor = attackDuration / minDuration;
      const decayFactor = decayDuration / minDuration;
      const releaseFactor = releaseDuration / minDuration;
      delayDuration = duration * delayFactor;
      attackDuration = duration * attackFactor;
      decayDuration = duration * decayFactor;
      sustainDuration = 0;
      releaseDuration = duration * releaseFactor;
    }
  }
  if (soundDuration < duration && sustainSound) {
    // Sustain sound up until duration
    sustainDuration += duration - soundDuration;
  }
  // Calculate start and end indices
  const delayEndTime = delayDuration;
  const attackEndTime = delayDuration + attackDuration;
  const decayEndTime = delayDuration + attackDuration + decayDuration;
  const sustainEndTime =
    delayDuration + attackDuration + decayDuration + sustainDuration;
  const releaseEndTime =
    delayDuration +
    attackDuration +
    decayDuration +
    sustainDuration +
    releaseDuration;
  const delayStartIndex = 0;
  const delayEndIndex = delayEndTime * sampleRate;
  const attackStartIndex = delayEndIndex;
  const attackEndIndex = attackEndTime * sampleRate;
  const decayStartIndex = attackEndIndex;
  const decayEndIndex = decayEndTime * sampleRate;
  const sustainStartIndex = decayEndIndex;
  const sustainEndIndex = sustainEndTime * sampleRate;
  const releaseStartIndex = sustainEndIndex;
  const releaseEndIndex = releaseEndTime * sampleRate;
  // Calculate start and end volumes
  const delayStartVolume = 0;
  const delayEndVolume = 0;
  const attackStartVolume = 0;
  const attackEndVolume = 1;
  const decayStartVolume = 1;
  const decayEndVolume = sustainLevel;
  const sustainStartVolume = sustainLevel;
  const sustainEndVolume = sustainLevel;
  const releaseStartVolume = sustainLevel;
  const releaseEndVolume = 0;
  if (localIndex < delayStartIndex) {
    // before delay
    return 0;
  }
  if (localIndex < delayEndIndex) {
    // delay
    const delayP =
      (localIndex - delayStartIndex) / (delayEndIndex - delayStartIndex);
    return lerp(delayP, delayStartVolume, delayEndVolume);
  }
  if (localIndex < attackEndIndex) {
    // attack
    const attackP =
      (localIndex - attackStartIndex) / (attackEndIndex - attackStartIndex);
    return lerp(attackP, attackStartVolume, attackEndVolume);
  }
  if (localIndex < decayEndIndex) {
    // decay
    const decayP =
      (localIndex - decayStartIndex) / (decayEndIndex - decayStartIndex);
    return lerp(decayP, decayStartVolume, decayEndVolume);
  }
  if (localIndex < sustainEndIndex) {
    // sustain
    const sustainP =
      (localIndex - sustainStartIndex) / (sustainEndIndex - sustainStartIndex);
    return lerp(sustainP, sustainStartVolume, sustainEndVolume);
  }
  if (localIndex < releaseEndIndex) {
    // release
    const releaseP =
      (localIndex - releaseStartIndex) / (releaseEndIndex - releaseStartIndex);
    return lerp(releaseP, releaseStartVolume, releaseEndVolume);
  }
  // after release
  return 0;
};

const WAHWAH_MIN_RESONANCE = 4000;
const WAHWAH_MIN_CUTOFF = 0.6;
const WAHWAH_MIN = 0;
const WAHWAH_MAX = 1;
const TREMOLO_MIN = 0;
const TREMOLO_MAX = 1.5;
const VIBRATO_MIN = 0.5;
const VIBRATO_MAX = 1;
const DISTORTION_GRIT_MIN = 1;
const DISTORTION_GRIT_MAX = 2;
const DISTORTION_EDGE_MULTIPLIER = 7;

export const fillSoundBuffer = (
  synth: Synth,
  sustainSound: boolean,
  limitSound: boolean,
  sampleRate: number,
  startIndex: number,
  endIndex: number,
  currentState: SynthesisState,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number],
  gain?: number | Float32Array,
  frequency?: number | Float32Array,
): void => {
  const shape_wave = synth.shape;
  const pitch_freq =
    (typeof frequency === "number"
      ? frequency
      : frequency && frequency.length === 1
        ? frequency[0]
        : frequency) ?? synth.pitch.frequency;
  const pitch_phase = synth.pitch.phase;
  const nodeGain =
    typeof gain === "number"
      ? gain
      : gain && gain.length === 1
        ? gain[0]
        : gain;
  const env_delay_duration = synth.envelope.offset;
  const env_attack_duration = synth.envelope.attack;
  const env_decay_duration = synth.envelope.decay;
  const env_sustain_duration = synth.envelope.sustain;
  const env_release_duration = synth.envelope.release;
  const env_sustain_level = synth.envelope.level;
  const lowpass_on = synth.lowpass.on;
  const lowpass_cutoff = synth.lowpass.cutoff;
  const lowpass_resonance = synth.lowpass.resonance;
  const highpass_on = synth.highpass.on;
  const highpass_cutoff = synth.highpass.cutoff;
  const vibrato_on = synth.vibrato.on;
  const vibrato_shape = synth.vibrato.shape;
  const vibrato_strength = synth.vibrato.strength;
  const vibrato_rate = synth.vibrato.rate;
  const distortion_on = synth.distortion.on;
  const distortion_edge = synth.distortion.edge;
  const distortion_grit = synth.distortion.grit;
  const tremolo_on = synth.tremolo.on;
  const tremolo_shape = synth.tremolo.shape;
  const tremolo_strength = synth.tremolo.strength;
  const tremolo_rate = synth.tremolo.rate;
  const wahwah_on = synth.wahwah.on;
  const wahwah_shape = synth.wahwah.shape;
  const wahwah_strength = synth.wahwah.strength;
  const wahwah_rate = synth.wahwah.rate;
  const arpeggio_on = synth.arpeggio.on;
  const arpeggio_rate = synth.arpeggio.rate;
  const arpeggio_max_octaves = synth.arpeggio.max_octaves;
  const arpeggio_max_notes = synth.arpeggio.max_notes;
  const arpeggio_tones = synth.arpeggio.tones;
  const arpeggio_shapes = synth.arpeggio.shapes;
  const arpeggio_levels = synth.arpeggio.levels;
  const arpeggio_direction = synth.arpeggio.direction;

  let freqAccelDelta = getDeltaPerSample(
    synth.pitch.frequency_torque,
    sampleRate,
  );
  let freqJerkDelta = getDeltaPerSample(synth.pitch.frequency_jerk, sampleRate);
  let pitchFreqDelta = getDeltaPerSample(
    synth.pitch.frequency_ramp,
    sampleRate,
  );
  const lowpassCutoffDelta = getDeltaPerSample(
    synth.lowpass.cutoff_ramp,
    sampleRate,
  );
  const highpassCutoffDelta = getDeltaPerSample(
    synth.highpass.cutoff_ramp,
    sampleRate,
  );
  const vibratoRateDelta = getDeltaPerSample(
    synth.vibrato.rate_ramp,
    sampleRate,
  );
  const vibratoStrengthDelta = getDeltaPerSample(
    synth.vibrato.strength_ramp,
    sampleRate,
  );
  const distortionGritDelta = getDeltaPerSample(
    synth.distortion.grit_ramp,
    sampleRate,
  );
  const distortionEdgeDelta = getDeltaPerSample(
    synth.distortion.edge_ramp,
    sampleRate,
  );
  const tremoloRateDelta = getDeltaPerSample(
    synth.tremolo.rate_ramp,
    sampleRate,
  );
  const tremoloStrengthDelta = getDeltaPerSample(
    synth.tremolo.strength_ramp,
    sampleRate,
  );
  const wahwahRateDelta = getDeltaPerSample(synth.wahwah.rate_ramp, sampleRate);
  const wahwahStrengthDelta = getDeltaPerSample(
    synth.wahwah.strength_ramp,
    sampleRate,
  );
  const arpeggioRateDelta = getDeltaPerSample(
    synth.arpeggio.rate_ramp,
    sampleRate,
  );

  let minPitch = Number.MAX_SAFE_INTEGER;
  let maxPitch = 0;
  let pitchFreqOffset = 0;
  let lowpassCutoff = lowpass_cutoff;
  let highpassCutoff = highpass_cutoff;
  let vibratoRate = vibrato_rate;
  let vibratoStrength = vibrato_strength;
  let distortionGrit = distortion_grit;
  let distortionEdge = distortion_edge;
  let tremoloRate = tremolo_rate;
  let tremoloStrength = tremolo_strength;
  let wahwahRate = wahwah_rate;
  let wahwahStrength = wahwah_strength;
  let arpeggioRate = arpeggio_rate;
  let arpLengthLeft = 0;
  let arpNumNotesPlayed = -1;
  let arpFrequencyFactor = 1;
  let arpAmplitudeFactor = 1;

  const fundamentalFrequency =
    typeof pitch_freq === "number" ? pitch_freq : (pitch_freq[startIndex] ?? 0);

  const fundamentalPeriodLength = sampleRate / fundamentalFrequency;
  const startPhaseOffset = pitch_phase * fundamentalPeriodLength;

  let arpPhaseOffset = 0;

  // Fill buffer
  for (let i = startIndex; i < endIndex; i += 1) {
    const masterVolume =
      typeof nodeGain === "number" ? nodeGain : (nodeGain?.[i] ?? 1);
    const pitchFreqFactor = convertSemitonesToFrequencyFactor(
      pitchFreqOffset * 10,
    );
    const sampleFrequency =
      (typeof pitch_freq === "number" ? pitch_freq : (pitch_freq[i] ?? 0)) *
      pitchFreqFactor;
    let samplePitch = Math.max(0, sampleFrequency) * arpFrequencyFactor;
    let sampleShape = shape_wave;
    let sampleResonance = lowpass_resonance;

    const periodLength = sampleRate / samplePitch;

    let distortionPhaseOffset = 0;

    // Distortion Effect (Square Width)
    if (distortion_on && distortionGrit > 0) {
      const doublePeriod = periodLength * 2;
      const phase = i % doublePeriod;
      const shortDistortionMod = lerp(
        distortionGrit,
        DISTORTION_GRIT_MIN,
        DISTORTION_GRIT_MAX,
      );
      const shortBlockLength = periodLength / shortDistortionMod;
      const longDistortionMod = 2 - 1 / shortDistortionMod;
      const cycleIndex = Math.floor(i / doublePeriod);
      if (phase < shortBlockLength) {
        // Short Block
        distortionPhaseOffset = cycleIndex * doublePeriod;
        samplePitch *= shortDistortionMod;
      } else {
        // Long Block
        distortionPhaseOffset = cycleIndex * doublePeriod + shortBlockLength;
        samplePitch /= longDistortionMod;
      }
    }

    const localIndex = i - startIndex;

    // Arpeggio Effect
    if (
      arpeggio_on &&
      arpeggioRate > 0 &&
      arpeggio_tones?.length > 0 &&
      arpNumNotesPlayed < arpeggio_max_notes - 1
    ) {
      if (arpLengthLeft <= 0) {
        arpNumNotesPlayed += 1;
      }
      const cycleIndex = getCycleIndex(
        arpNumNotesPlayed,
        arpeggio_tones?.length ?? 0,
      );
      const isReversed = isChoicesReversed(cycleIndex, arpeggio_direction);
      const arpOctaveSemitones = getOctaveSemitones(
        cycleIndex,
        isReversed,
        arpeggio_max_octaves,
      );
      const numNotesInArp = Math.max(
        arpeggio_tones?.length ?? 0,
        arpeggio_shapes?.length ?? 0,
        arpeggio_levels?.length ?? 0,
      );
      sampleShape =
        choose(arpeggio_shapes, numNotesInArp, arpNumNotesPlayed, isReversed) ??
        shape_wave;
      if (arpLengthLeft <= 0) {
        arpAmplitudeFactor =
          choose(
            arpeggio_levels,
            numNotesInArp,
            arpNumNotesPlayed,
            isReversed,
          ) ?? 1;
        const arpNoteSemitones =
          choose(
            arpeggio_tones,
            numNotesInArp,
            arpNumNotesPlayed,
            isReversed,
          ) ?? 0;
        const arpSemitones = arpOctaveSemitones + arpNoteSemitones;
        const secondsPerNote = 1 / arpeggioRate;
        const samplesPerNote = sampleRate * secondsPerNote;
        arpFrequencyFactor = convertSemitonesToFrequencyFactor(arpSemitones);
        const newPitch = Math.max(0, sampleFrequency) * arpFrequencyFactor;
        // Calculate the period using the new pitch (safeguard against 0Hz division)
        const newPeriodLength =
          newPitch > 0 ? sampleRate / newPitch : periodLength;
        // Ensure frequency changes occur exactly at the nearest integer zero-crossing (to minimize crackles)
        const arpLimit =
          Math.round(roundToNearestMultiple(samplesPerNote, newPeriodLength)) +
          (arpNumNotesPlayed === 0 ? startPhaseOffset : 0);
        arpLengthLeft = arpLimit;
        arpPhaseOffset = localIndex - startPhaseOffset - distortionPhaseOffset;
      }
      arpLengthLeft -= 1;
    }

    // Vibrato Effect
    if (vibrato_on && vibratoRate > 0 && vibratoStrength > 0) {
      const vibratoMod = modulate(
        sampleRate,
        localIndex,
        vibrato_shape,
        vibratoRate,
        vibratoStrength,
        currentState.vibratoState,
      );
      const vibratoMultiplier = normalizeOsc(
        vibratoMod,
        VIBRATO_MIN,
        VIBRATO_MAX,
      );
      samplePitch *= vibratoMultiplier;
    }

    if (pitchBuffer) {
      if (samplePitch > maxPitch) {
        maxPitch = samplePitch;
      }
      if (samplePitch < minPitch) {
        minPitch = samplePitch;
      }
      pitchBuffer[i] = samplePitch;
    }

    // Base Waveform
    const phaseIndex =
      localIndex - startPhaseOffset - distortionPhaseOffset - arpPhaseOffset;
    const angle = (phaseIndex / sampleRate) * samplePitch;
    const oscillator = OSCILLATORS[sampleShape] || OSCILLATORS.sine;
    let sampleValue = oscillator(angle, currentState.waveState);

    // Distortion Effect ("Square"-ness)
    if (distortion_on && distortionEdge > 0) {
      const compressionFactor =
        1 / (1 + distortionEdge * DISTORTION_EDGE_MULTIPLIER);
      if (sampleValue > 0) {
        sampleValue = Math.pow(sampleValue, compressionFactor);
      } else {
        sampleValue = -Math.pow(-sampleValue, compressionFactor);
      }
    }

    let activeCutoff = lowpassCutoff;

    // Wah-Wah Effect
    if (wahwah_on && wahwahRate > 0 && wahwahStrength > 0) {
      const wahMod = modulate(
        sampleRate,
        localIndex,
        wahwah_shape,
        wahwahRate,
        wahwahStrength,
        currentState.wahwahState,
      );
      const wahMultiplier = normalizeOsc(wahMod, WAHWAH_MIN, WAHWAH_MAX);
      activeCutoff =
        (lowpassCutoff > 0 ? lowpassCutoff : WAHWAH_MIN_CUTOFF) * wahMultiplier;
      sampleResonance =
        sampleResonance > 0 ? sampleResonance : WAHWAH_MIN_RESONANCE;
    }

    // Lowpass Filter
    if ((lowpass_on || wahwah_on) && activeCutoff > 0) {
      sampleValue = filter(
        sampleRate,
        sampleValue,
        activeCutoff,
        sampleResonance,
        currentState.lowpassInput,
        currentState.lowpassOutput,
      );
    }

    // Highpass Filter
    if (highpass_on && highpassCutoff > 0) {
      sampleValue = filter(
        sampleRate,
        sampleValue,
        highpassCutoff,
        0,
        currentState.highpassInput,
        currentState.highpassOutput,
      );
    }

    // Volume
    const envelopeVolume = getEnvelopeVolume(
      i,
      startIndex,
      endIndex,
      sampleRate,
      env_delay_duration,
      env_attack_duration,
      env_decay_duration,
      env_sustain_duration,
      env_release_duration,
      env_sustain_level,
      sustainSound,
      limitSound,
    );

    sampleValue *= Math.max(0, envelopeVolume);
    if (volumeBuffer) {
      volumeBuffer[i] = envelopeVolume;
    }

    // Tremolo Effect
    if (tremolo_on && tremoloRate > 0 && tremoloStrength > 0) {
      const tremoloMod = modulate(
        sampleRate,
        localIndex,
        tremolo_shape,
        tremoloRate,
        tremoloStrength,
        currentState.tremoloState,
      );
      const tremoloMultiplier = normalizeOsc(
        tremoloMod,
        TREMOLO_MIN,
        TREMOLO_MAX,
      );
      sampleValue *= tremoloMultiplier;
      if (volumeBuffer) {
        volumeBuffer[i]! *= tremoloMultiplier;
      }
    }

    sampleValue *= Math.max(0, masterVolume);
    if (volumeBuffer) {
      volumeBuffer[i]! *= masterVolume;
    }

    sampleValue *= Math.max(0, arpAmplitudeFactor);
    if (volumeBuffer) {
      volumeBuffer[i]! *= arpAmplitudeFactor;
    }

    // Set Buffer
    soundBuffer[i] = (soundBuffer[i] ?? 0) + sampleValue;

    // Ramp values
    freqAccelDelta += freqJerkDelta;
    pitchFreqDelta += freqAccelDelta;
    pitchFreqOffset += pitchFreqDelta;
    lowpassCutoff += lowpassCutoffDelta;
    highpassCutoff += highpassCutoffDelta;
    vibratoStrength += vibratoStrengthDelta;
    vibratoRate += vibratoRateDelta;
    distortionEdge += distortionEdgeDelta;
    distortionGrit += distortionGritDelta;
    tremoloStrength += tremoloStrengthDelta;
    tremoloRate += tremoloRateDelta;
    wahwahStrength += wahwahStrengthDelta;
    wahwahRate += wahwahRateDelta;
    arpeggioRate += arpeggioRateDelta;
  }
  if (pitchRange) {
    if (minPitch < pitchRange[0]) {
      pitchRange[0] = minPitch;
    }
    if (maxPitch > pitchRange[1]) {
      pitchRange[1] = maxPitch;
    }
  }
};

export const synthesizeSound = (
  synth: Synth,
  sustainSound: boolean,
  limitSound: boolean,
  sampleRate: number,
  startIndex: number,
  endIndex: number,
  soundBuffer: Float32Array,
  volumeBuffer?: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number],
  gain?: number | Float32Array,
  frequency?: number | Float32Array,
  currentState?: SynthesisState,
): void => {
  const state = currentState ?? createSynthesisState(sampleRate, rng);

  // Fundamental Wave
  fillSoundBuffer(
    synth,
    sustainSound,
    limitSound,
    sampleRate,
    startIndex,
    endIndex,
    state,
    soundBuffer,
    volumeBuffer,
    pitchBuffer,
    pitchRange,
    gain,
    frequency,
  );

  // Reverb Filter
  const reverb_on = synth.reverb.on;
  if (reverb_on) {
    const room = synth.reverb.room_size;
    const damp = synth.reverb.damping;
    const mix = synth.reverb.mix;
    for (let i = startIndex; i < endIndex; i++) {
      const dry = soundBuffer[i]!;
      const wet = state.reverbState.process(dry, room, damp);
      soundBuffer[i] = dry * (1 - mix) + wet * mix;
    }
  }
};
