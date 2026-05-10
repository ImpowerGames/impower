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

export type Direction = "up" | "down" | "down-up" | "up-down";

export interface Modulator {
  on: boolean;
  order?: number;
  shape: OscillatorType;
  rate: number;
  rate_ramp: number;
  strength: number;
  strength_ramp: number;
}

export interface Synth {
  shape: OscillatorType;
  phase: number;
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
  };
  vibrato: Modulator;
  harmonics: {
    on: boolean;
    count: number;
    count_ramp: number;
    falloff: number;
    falloff_ramp: number;
  };
  fm: {
    on: boolean;
    ratio: number;
    ratio_ramp: number;
    strength: number;
    strength_ramp: number;
  };
  arpeggio: {
    on: boolean;
    rate: number;
    rate_ramp: number;
    max_octaves: number;
    max_notes: number;
    glide: number;
    direction: Direction;
    tones: number[];
    levels: number[];
    shapes: OscillatorType[];
    phases: number[];
  };
  tremolo: Modulator;
  ring: Modulator;
  wahwah: Modulator;
  distortion: {
    on: boolean;
    grit: number;
    grit_ramp: number;
    edge: number;
    edge_ramp: number;
  };
  bitcrush: {
    on: boolean;
    crush: number;
    crush_ramp: number;
    skip: number;
    skip_ramp: number;
    order?: number;
  };
  delay: {
    on: boolean;
    length: number;
    strength: number;
    feedback: number;
    order?: number;
  };
  reverb: {
    on: boolean;
    room_size: number;
    mix: number;
    damping: number;
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
}

export class OscillatorState {
  angle?: number;
  prevPhase?: number;
  prevRandom?: number;
  b?: [number, number, number, number, number, number, number];
  rng?: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  reset(): void {
    this.angle = 0;
    this.prevPhase = 0;
    this.prevRandom = 0;
    // Don't reallocate the pink-noise filter array; zero it in place.
    const b = this.b;
    if (b) {
      b[0] = 0;
      b[1] = 0;
      b[2] = 0;
      b[3] = 0;
      b[4] = 0;
      b[5] = 0;
      b[6] = 0;
    }
    // rng is intentionally not reset — matches the existing fallback behavior
    // where the module-level RNG persists across allocations.
  }
}

export class ModulatorState extends OscillatorState {
  oscillators?: Record<
    OscillatorType,
    (t: number, state?: OscillatorState) => number
  >;

  constructor(
    rng: () => number,
    oscillators?: Record<
      OscillatorType,
      (t: number, state?: OscillatorState) => number
    >,
  ) {
    super(rng);
    this.oscillators = oscillators;
  }

  process(
    sampleRate: number,
    shape: OscillatorType,
    hertz: number,
    amplitude: number,
  ): number {
    if (!this.oscillators) {
      return 0;
    }

    this.angle ??= 0;

    // Calculate how much the angle should move this sample
    const clampedHertz = Math.max(0, hertz);
    const phaseDelta = clampedHertz / sampleRate;

    // Accumulate the angle
    this.angle += phaseDelta;

    const oscillator = this.oscillators[shape] || this.oscillators["sine"];
    const clampedAmplitude = Math.max(0, amplitude);
    return oscillator(this.angle, this) * clampedAmplitude;
  }
}

export const PI2 = 2 * Math.PI;

const fix = (x: number, fractionDigits = 10): number => {
  // Fix float precision errors
  const result = Number(x.toFixed(fractionDigits));
  return result === 0 ? 0 : result;
};

const clamp = (x: number, min: number, max?: number) => {
  if (x < min) {
    return min;
  }
  if (max != null && x > max) {
    return max;
  }
  return x;
};

const frac = (x: number): number => {
  return x - Math.floor(x);
};

const scaleLinear = (value: number, coefficient: number, constant: number) => {
  if (constant == null) {
    constant = 0.0;
  }
  if (coefficient == null) {
    coefficient = 1.0;
  }
  return value * coefficient + constant;
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
  return 0.75 * Math.sin(PI2 * x) + 0.25 * Math.sin(4 * PI2 * x);
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

const whiteState = new OscillatorState(rng);

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

const pinkState = new OscillatorState(rng);

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

const brownState = new OscillatorState(rng);

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

export const lerp = (
  t: number,
  a: number,
  b: number,
  clampValue: boolean,
): number => {
  if (clampValue) {
    t = clamp(t, 0, 1);
  }
  return a * (1 - t) + b * t;
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

  reset(): void {
    this.buffer.fill(0);
    this.bufIdx = 0;
    this.filterStore = 0;
    // damp1/damp2/feedback are overwritten in ReverbState.process; no need to reset.
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

  reset(): void {
    this.buffer.fill(0);
    this.bufIdx = 0;
    // feedback is fixed at 0.5; don't reset.
  }

  process(input: number): number {
    const bufOut = this.buffer[this.bufIdx]!;
    const output = -input + bufOut;
    this.buffer[this.bufIdx] = input + bufOut * this.feedback;
    if (++this.bufIdx >= this.buffer.length) this.bufIdx = 0;
    return output;
  }
}

class DelayState {
  buffer: Float32Array;
  position: number = 0;
  time: number = 0; // seconds since last wrap
  sampleRate: number;

  constructor(sampleRate: number) {
    this.buffer = new Float32Array(
      Math.ceil(DELAY_LENGTH_MAX * sampleRate) + 1,
    );
    this.sampleRate = sampleRate;
  }

  reset(sampleRate: number): void {
    if (sampleRate !== this.sampleRate) {
      // Sample rate changed — buffer size is rate-dependent, so rebuild.
      this.buffer = new Float32Array(
        Math.ceil(DELAY_LENGTH_MAX * sampleRate) + 1,
      );
      this.sampleRate = sampleRate;
    } else {
      this.buffer.fill(0);
    }
    this.position = 0;
    this.time = 0;
  }

  process(
    dry: number,
    dryMix: number,
    delayLength: number,
    delayStrength: number,
    feedback: number,
  ) {
    const delayed = this.buffer[this.position]!;

    // Mix dry and delayed
    const out = dry * dryMix + delayed * delayStrength;

    // Write input + feedback × previous content back into the same position
    this.buffer[this.position] = dry + delayed * feedback;

    // Advance position, safety-wrap at buffer boundary
    this.position++;
    if (this.position >= this.buffer.length) {
      this.position = 0;
    }

    // Wrap the tape loop when accumulated time exceeds delay length
    this.time += 1 / this.sampleRate;
    if (this.time > delayLength) {
      this.position = 0;
      this.time = 0;
    }
    return out;
  }
}

const REVERB_COMB_SIZES = [
  1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617,
] as const;
const REVERB_ALLPASS_SIZES = [225, 341, 441, 556] as const;

class ReverbState {
  combs: CombFilter[];
  allpasses: AllpassFilter[];
  sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    const scale = sampleRate / 44100;
    this.combs = REVERB_COMB_SIZES.map(
      (s) => new CombFilter(Math.floor(s * scale)),
    );
    this.allpasses = REVERB_ALLPASS_SIZES.map(
      (s) => new AllpassFilter(Math.floor(s * scale)),
    );
  }

  reset(sampleRate: number): void {
    if (sampleRate !== this.sampleRate) {
      // Sample rate changed — comb/allpass buffer sizes are rate-dependent.
      this.sampleRate = sampleRate;
      const scale = sampleRate / 44100;
      for (let i = 0; i < REVERB_COMB_SIZES.length; i++) {
        this.combs[i] = new CombFilter(
          Math.floor(REVERB_COMB_SIZES[i]! * scale),
        );
      }
      for (let i = 0; i < REVERB_ALLPASS_SIZES.length; i++) {
        this.allpasses[i] = new AllpassFilter(
          Math.floor(REVERB_ALLPASS_SIZES[i]! * scale),
        );
      }
    } else {
      for (let i = 0; i < this.combs.length; i++) {
        this.combs[i]!.reset();
      }
      for (let i = 0; i < this.allpasses.length; i++) {
        this.allpasses[i]!.reset();
      }
    }
  }

  process(dry: number, roomSize: number, mix: number, damping: number): number {
    let wet = 0;
    const combFeedback = 0.7 + 0.28 * roomSize;
    const combDamp = 0.4 * damping;

    for (let i = 0; i < this.combs.length; i++) {
      this.combs[i]!.feedback = combFeedback;
      this.combs[i]!.damp1 = combDamp;
      this.combs[i]!.damp2 = 1 - combDamp;
      wet += this.combs[i]!.process(dry);
    }

    wet *= 0.15;

    for (let i = 0; i < this.allpasses.length; i++) {
      wet = this.allpasses[i]!.process(wet);
    }

    return dry * (1 - mix) + wet * mix;
  }
}

class PassFilterState {
  input: [number, number] = [0, 0];
  output: [number, number, number] = [0, 0, 0];

  constructor() {}

  reset(): void {
    this.input[0] = 0;
    this.input[1] = 0;
    this.output[0] = 0;
    this.output[1] = 0;
    this.output[2] = 0;
  }

  process(
    sampleRate: number,
    value: number,
    cutoff: number,
    resonance: number,
  ): number {
    if (cutoff <= 0) {
      cutoff = Number.EPSILON;
    }
    const min = Math.sqrt(2);
    const r = lerp(resonance, min, min * 2, true);
    const c = 1 / Math.tan((Math.PI * cutoff) / sampleRate);
    const a1 = 1 / (1 + r * c + c * c);
    const a2 = 2 * a1;
    const a3 = a1;
    const b1 = 2 * (1 - c * c) * a1;
    const b2 = (1 - r * c + c * c) * a1;
    const newOutput =
      a1 * value +
      a2 * this.input[0] +
      a3 * this.input[1] -
      b1 * this.output[0] -
      b2 * this.output[1];
    this.input[1] = this.input[0];
    this.input[0] = value;
    this.output[2] = this.output[1];
    this.output[1] = this.output[0];
    this.output[0] = newOutput;
    return newOutput;
  }
}

class BandpassFilterState {
  x0 = 0;
  x1 = 0;
  x2 = 0;
  y0 = 0;
  y1 = 0;
  y2 = 0;

  reset(): void {
    this.x0 = 0;
    this.x1 = 0;
    this.x2 = 0;
    this.y0 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }

  process(
    sampleRate: number,
    input: number,
    frequency: number,
    inputStrength: number,
    inputBandwidth: number,
  ): number {
    const strength = 1.0 - inputStrength;
    const bandwidth = 1.0 - inputBandwidth;
    const damp = strength / Math.sqrt(1.0 - strength * strength);
    const wo = (frequency * 2 * Math.PI) / sampleRate;
    const e = 1.0 / (1.0 + damp * Math.tan(wo / (bandwidth * 2.0)));
    const p = Math.cos(wo);
    const d0 = 1.0 - e;
    const d1 = 2.0 * e * p;
    const d2 = 2.0 * e - 1.0;
    this.x0 = this.x1;
    this.x1 = this.x2;
    this.x2 = input;
    this.y0 = this.y1;
    this.y1 = this.y2;
    this.y2 = d0 * this.x2 - d0 * this.x0 + d1 * this.y1 - d2 * this.y0;
    return this.y2;
  }
}

class FMState {
  angle: number = 0;

  reset(): void {
    this.angle = 0;
  }
}

class BitCrushState {
  skipPhase: number = 1.0;
  skipLastSample: number = 0.0;

  reset(): void {
    this.skipPhase = 1.0;
    this.skipLastSample = 0.0;
  }

  process(
    sampleValue: number,
    crush: number,
    skip: number,
    sampleRate: number,
  ) {
    // Crush
    const crushValue = Math.pow(crush, BITCRUSH_CRUSH_EXPONENT); // getExp(0.2): pow(slider, 0.2)
    const numOptions = Math.pow(
      2,
      BITCRUSH_BIT_DEPTH - BITCRUSH_BIT_DEPTH * crushValue,
    );
    sampleValue = Math.trunc(sampleValue * numOptions) / numOptions;

    // Skip
    this.skipPhase +=
      (BITSKIP_MIN_PHASE_DELTA + Math.pow(1.0 - skip, BITSKIP_PHASE_EXPONENT)) *
      (44100 / sampleRate);
    if (this.skipPhase > 1.0) {
      this.skipPhase -= 1.0;
      this.skipLastSample = sampleValue;
    }
    return this.skipLastSample;
  }
}

class EffectChainState {
  effectChain: Int32Array = new Int32Array(NUM_REORDERABLE_EFFECTS);
  effectChainOrders: Int32Array = new Int32Array(NUM_REORDERABLE_EFFECTS);
  effectChainLength: number = 0;

  reset(): void {
    // Slot values are overwritten by addEffect; only the length needs resetting.
    this.effectChainLength = 0;
  }

  addEffect(type: number, order: number | undefined) {
    const effectChain = this.effectChain;
    const effectChainOrders = this.effectChainOrders;
    effectChain[this.effectChainLength] = type;
    effectChainOrders[this.effectChainLength] = order ?? type;
    this.effectChainLength++;
  }

  orderEffects() {
    const effectChain = this.effectChain;
    const effectChainOrders = this.effectChainOrders;
    const effectChainLength = this.effectChainLength;

    // Insertion sort by order, with canonical effect index as the tie-break.
    // At most 5 elements — branchy but allocation-free.
    for (let i = 1; i < effectChainLength; i++) {
      const eVal = effectChain[i]!;
      const oVal = effectChainOrders[i]!;
      let j = i - 1;
      while (
        j >= 0 &&
        (effectChainOrders[j]! > oVal ||
          (effectChainOrders[j]! === oVal && effectChain[j]! > eVal))
      ) {
        effectChain[j + 1] = effectChain[j]!;
        effectChainOrders[j + 1] = effectChainOrders[j]!;
        j--;
      }
      effectChain[j + 1] = eVal;
      effectChainOrders[j + 1] = oVal;
    }
  }
}

export class SynthesisState {
  waveState: ModulatorState;
  vibratoState: ModulatorState;
  tremoloState: ModulatorState;
  ringState: ModulatorState;
  wahwahState: ModulatorState;
  wahwahBandpassState: BandpassFilterState;
  reverbState: ReverbState;
  lowpassState: PassFilterState;
  highpassState: PassFilterState;
  delayState: DelayState;
  fmState: FMState;
  bitcrushState: BitCrushState;
  effectChainState: EffectChainState;

  constructor(
    sampleRate: number,
    rng: () => number,
    oscillators?: Record<
      OscillatorType,
      (t: number, state?: OscillatorState) => number
    >,
  ) {
    this.waveState = new ModulatorState(rng, oscillators);
    this.vibratoState = new ModulatorState(rng, oscillators);
    this.tremoloState = new ModulatorState(rng, oscillators);
    this.ringState = new ModulatorState(rng, oscillators);
    this.wahwahState = new ModulatorState(rng, oscillators);
    this.wahwahBandpassState = new BandpassFilterState();
    this.lowpassState = new PassFilterState();
    this.highpassState = new PassFilterState();
    this.delayState = new DelayState(sampleRate);
    this.reverbState = new ReverbState(sampleRate);
    this.fmState = new FMState();
    this.bitcrushState = new BitCrushState();
    this.effectChainState = new EffectChainState();
  }

  reset(sampleRate: number): void {
    this.waveState.reset();
    this.vibratoState.reset();
    this.tremoloState.reset();
    this.ringState.reset();
    this.wahwahState.reset();
    this.wahwahBandpassState.reset();
    this.lowpassState.reset();
    this.highpassState.reset();
    this.delayState.reset(sampleRate);
    this.reverbState.reset(sampleRate);
    this.fmState.reset();
    this.bitcrushState.reset();
    this.effectChainState.reset();
  }
}

export const roundToNearestMultiple = (n: number, period: number): number => {
  return Math.floor(n / period) * period;
};

export const normalizeOsc = (mod: number, min: number, max: number) => {
  const p = unlerp(mod, -1, 1);
  return lerp(p, min, max, false);
};

export const getCycleIndex = (
  activeIndex: number,
  choicesLength: number,
): number => {
  return Math.floor(activeIndex / choicesLength);
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
  choicesLength: number,
  activeIndex: number,
  isReversed: boolean,
): T | undefined => {
  const wrappedIndex =
    ((activeIndex % choicesLength) + choicesLength) % choicesLength;
  const index = isReversed ? choicesLength - 1 - wrappedIndex : wrappedIndex;
  return choices?.[index];
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
    return lerp(delayP, delayStartVolume, delayEndVolume, true);
  }
  if (localIndex < attackEndIndex) {
    // attack
    const attackP =
      (localIndex - attackStartIndex) / (attackEndIndex - attackStartIndex);
    return lerp(attackP, attackStartVolume, attackEndVolume, true);
  }
  if (localIndex < decayEndIndex) {
    // decay
    const decayP =
      (localIndex - decayStartIndex) / (decayEndIndex - decayStartIndex);
    return lerp(decayP, decayStartVolume, decayEndVolume, true);
  }
  if (localIndex < sustainEndIndex) {
    // sustain
    const sustainP =
      (localIndex - sustainStartIndex) / (sustainEndIndex - sustainStartIndex);
    return lerp(sustainP, sustainStartVolume, sustainEndVolume, true);
  }
  if (localIndex < releaseEndIndex) {
    // release
    const releaseP =
      (localIndex - releaseStartIndex) / (releaseEndIndex - releaseStartIndex);
    return lerp(releaseP, releaseStartVolume, releaseEndVolume, true);
  }
  // after release
  return 0;
};

export const getDelayTailDuration = (synth: Synth): number => {
  if (
    !synth.delay.on ||
    synth.delay.strength <= 0 ||
    synth.delay.length <= 0 ||
    synth.delay.feedback <= 0
  ) {
    return 0;
  }
  const feedback = synth.delay.feedback;
  const numLoops = -3 / Math.log10(Math.max(feedback, 0.001));
  return numLoops * synth.delay.length;
};

export const getReverbTailDuration = (
  synth: Synth,
  sampleRate: number,
): number => {
  if (!synth.reverb.on || synth.reverb.mix <= 0) {
    return 0;
  }

  const room_size = synth.reverb.room_size;
  const combFeedback = 0.7 + 0.28 * room_size;
  const effectiveFeedback = combFeedback;
  const longestCombSamples = Math.floor(1617 * (sampleRate / 44100));
  const longestCombDelay = longestCombSamples / sampleRate;
  const reverbTailDuration =
    (longestCombDelay * -3) / Math.log10(effectiveFeedback);

  return reverbTailDuration;
};

export const getDuration = (synth: Synth, sampleRate: number): number => {
  const soundDuration =
    synth.envelope.offset +
    synth.envelope.attack +
    synth.envelope.decay +
    synth.envelope.sustain +
    synth.envelope.release;

  const delayTailDuration = getDelayTailDuration(synth);
  const reverbTailDuration = getReverbTailDuration(synth, sampleRate);
  const tailDuration = Math.max(delayTailDuration, reverbTailDuration);

  return soundDuration + tailDuration;
};

export const PITCH_SEMITONES_MULTIPLIER = 160;

export const ARPEGGIO_RATE_RAMP_MULTIPLIER = 20;

export const VIBRATO_CARRIER_MIN = 0;
export const VIBRATO_CARRIER_MAX = 2;
export const VIBRATO_RATE_RAMP_MULTIPLIER = 6;
export const VIBRATO_MAX_RATE = 6.01;

export const TREMOLO_CARRIER_MIN = 1;
export const TREMOLO_CARRIER_MAX = 3;
export const TREMOLO_RATE_RAMP_MULTIPLIER = 6;
export const TREMOLO_MAX_RATE = 6;
export const TREMOLO_RATE_FLOOR = 0.1;

export const RING_CARRIER_MIN = 1.5;
export const RING_CARRIER_MAX = 0.5;
export const RING_RATE_RAMP_MULTIPLIER = 80;
export const RING_RATE_FLOOR = 20;
export const RING_MAX_RATE = 80;

export const WAHWAH_CARRIER_MIN = 0.0;
export const WAHWAH_CARRIER_MAX = 2.0;
export const WAHWAH_RATE_RAMP_MULTIPLIER = 5;
export const WAHWAH_STRENGTH_MULTIPLIER = 0.75;
export const WAHWAH_BANDWIDTH = 0.3;
export const WAHWAH_LFO_COEFFICIENT = 15;
export const WAHWAH_LFO_CONSTANT = 25;
export const WAHWAH_COEFFICIENT = 1.5;
export const WAHWAH_CONSTANT = 1.0;
export const WAHWAH_MAX_RATE = 5;
export const WAHWAH_RATE_FLOOR = 0.1;

export const FM_STRENGTH_MULTIPLIER = 0.8;
export const FM_DEPTH_MULTIPLIER = 300;
export const FM_DEPTH_OFFSET = 1.0;
export const FM_TONE_COEFFICIENT = 8.0;
export const FM_TONE_CONSTANT = 2.0;

export const DISTORTION_GRIT_MIN = 1;
export const DISTORTION_GRIT_MAX = 2;
export const DISTORTION_EDGE_MULTIPLIER = 10;

export const DELAY_DRY_MIX = 0.5;
export const DELAY_LENGTH_MAX = 0.5;

export const BITCRUSH_CRUSH_EXPONENT = 0.2; // getExp(0.2) on bitCrushStrength
export const BITCRUSH_BIT_DEPTH = 16; // 2^(16 - 16×crushValue) discrete levels
export const BITSKIP_MIN_PHASE_DELTA = 0.001; // minimum phase advance per sample
export const BITSKIP_PHASE_EXPONENT = 4; // (1 - skip)^4 in phase delta formula

export const NUM_REORDERABLE_EFFECTS = 5;
export const EFFECT = {
  TREMOLO: 0,
  RING: 1,
  WAHWAH: 2,
  BITCRUSH: 3,
  DELAY: 4,
} as const;

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
  const synth_shape = synth.shape;
  const synth_phase = synth.phase;
  const pitch_freq =
    (typeof frequency === "number"
      ? frequency
      : frequency && frequency.length === 1
        ? frequency[0]
        : frequency) ?? synth.pitch.frequency;
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
  const ring_on = synth.ring.on;
  const ring_shape = synth.ring.shape;
  const ring_strength = synth.ring.strength;
  const ring_rate = synth.ring.rate;
  const wahwah_on = synth.wahwah.on;
  const wahwah_shape = synth.wahwah.shape;
  const wahwah_strength = synth.wahwah.strength;
  const wahwah_rate = synth.wahwah.rate;
  const arpeggio_on = synth.arpeggio.on;
  const arpeggio_rate = synth.arpeggio.rate;
  const arpeggio_max_octaves = synth.arpeggio.max_octaves;
  const arpeggio_max_notes = synth.arpeggio.max_notes;
  const arpeggio_glide = synth.arpeggio.glide;
  const arpeggio_tones = synth.arpeggio.tones;
  const arpeggio_shapes = synth.arpeggio.shapes;
  const arpeggio_levels = synth.arpeggio.levels;
  const arpeggio_phases = synth.arpeggio.phases;
  const arpeggio_direction = synth.arpeggio.direction;
  const harmonics_on = synth.harmonics.on;
  const harmonics_count = synth.harmonics.count;
  const harmonics_falloff = synth.harmonics.falloff;
  const fm_on = synth.fm.on;
  const fm_strength = synth.fm.strength;
  const fm_ratio = synth.fm.ratio;
  const bitcrush_on = synth.bitcrush.on;
  const bitcrush_crush = synth.bitcrush.crush;
  const bitcrush_skip = synth.bitcrush.skip;
  const delay_on = synth.delay.on;
  const delay_length = synth.delay.length;
  const delay_strength = synth.delay.strength;
  const delay_feedback = synth.delay.feedback;

  const numNotesInArp = Math.max(
    arpeggio_tones?.length ?? 0,
    arpeggio_shapes?.length ?? 0,
    arpeggio_levels?.length ?? 0,
    arpeggio_phases?.length ?? 0,
  );

  const arpeggioGlideLength = arpeggio_glide * sampleRate;

  // Speed (Hz / s) -> (Hz / sample)
  const freqRamp = synth.pitch.frequency_ramp;
  let pitchSpeed = freqRamp / sampleRate;
  const freqTorque = synth.pitch.frequency_torque;
  let pitchAccel = freqTorque / (sampleRate * sampleRate);
  const freqJerk = synth.pitch.frequency_jerk;
  let pitchJerk = freqJerk / (sampleRate * sampleRate * sampleRate);

  const lowpassCutoffRamp = synth.lowpass.cutoff_ramp;
  const lowpassCutoffDelta = getDeltaPerSample(lowpassCutoffRamp, sampleRate);

  const highpassCutoffRamp = synth.highpass.cutoff_ramp;
  const highpassCutoffDelta = getDeltaPerSample(highpassCutoffRamp, sampleRate);

  const vibratoRateRamp =
    synth.vibrato.rate_ramp * VIBRATO_RATE_RAMP_MULTIPLIER;
  const vibratoRateDelta = getDeltaPerSample(vibratoRateRamp, sampleRate);
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

  const tremoloRateRamp =
    synth.tremolo.rate_ramp * TREMOLO_RATE_RAMP_MULTIPLIER;
  const tremoloRateDelta = getDeltaPerSample(tremoloRateRamp, sampleRate);
  const tremoloStrengthDelta = getDeltaPerSample(
    synth.tremolo.strength_ramp,
    sampleRate,
  );

  const ringRateRamp = synth.ring.rate_ramp * RING_RATE_RAMP_MULTIPLIER;
  const ringRateDelta = getDeltaPerSample(ringRateRamp, sampleRate);
  const ringStrengthDelta = getDeltaPerSample(
    synth.ring.strength_ramp,
    sampleRate,
  );

  const wahwahRateRamp = synth.wahwah.rate_ramp * WAHWAH_RATE_RAMP_MULTIPLIER;
  const wahwahRateDelta = getDeltaPerSample(wahwahRateRamp, sampleRate);
  const wahwahStrengthDelta = getDeltaPerSample(
    synth.wahwah.strength_ramp,
    sampleRate,
  );

  const arpeggioRateRamp =
    synth.arpeggio.rate_ramp * ARPEGGIO_RATE_RAMP_MULTIPLIER;
  const arpeggioRateDelta = getDeltaPerSample(arpeggioRateRamp, sampleRate);

  const harmonicsNumDelta = getDeltaPerSample(
    synth.harmonics.count_ramp,
    sampleRate,
  );
  const harmonicsFalloffDelta = getDeltaPerSample(
    synth.harmonics.falloff_ramp,
    sampleRate,
  );

  const fmStrengthDelta = getDeltaPerSample(synth.fm.strength_ramp, sampleRate);
  const fmRatioDelta = getDeltaPerSample(synth.fm.ratio_ramp, sampleRate);

  const bitcrushCrushDelta = getDeltaPerSample(
    synth.bitcrush.crush_ramp,
    sampleRate,
  );
  const bitcrushSkipDelta = getDeltaPerSample(
    synth.bitcrush.skip_ramp,
    sampleRate,
  );

  let minPitch = Number.MAX_SAFE_INTEGER;
  let maxPitch = 0;
  let pitchOffset = 0;
  let lowpassCutoff = lowpass_cutoff;
  let highpassCutoff = highpass_cutoff;
  let vibratoRate = vibrato_rate;
  let vibratoStrength = vibrato_strength;
  let distortionGrit = distortion_grit;
  let distortionEdge = distortion_edge;
  let tremoloRate = tremolo_rate;
  let tremoloStrength = tremolo_strength;
  let ringRate = ring_rate;
  let ringStrength = ring_strength;
  let wahwahRate = wahwah_rate;
  let wahwahStrength = wahwah_strength;
  let arpeggioRate = arpeggio_rate;
  let harmonicsCount = harmonics_count;
  let harmonicsFalloff = harmonics_falloff;
  let fmStrength = fm_strength;
  let fmRatio = fm_ratio;
  let bitcrushCrush = bitcrush_crush;
  let bitcrushSkip = bitcrush_skip;

  let arpLengthLeft = 0;
  let arpNumNotesPlayed = -1;
  let arpFrequencyFactor = 1;
  let arpTargetFrequencyFactor = 1;
  let arpGlideSpeed = 0;
  let arpAmplitudeFactor = 1;

  let currentAngle = synth_phase;
  let previousAngle = currentAngle;
  let arpWaitingForZeroCrossing = false;

  const MIN_FREQ = 0;
  const MAX_FREQ = sampleRate / 4;

  // Repopulate the effect chain. Reset first so reused state doesn't double-add.
  currentState.effectChainState.reset();
  if (tremolo_on) {
    currentState.effectChainState.addEffect(
      EFFECT.TREMOLO,
      synth.tremolo.order,
    );
  }
  if (ring_on) {
    currentState.effectChainState.addEffect(EFFECT.RING, synth.ring.order);
  }
  if (wahwah_on) {
    currentState.effectChainState.addEffect(EFFECT.WAHWAH, synth.wahwah.order);
  }
  if (bitcrush_on) {
    currentState.effectChainState.addEffect(
      EFFECT.BITCRUSH,
      synth.bitcrush.order,
    );
  }
  if (delay_on) {
    currentState.effectChainState.addEffect(EFFECT.DELAY, synth.delay.order);
  }
  currentState.effectChainState.orderEffects();

  // Fill buffer
  for (let i = startIndex; i < endIndex; i += 1) {
    const masterVolume =
      typeof nodeGain === "number" ? nodeGain : (nodeGain?.[i] ?? 1);

    const baseFreq =
      typeof pitch_freq === "number" ? pitch_freq : (pitch_freq[i] ?? 0);
    const pitchMultiplier = convertSemitonesToFrequencyFactor(
      pitchOffset * PITCH_SEMITONES_MULTIPLIER,
    );
    const baseSampleFrequency = clamp(
      baseFreq * pitchMultiplier,
      MIN_FREQ,
      MAX_FREQ,
    );

    let sampleShape = synth_shape;
    let sampleResonance = lowpass_resonance;

    const localIndex = i - startIndex;

    let samplePitch = baseSampleFrequency * arpFrequencyFactor;
    let periodLength = samplePitch > 0 ? sampleRate / samplePitch : 0;

    // Arpeggio Effect
    if (
      arpeggio_on &&
      arpeggio_tones?.length > 0 &&
      arpNumNotesPlayed < arpeggio_max_notes - 1
    ) {
      const isZeroCrossing =
        localIndex > 0 && Math.floor(currentAngle) > Math.floor(previousAngle);

      if (arpLengthLeft <= 0) {
        arpWaitingForZeroCrossing = true;
      }

      // Advance glide toward target each sample
      if (arpGlideSpeed > 0) {
        arpFrequencyFactor = Math.min(
          arpTargetFrequencyFactor,
          arpFrequencyFactor + arpGlideSpeed,
        );
      } else if (arpGlideSpeed < 0) {
        arpFrequencyFactor = Math.max(
          arpTargetFrequencyFactor,
          arpFrequencyFactor + arpGlideSpeed,
        );
      }
      samplePitch = baseSampleFrequency * arpFrequencyFactor;

      if (
        arpWaitingForZeroCrossing &&
        (isZeroCrossing || arpNumNotesPlayed === -1)
      ) {
        arpWaitingForZeroCrossing = false;
        arpNumNotesPlayed += 1;

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
        const arpNotePhase =
          choose(
            arpeggio_phases,
            numNotesInArp,
            arpNumNotesPlayed,
            isReversed,
          ) ?? 0;

        const arpSemitones = arpOctaveSemitones + arpNoteSemitones;
        const secondsPerNote = 1 / arpeggioRate;

        arpTargetFrequencyFactor =
          convertSemitonesToFrequencyFactor(arpSemitones);

        if (arpNumNotesPlayed === 0 || arpeggioGlideLength === 0) {
          // First note: snap immediately
          arpFrequencyFactor = arpTargetFrequencyFactor;
          arpGlideSpeed = 0;
          samplePitch = baseSampleFrequency * arpFrequencyFactor;
        } else {
          // Subsequent notes: glide to smooth out transition between notes
          arpGlideSpeed =
            (arpTargetFrequencyFactor - arpFrequencyFactor) /
            arpeggioGlideLength;
          // samplePitch stays at current value for this zero-crossing sample;
          // glide begins from the next sample
        }

        arpLengthLeft = Math.round(sampleRate * secondsPerNote);
        currentAngle = Math.floor(currentAngle) + arpNotePhase;
      }

      // Evaluate current arpeggio shape
      const activeNoteIndex = Math.max(0, arpNumNotesPlayed);
      const activeCycleIndex = getCycleIndex(
        activeNoteIndex,
        arpeggio_tones?.length ?? 0,
      );
      const activeIsReversed = isChoicesReversed(
        activeCycleIndex,
        arpeggio_direction,
      );
      sampleShape =
        choose(
          arpeggio_shapes,
          numNotesInArp,
          activeNoteIndex,
          activeIsReversed,
        ) ?? synth_shape;

      if (!arpWaitingForZeroCrossing) {
        arpLengthLeft -= 1;
      }
    }

    // Distortion Grit Effect (Square Width)
    if (distortion_on && distortionGrit > 0 && periodLength > 0) {
      // Check where we are precisely in a 2-cycle loop
      const doubleCyclePhase = currentAngle % 2.0;

      const shortDistortionMod = lerp(
        distortionGrit,
        DISTORTION_GRIT_MIN,
        DISTORTION_GRIT_MAX,
        true,
      );
      const longDistortionMod = 2 - 1 / shortDistortionMod;

      // Because currentAngle equals exact cycles, < 1.0 is exactly the first wave!
      if (doubleCyclePhase < 1.0) {
        samplePitch *= shortDistortionMod; // Fast cycle
      } else {
        samplePitch /= longDistortionMod; // Slow cycle
      }
    }

    // Vibrato Effect
    if (vibrato_on) {
      const vibratoMod = currentState.vibratoState.process(
        sampleRate,
        vibrato_shape,
        vibratoRate,
        vibratoStrength,
      );
      const vibratoMultiplier = normalizeOsc(
        vibratoMod,
        VIBRATO_CARRIER_MIN,
        VIBRATO_CARRIER_MAX,
      );
      samplePitch *= vibratoMultiplier;
    }

    // FM Effect
    if (fm_on) {
      const fmModFreq = samplePitch * fmRatio;
      currentState.fmState.angle += fmModFreq / sampleRate;
      const fmSin = sine(currentState.fmState.angle);
      const fmOffset =
        fmSin * fmStrength * FM_STRENGTH_MULTIPLIER * FM_DEPTH_MULTIPLIER +
        FM_DEPTH_OFFSET;
      samplePitch += fmOffset;
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
    previousAngle = currentAngle;
    currentAngle += samplePitch / sampleRate;

    const oscillator = OSCILLATORS[sampleShape] || OSCILLATORS.sine;

    const totalHarmonics = harmonics_on
      ? (Math.round(harmonicsCount) | 0) + 1
      : 1;

    let sampleValue = 0;
    let harmonicStrength = 1.0;
    let harmonicAngleMult = 1.0; // 1× for fundamental, 2× first harmonic, 4× second, etc...

    for (let h = 0; h < totalHarmonics; h++) {
      // Pass waveState only for the fundamental — higher harmonics use their own
      // angle and don't need shared stateful noise tracking
      sampleValue +=
        oscillator(
          currentAngle * harmonicAngleMult,
          h === 0 ? currentState.waveState : undefined,
        ) * harmonicStrength;

      harmonicStrength *= harmonicsFalloff; // reduce amplitude each harmonic
      harmonicAngleMult *= 2; // double frequency each harmonic
    }

    // Distortion Edge Effect ("Square"-ness)
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

    // Lowpass Filter
    if (lowpass_on) {
      sampleValue = currentState.lowpassState.process(
        sampleRate,
        sampleValue,
        activeCutoff,
        sampleResonance,
      );
    }

    // Highpass Filter
    if (highpass_on) {
      sampleValue = currentState.highpassState.process(
        sampleRate,
        sampleValue,
        highpassCutoff,
        0,
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

    // Reorderable post-envelope effects
    for (let e = 0; e < currentState.effectChainState.effectChainLength; e++) {
      const effect = currentState.effectChainState.effectChain[e];
      if (effect === EFFECT.TREMOLO) {
        const tremoloMod = currentState.tremoloState.process(
          sampleRate,
          tremolo_shape,
          tremoloRate,
          tremoloStrength,
        );
        const tremoloMultiplier = clamp(
          0,
          normalizeOsc(tremoloMod, TREMOLO_CARRIER_MIN, TREMOLO_CARRIER_MAX),
        );
        sampleValue *= tremoloMultiplier;
        if (volumeBuffer) {
          volumeBuffer[i]! *= tremoloMultiplier;
        }
      } else if (effect === EFFECT.RING) {
        const ringMod = currentState.ringState.process(
          sampleRate,
          ring_shape,
          ringRate,
          ringStrength,
        );
        const ringMultiplier = normalizeOsc(
          ringMod,
          RING_CARRIER_MIN,
          RING_CARRIER_MAX,
        );
        sampleValue *= ringMultiplier;
        if (volumeBuffer) {
          volumeBuffer[i]! *= ringMultiplier;
        }
      } else if (effect === EFFECT.WAHWAH) {
        const wahLFO = currentState.wahwahState.process(
          sampleRate,
          wahwah_shape,
          wahwahRate,
          1,
        );
        const wahFrequency = Math.pow(
          scaleLinear(wahLFO, WAHWAH_LFO_COEFFICIENT, WAHWAH_LFO_CONSTANT),
          2,
        );
        sampleValue = currentState.wahwahBandpassState.process(
          sampleRate,
          sampleValue,
          wahFrequency,
          wahwahStrength * WAHWAH_STRENGTH_MULTIPLIER,
          WAHWAH_BANDWIDTH,
        );
        sampleValue *= scaleLinear(
          wahwahStrength,
          WAHWAH_COEFFICIENT,
          WAHWAH_CONSTANT,
        );
      } else if (effect === EFFECT.BITCRUSH) {
        sampleValue = currentState.bitcrushState.process(
          sampleValue,
          bitcrushCrush,
          bitcrushSkip,
          sampleRate,
        );
      } else if (effect === EFFECT.DELAY) {
        sampleValue = currentState.delayState.process(
          sampleValue,
          DELAY_DRY_MIX,
          delay_length,
          delay_strength,
          delay_feedback,
        );
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
    pitchAccel += pitchJerk;
    pitchSpeed += pitchAccel;
    pitchOffset += pitchSpeed;

    lowpassCutoff += lowpassCutoffDelta;

    highpassCutoff += highpassCutoffDelta;

    distortionEdge += distortionEdgeDelta;
    distortionGrit += distortionGritDelta;

    arpeggioRate += arpeggioRateDelta;

    vibratoStrength = clamp(vibratoStrength + vibratoStrengthDelta, 0, 1);
    const vibratoU = clamp(
      Math.sqrt(vibratoRate) + vibratoRateDelta,
      0,
      VIBRATO_MAX_RATE,
    );
    vibratoRate = Math.pow(vibratoU, 2);

    tremoloStrength = clamp(tremoloStrength + tremoloStrengthDelta, 0, 1);
    const tremoloU = clamp(
      Math.sqrt(clamp(tremoloRate - TREMOLO_RATE_FLOOR, 0)) + tremoloRateDelta,
      0,
      TREMOLO_MAX_RATE,
    );
    tremoloRate = Math.pow(tremoloU, 2) + TREMOLO_RATE_FLOOR;

    ringStrength = clamp(ringStrength + ringStrengthDelta, 0, 1);
    const ringU = clamp(
      Math.sqrt(clamp(ringRate - RING_RATE_FLOOR, 0)) + ringRateDelta,
      0,
      RING_MAX_RATE,
    );
    ringRate = Math.pow(ringU, 2) + RING_RATE_FLOOR;

    wahwahStrength = clamp(wahwahStrength + wahwahStrengthDelta, 0, 1);
    const wahwahU = clamp(
      Math.sqrt(clamp(wahwahRate - WAHWAH_RATE_FLOOR, 0)) + wahwahRateDelta,
      0,
      WAHWAH_MAX_RATE,
    );
    wahwahRate = Math.pow(wahwahU, 2) + WAHWAH_RATE_FLOOR;

    harmonicsCount += harmonicsNumDelta;
    harmonicsFalloff = clamp(harmonicsFalloff + harmonicsFalloffDelta, 0, 1);

    fmStrength = clamp(fmStrength + fmStrengthDelta, 0, 1);
    fmRatio = clamp(fmRatio + fmRatioDelta, 0);

    bitcrushCrush = clamp(bitcrushCrush + bitcrushCrushDelta, 0, 1);
    bitcrushSkip = clamp(bitcrushSkip + bitcrushSkipDelta, 0, 1);
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

// Module-level pooled state, used as the fallback when the caller doesn't
// supply their own SynthesisState. Reused across calls — `reset()` clears
// per-call state in place. Lazily created on first use.
let _pooledState: SynthesisState | undefined;

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
  let state: SynthesisState;
  if (currentState) {
    // Caller manages state lifecycle; don't reset.
    state = currentState;
  } else {
    // Reuse the module-level singleton — reset in place to avoid allocation.
    if (!_pooledState) {
      _pooledState = new SynthesisState(sampleRate, rng, OSCILLATORS);
    } else {
      _pooledState.reset(sampleRate);
    }
    state = _pooledState;
  }

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
    const reverb_room_size = synth.reverb.room_size;
    const reverb_mix = synth.reverb.mix;
    const reverb_damping = synth.reverb.damping;
    for (let i = startIndex; i < endIndex; i++) {
      const dry = soundBuffer[i]!;
      soundBuffer[i] = state.reverbState.process(
        dry,
        reverb_room_size,
        reverb_mix,
        reverb_damping,
      );
    }
  }
};
