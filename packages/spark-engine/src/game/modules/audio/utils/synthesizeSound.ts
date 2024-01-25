/*
 * Based on bfxr2 <https://github.com/increpare/bfxr2>
 *
 * Copyright (c) 2021 Stephen Lavelle
 * Released under the MIT license.
 */

import { lerp } from "../../../core/utils/lerp";
import { randomizer } from "../../../core/utils/randomizer";
import { unlerp } from "../../../core/utils/unlerp";
import { OSCILLATORS, OscillatorState } from "../constants/OSCILLATORS";
import { Synth } from "../specs/Synth";
import { OscillatorType } from "../types/OscillatorType";
import { convertSemitonesToFrequencyFactor } from "./convertSemitonesToFrequencyFactor";

const FREEVERB_COMB_A_SIZES = [1557, 1617, 1491, 1422];
const FREEVERB_COMB_B_SIZES = [1277, 1356, 1188, 1116];
const FREEVERB_ALLPASS_SIZES = [525, 556, 641, 537];

export interface CombState {
  buffer: Float32Array;
  index: number;
  filter: number;
  feedback: number;
  damp: number;
}

export interface AllpassState {
  buffer: Float32Array;
  index: number;
}

export interface ReverbState {
  combAStates: CombState[];
  combBStates: CombState[];
  allpassStates: AllpassState[];
}

export interface SynthesisState extends ReverbState {
  waveState: OscillatorState;
  vibratoState: OscillatorState;
  tremoloState: OscillatorState;
  wahwahState: OscillatorState;
  lowpassInput: [number, number];
  lowpassOutput: [number, number, number];
  highpassInput: [number, number];
  highpassOutput: [number, number, number];
}

export const createSynthesisState = (synth: Synth): SynthesisState => {
  const noise_seed = "";
  const reverb_level = synth.reverb.level;
  const reverb_delay = synth.reverb.delay;
  const rng = randomizer(noise_seed);
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
  const combAStates = FREEVERB_COMB_A_SIZES.map((size) => ({
    buffer: new Float32Array(size),
    index: 0,
    filter: 0,
    feedback: lerp(reverb_delay, 0.28, 0.7),
    damp: lerp(reverb_level, 0, 0.4),
  }));
  const combBStates = FREEVERB_COMB_B_SIZES.map((size) => ({
    buffer: new Float32Array(size),
    index: 0,
    filter: 0,
    feedback: lerp(reverb_delay, 0.28, 0.7),
    damp: lerp(reverb_level, 0, 0.4),
  }));
  const allpassStates = FREEVERB_ALLPASS_SIZES.map((size) => ({
    buffer: new Float32Array(size),
    index: 0,
  }));
  return {
    waveState,
    vibratoState,
    tremoloState,
    wahwahState,
    lowpassInput,
    lowpassOutput,
    highpassInput,
    highpassOutput,
    combAStates,
    combBStates,
    allpassStates,
  };
};

const comb = (gain: number, state: CombState): number => {
  const scale = 0.015;
  const sample = state.buffer[state.index] || 0;
  state.filter = sample * (1 - state.damp) + state.filter * state.damp;
  state.buffer[state.index] = gain * scale + state.filter * state.feedback;
  if (++state.index === state.buffer.length) {
    state.index = 0;
  }
  return sample;
};

const allpass = (gain: number, state: AllpassState): number => {
  const scale = 0.5;
  const sample = state.buffer[state.index] || 0;
  state.buffer[state.index] = gain + sample * scale;
  if (++state.index === state.buffer.length) {
    state.index = 0;
  }
  return sample - gain;
};

/*
 * Based on Freeverb <https://github.com/sinshu/freeverb>
 *
 * Written by Jezar, Released as Public Domain.
 *
 * More Info: https://ccrma.stanford.edu/~jos/pasp/Freeverb.html
 */
const reverb = (
  gain: number,
  combAStates: {
    buffer: Float32Array;
    index: number;
    filter: number;
    feedback: number;
    damp: number;
  }[],
  combBStates: {
    buffer: Float32Array;
    index: number;
    filter: number;
    feedback: number;
    damp: number;
  }[],
  allpassStates: {
    buffer: Float32Array;
    index: number;
  }[]
) => {
  const scale = 0.2;
  // Apply comb filters in parallel
  let output =
    combAStates.map((s) => comb(gain, s)).reduce((p, n) => p + n) +
    combBStates.map((s) => comb(gain, s)).reduce((p, n) => p + n);
  // Apply allpass filters in series
  output = allpassStates.reduce((p, s) => p + allpass(gain, s), output);
  return output * scale;
};

const roundToNearestMultiple = (n: number, period: number): number => {
  return Math.floor(n / period) * period;
};

const normalizeOsc = (mod: number, min: number, max: number) => {
  const p = unlerp(mod, -1, 1);
  return lerp(p, min, max);
};

const getCycleIndex = (
  numNotesPlayed: number,
  choicesLength: number
): number => {
  return Math.floor(numNotesPlayed / choicesLength);
};

const isChoicesReversed = (
  cycleIndex: number,
  direction: "down" | "up" | "down-up" | "up-down"
): boolean => {
  const isEvenCycle = cycleIndex % 2 === 0;
  const isReversed =
    direction === "down" ||
    (direction === "down-up" && isEvenCycle) ||
    (direction === "up-down" && !isEvenCycle);
  return isReversed;
};

const getOctaveSemitones = (
  cycleIndex: number,
  isReversed: boolean | undefined,
  maxOctaves: number
): number => {
  const octave = Math.min(maxOctaves - 1, cycleIndex) * (isReversed ? -1 : 1);
  return octave * 12;
};

const choose = <T>(
  choices: T[],
  numNotesPlayed: number,
  isReversed: boolean
): T | undefined => {
  const index = isReversed
    ? (choices.length - 1 - numNotesPlayed) % choices.length
    : numNotesPlayed % choices.length;
  return choices[index];
};

const getDeltaPerSample = (
  thingsPerSecond: number,
  samplesPerSecond: number
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
  state: OscillatorState
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
  output: [number, number, number]
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
  limitSound: boolean
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
  frequency?: number | Float32Array
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
  const lowpass_cutoff = synth.lowpass.cutoff;
  const lowpass_resonance = synth.lowpass.resonance;
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
  const maxArpeggioLength = Math.max(
    arpeggio_tones?.length ?? 0,
    arpeggio_shapes?.length ?? 0,
    arpeggio_levels?.length ?? 0
  );
  for (let i = 0; i < maxArpeggioLength; i += 1) {
    arpeggio_tones[i] = arpeggio_tones[i] ?? 0;
    arpeggio_shapes[i] = arpeggio_shapes[i] ?? shape_wave;
    arpeggio_levels[i] = arpeggio_levels[i] ?? 1;
  }
  const arpeggio_direction = synth.arpeggio.direction;

  let freqAccelDelta = getDeltaPerSample(
    synth.pitch.frequency_torque,
    sampleRate
  );
  let freqJerkDelta = getDeltaPerSample(synth.pitch.frequency_jerk, sampleRate);
  let pitchFreqDelta = getDeltaPerSample(
    synth.pitch.frequency_ramp,
    sampleRate
  );
  const lowpassCutoffDelta = getDeltaPerSample(
    synth.lowpass.cutoff_ramp,
    sampleRate
  );
  const highpassCutoffDelta = getDeltaPerSample(
    synth.highpass.cutoff_ramp,
    sampleRate
  );
  const vibratoRateDelta = getDeltaPerSample(
    synth.vibrato.rate_ramp,
    sampleRate
  );
  const vibratoStrengthDelta = getDeltaPerSample(
    synth.vibrato.strength_ramp,
    sampleRate
  );
  const distortionGritDelta = getDeltaPerSample(
    synth.distortion.grit_ramp,
    sampleRate
  );
  const distortionEdgeDelta = getDeltaPerSample(
    synth.distortion.edge_ramp,
    sampleRate
  );
  const tremoloRateDelta = getDeltaPerSample(
    synth.tremolo.rate_ramp,
    sampleRate
  );
  const tremoloStrengthDelta = getDeltaPerSample(
    synth.tremolo.strength_ramp,
    sampleRate
  );
  const wahwahRateDelta = getDeltaPerSample(synth.wahwah.rate_ramp, sampleRate);
  const wahwahStrengthDelta = getDeltaPerSample(
    synth.wahwah.strength_ramp,
    sampleRate
  );
  const arpeggioRateDelta = getDeltaPerSample(
    synth.arpeggio.rate_ramp,
    sampleRate
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
  let arpNumNotesPlayed = 0;
  let arpFrequencyFactor = 1;
  let arpAmplitudeFactor = 1;

  const fundamentalFrequency =
    typeof pitch_freq === "number" ? pitch_freq : pitch_freq[startIndex] ?? 0;

  const fundamentalPeriodLength = sampleRate / fundamentalFrequency;
  const startPhaseOffset = pitch_phase * fundamentalPeriodLength;

  let arpPhaseOffset = 0;

  // Fill buffer
  for (let i = startIndex; i < endIndex; i += 1) {
    const sampleVolume =
      typeof nodeGain === "number" ? nodeGain : nodeGain?.[i] ?? 1;
    const pitchFreqFactor = convertSemitonesToFrequencyFactor(
      pitchFreqOffset * 10
    );
    const sampleFrequency =
      (typeof pitch_freq === "number" ? pitch_freq : pitch_freq[i] ?? 0) *
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
      const shortDistortionMod = lerp(distortionGrit, 1, 2);
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
      arpNumNotesPlayed < arpeggio_max_notes
    ) {
      const cycleIndex = getCycleIndex(
        arpNumNotesPlayed,
        arpeggio_tones?.length ?? 0
      );
      const isReversed = isChoicesReversed(cycleIndex, arpeggio_direction);
      const arpOctaveSemitones = getOctaveSemitones(
        cycleIndex,
        isReversed,
        arpeggio_max_octaves
      );
      sampleShape =
        choose(arpeggio_shapes, arpNumNotesPlayed, isReversed) ?? shape_wave;
      if (arpLengthLeft <= 0) {
        arpAmplitudeFactor =
          choose(arpeggio_levels, arpNumNotesPlayed, isReversed) ?? 1;
        const arpNoteSemitones =
          choose(arpeggio_tones, arpNumNotesPlayed, isReversed) ?? 0;
        const arpSemitones = arpOctaveSemitones + arpNoteSemitones;
        const secondsPerNote = 1 / arpeggioRate;
        const samplesPerNote = sampleRate * secondsPerNote;
        arpFrequencyFactor = convertSemitonesToFrequencyFactor(arpSemitones);
        const newPitch = Math.max(0, sampleFrequency) * arpFrequencyFactor;
        const newPeriodLength = isReversed
          ? sampleRate / newPitch
          : periodLength;
        // Ensure frequency changes only occur at zero crossings (to minimize crackles)
        const arpLimit =
          roundToNearestMultiple(samplesPerNote, newPeriodLength) -
          1 +
          (arpNumNotesPlayed === 0 ? startPhaseOffset : 0);
        arpLengthLeft = arpLimit;
        arpPhaseOffset =
          arpNumNotesPlayed === 0
            ? 0
            : localIndex - startPhaseOffset - distortionPhaseOffset;
        arpNumNotesPlayed += 1;
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
        currentState.vibratoState
      );
      const vibratoMultiplier = normalizeOsc(vibratoMod, 0.5, 1);
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
      const distortionMod = lerp(distortionEdge, 1, 8);
      sampleValue =
        Math.pow(Math.abs(sampleValue), 1 / distortionMod) *
        Math.sign(sampleValue);
    }

    // Wah-Wah Effect
    if (wahwah_on && wahwahRate > 0 && wahwahStrength > 0) {
      const wahwahMod = modulate(
        sampleRate,
        localIndex,
        wahwah_shape,
        wahwahRate,
        wahwahStrength,
        currentState.wahwahState
      );
      const wahwahMultiplier = normalizeOsc(wahwahMod, 0.5, 1);
      sampleResonance *= wahwahMultiplier;
    }

    // Lowpass Filter
    if (lowpassCutoff > 0) {
      sampleValue = filter(
        sampleRate,
        sampleValue,
        lowpassCutoff,
        sampleResonance,
        currentState.lowpassInput,
        currentState.lowpassOutput
      );
    }

    // Highpass Filter
    if (highpassCutoff > 0) {
      sampleValue = filter(
        sampleRate,
        sampleValue,
        highpassCutoff,
        0,
        currentState.highpassInput,
        currentState.highpassOutput
      );
    }

    // Tremolo Effect
    if (tremolo_on && tremoloRate > 0 && tremoloStrength > 0) {
      const tremoloMod = modulate(
        sampleRate,
        localIndex,
        tremolo_shape,
        tremoloRate,
        tremoloStrength,
        currentState.tremoloState
      );
      const tremoloMultiplier = normalizeOsc(tremoloMod, 0, 1.5);
      sampleValue *= tremoloMultiplier;
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
      limitSound
    );
    sampleValue *= Math.max(0, envelopeVolume);
    sampleValue *= Math.max(0, sampleVolume);
    sampleValue *= Math.max(0, arpAmplitudeFactor);

    if (volumeBuffer) {
      volumeBuffer[i] = envelopeVolume;
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

export const applyReverbFilter = (
  startIndex: number,
  endIndex: number,
  reverbState: ReverbState,
  soundBuffer: Float32Array
) => {
  for (let i = startIndex; i < endIndex; i += 1) {
    const sampleValue = soundBuffer[i] ?? 0;
    // Set Buffer
    soundBuffer[i] = reverb(
      sampleValue,
      reverbState.combAStates,
      reverbState.combBStates,
      reverbState.allpassStates
    );
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
  currentState?: SynthesisState
): void => {
  const state = currentState ?? createSynthesisState(synth);

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
    frequency
  );

  // Reverb Filter
  const reverb_on = synth.reverb.on;
  if (reverb_on) {
    applyReverbFilter(startIndex, endIndex, state, soundBuffer);
  }
};
