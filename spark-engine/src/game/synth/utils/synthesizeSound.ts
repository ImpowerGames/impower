import { randomizer, shuffle } from "../../../../../spark-evaluate";
import { augment, create, lerp, unlerp } from "../../core";
import { OSCILLATORS, OscillatorState } from "../constants/OSCILLATORS";
import { SOUND_VALIDATION } from "../constants/SOUND_VALIDATION";
import { Hertz } from "../types/Hertz";
import { OscillatorType } from "../types/OscillatorType";
import { Sound, SoundConfig } from "../types/Sound";
import { convertSemitonesToFrequencyFactor } from "./convertSemitonesToFrequencyFactor";

const FREEVERB_COMB_A_SIZES = [1557, 1617, 1491, 1422];
const FREEVERB_COMB_B_SIZES = [1277, 1356, 1188, 1116];
const FREEVERB_ALLPASS_SIZES = [525, 556, 641, 537];

const comb = (
  gain: number,
  state: {
    buffer: Float32Array;
    index: number;
    filter: number;
    feedback: number;
    damp: number;
  }
): number => {
  const scale = 0.015;
  const sample = state.buffer[state.index] || 0;
  state.filter = sample * (1 - state.damp) + state.filter * state.damp;
  state.buffer[state.index] = gain * scale + state.filter * state.feedback;
  if (++state.index === state.buffer.length) {
    state.index = 0;
  }
  return sample;
};

const allpass = (
  gain: number,
  state: {
    buffer: Float32Array;
    index: number;
  }
): number => {
  const scale = 0.5;
  const sample = state.buffer[state.index] || 0;
  state.buffer[state.index] = gain + sample * scale;
  if (++state.index === state.buffer.length) {
    state.index = 0;
  }
  return sample - gain;
};

/**!
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

const mapOsc = (mod: number, min: number, max: number) => {
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
  numNotesPlayed: number,
  choicesLength: number,
  direction: "down" | "up" | "down-up" | "up-down" | "random"
): boolean => {
  const cycleIndex = getCycleIndex(numNotesPlayed, choicesLength);
  const isEvenCycle = cycleIndex % 2 === 0;
  const isReversed =
    direction === "down" ||
    (direction === "down-up" && isEvenCycle) ||
    (direction === "up-down" && !isEvenCycle);
  return isReversed;
};

const getOctaveSemitones = (
  numNotesPlayed: number,
  choicesLength: number,
  direction: "down" | "up" | "down-up" | "up-down" | "random",
  maxOctaves: number
): number => {
  const cycleIndex = getCycleIndex(numNotesPlayed, choicesLength);
  const isReversed = isChoicesReversed(
    numNotesPlayed,
    choicesLength,
    direction
  );
  const octave = Math.min(maxOctaves - 1, cycleIndex) * (isReversed ? -1 : 1);
  return octave * 12;
};

const choose = <T>(
  choices: T[],
  reversedChoices: T[],
  direction: "down" | "up" | "down-up" | "up-down" | "random",
  numNotesPlayed: number
): T | undefined => {
  const cycleIndex = getCycleIndex(numNotesPlayed, choices.length);
  const cycleSeed = direction === "random" ? "" + cycleIndex : undefined;
  const isReversed = isChoicesReversed(
    numNotesPlayed,
    choices.length,
    direction
  );
  const ordered =
    direction === "random"
      ? shuffle(choices, randomizer(cycleSeed))
      : isReversed
      ? reversedChoices
      : choices;
  const chooseIndex = numNotesPlayed % choices.length;
  return ordered[chooseIndex];
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
) => {
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
    attackDuration + decayDuration + sustainDuration + releaseDuration;
  const minDuration = attackDuration + decayDuration + releaseDuration;
  if (soundDuration > duration && limitSound) {
    // Limit sound to duration
    if (minDuration <= duration) {
      sustainDuration = duration - minDuration;
    } else {
      const attackFactor = attackDuration / minDuration;
      const decayFactor = decayDuration / minDuration;
      const releaseFactor = releaseDuration / minDuration;
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
  const attackEndTime = attackDuration;
  const decayEndTime = attackDuration + decayDuration;
  const sustainEndTime = attackDuration + decayDuration + sustainDuration;
  const releaseEndTime =
    attackDuration + decayDuration + sustainDuration + releaseDuration;
  const attackStartIndex = 0;
  const attackEndIndex = attackEndTime * sampleRate;
  const decayStartIndex = attackEndIndex;
  const decayEndIndex = decayEndTime * sampleRate;
  const sustainStartIndex = decayEndIndex;
  const sustainEndIndex = sustainEndTime * sampleRate;
  const releaseStartIndex = sustainEndIndex;
  const releaseEndIndex = releaseEndTime * sampleRate;
  // Calculate start and end volumes
  const attackStartVolume = 0;
  const attackEndVolume = 1;
  const decayStartVolume = 1;
  const decayEndVolume = sustainLevel;
  const sustainStartVolume = sustainLevel;
  const sustainEndVolume = sustainLevel;
  const releaseStartVolume = sustainLevel;
  const releaseEndVolume = 0;
  // Get volume at current index
  if (localIndex < attackStartIndex) {
    // before attack
    return 0;
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

export const fillBuffer = (
  sound: Sound,
  sustainSound: boolean,
  limitSound: boolean,
  sampleRate: number,
  startIndex: number,
  endIndex: number,
  soundBuffer: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number]
): void => {
  const sound_noiseSeed = sound.noiseSeed;
  const sound_wave = sound.wave;
  const freq_pitch = sound.frequency.pitch;
  const amp_volume = sound.amplitude.volume;
  const amp_attack_duration = sound.amplitude.attack;
  const amp_decay_duration = sound.amplitude.decay;
  const amp_sustain_duration = sound.amplitude.sustain;
  const amp_release_duration = sound.amplitude.release;
  const amp_sustain_level = sound.amplitude.sustainLevel;
  const lowpass_cutoff = sound.lowpass.cutoff;
  const lowpass_resonance = sound.lowpass.resonance;
  const highpass_cutoff = sound.highpass.cutoff;
  const vibrato_on = sound.vibrato.on;
  const vibrato_shape = sound.vibrato.shape;
  const vibrato_strength = sound.vibrato.strength;
  const vibrato_rate = sound.vibrato.rate;
  const distortion_on = sound.distortion.on;
  const distortion_edge = sound.distortion.edge;
  const distortion_grit = sound.distortion.grit;
  const tremolo_on = sound.tremolo.on;
  const tremolo_shape = sound.tremolo.shape;
  const tremolo_strength = sound.tremolo.strength;
  const tremolo_rate = sound.tremolo.rate;
  const wahwah_on = sound.wahwah.on;
  const wahwah_shape = sound.wahwah.shape;
  const wahwah_strength = sound.wahwah.strength;
  const wahwah_rate = sound.wahwah.rate;
  const ring_on = sound.ring.on;
  const ring_shape = sound.ring.shape;
  const ring_strength = sound.ring.strength;
  const ring_rate = sound.ring.rate;
  const arpeggio_on = sound.arpeggio.on;
  const arpeggio_rate = sound.arpeggio.rate;
  const arpeggio_max_octaves = sound.arpeggio.maxOctaves;
  const arpeggio_max_notes = sound.arpeggio.maxNotes;
  const arpeggio_semitones = sound.arpeggio.tones;
  const arpeggio_shapes = arpeggio_semitones.map(
    (_, i) => sound.arpeggio.shapes[i] || sound_wave
  );
  const arpeggio_semitones_reversed = [...arpeggio_semitones].reverse();
  const arpeggio_shapes_reversed = [...arpeggio_shapes].reverse();
  const arpeggio_direction = sound.arpeggio.direction;

  const endPitch =
    freq_pitch *
    convertSemitonesToFrequencyFactor(sound.frequency.pitchRamp * 10);
  const pitchDelta = endPitch - freq_pitch;
  const length = endIndex - startIndex - 1;
  let freqSemitonesDelta = pitchDelta / length;

  let freqAccelDelta = getDeltaPerSample(sound.frequency.accel, sampleRate);
  const freqJerkDelta = getDeltaPerSample(sound.frequency.jerk, sampleRate);
  const ampVolumeDelta = getDeltaPerSample(
    sound.amplitude.volumeRamp,
    sampleRate
  );
  const lowpassCutoffDelta = getDeltaPerSample(
    sound.lowpass.cutoffRamp,
    sampleRate
  );
  const highpassCutoffDelta = getDeltaPerSample(
    sound.highpass.cutoffRamp,
    sampleRate
  );
  const vibratoRateDelta = getDeltaPerSample(
    sound.vibrato.rateRamp,
    sampleRate
  );
  const vibratoStrengthDelta = getDeltaPerSample(
    sound.vibrato.strengthRamp,
    sampleRate
  );
  const distortionGritDelta = getDeltaPerSample(
    sound.distortion.gritRamp,
    sampleRate
  );
  const distortionEdgeDelta = getDeltaPerSample(
    sound.distortion.edgeRamp,
    sampleRate
  );
  const tremoloRateDelta = getDeltaPerSample(
    sound.tremolo.rateRamp,
    sampleRate
  );
  const tremoloStrengthDelta = getDeltaPerSample(
    sound.tremolo.strengthRamp,
    sampleRate
  );
  const wahwahRateDelta = getDeltaPerSample(sound.wahwah.rateRamp, sampleRate);
  const wahwahStrengthDelta = getDeltaPerSample(
    sound.wahwah.strengthRamp,
    sampleRate
  );
  const ringRateDelta = getDeltaPerSample(sound.ring.rateRamp, sampleRate);
  const ringStrengthDelta = getDeltaPerSample(
    sound.ring.strengthRamp,
    sampleRate
  );
  const arpeggioRateDelta = getDeltaPerSample(
    sound.arpeggio.rateRamp,
    sampleRate
  );

  const rng = randomizer(sound_noiseSeed);
  const oscState: OscillatorState = {
    rng,
  };
  const vibratoState: OscillatorState = {
    rng,
  };
  const tremoloState: OscillatorState = {
    rng,
  };
  const ringState: OscillatorState = {
    rng,
  };
  const wahwahState: OscillatorState = {
    rng,
  };

  let minPitch = Number.MAX_SAFE_INTEGER;
  let maxPitch = 0;
  let ampVolume = amp_volume;
  let freqPitch = freq_pitch;
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
  let ringRate = ring_rate;
  let ringStrength = ring_strength;
  let arpeggioRate = arpeggio_rate;
  let arpLengthLeft = 0;
  let arpNumNotesPlayed = 0;
  let arpFrequencyFactor = 1;
  const lowpassInput: [number, number] = [0, 0];
  const lowpassOutput: [number, number, number] = [0, 0, 0];
  const highpassInput: [number, number] = [0, 0];
  const highpassOutput: [number, number, number] = [0, 0, 0];

  let phaseOffset = 0;

  // Fill buffer
  for (let i = startIndex; i < endIndex; i += 1) {
    let samplePitch = Math.max(0, freqPitch) * arpFrequencyFactor;
    let sampleShape = sound_wave;
    let sampleResonance = lowpass_resonance;

    const periodLength = sampleRate / samplePitch;

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
        phaseOffset = cycleIndex * doublePeriod;
        samplePitch *= shortDistortionMod;
      } else {
        // Long Block
        phaseOffset = cycleIndex * doublePeriod + shortBlockLength;
        samplePitch /= longDistortionMod;
      }
    }

    const localIndex = i - startIndex;

    // Arpeggio Effect
    if (
      arpeggio_on &&
      arpeggioRate > 0 &&
      arpeggio_semitones.length > 0 &&
      arpNumNotesPlayed < arpeggio_max_notes
    ) {
      const arpOctaveSemitones = getOctaveSemitones(
        arpNumNotesPlayed,
        arpeggio_semitones.length,
        arpeggio_direction,
        arpeggio_max_octaves
      );
      sampleShape =
        choose(
          arpeggio_shapes,
          arpeggio_shapes_reversed,
          arpeggio_direction,
          arpNumNotesPlayed
        ) || sound_wave;
      const arpNoteSemitones =
        choose(
          arpeggio_semitones,
          arpeggio_semitones_reversed,
          arpeggio_direction,
          arpNumNotesPlayed
        ) || 0;
      const arpSemitones = arpOctaveSemitones + arpNoteSemitones;
      const secondsPerNote = 1 / arpeggioRate;
      const samplesPerNote = sampleRate * secondsPerNote;
      if (arpLengthLeft <= 0) {
        arpNumNotesPlayed += 1;
        arpFrequencyFactor = convertSemitonesToFrequencyFactor(arpSemitones);
        const newPitch = Math.max(0, freqPitch) * arpFrequencyFactor;
        const newPeriodLength = sampleRate / newPitch;
        // Ensure frequency changes only occur at zero crossings (to minimize crackles)
        const arpLimit = roundToNearestMultiple(
          samplesPerNote,
          Math.floor(newPeriodLength)
        );
        arpLengthLeft = arpLimit;
        phaseOffset = localIndex;
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
        vibratoState
      );
      const vibratoMultiplier = mapOsc(vibratoMod, 0.5, 1);
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
    const angle = ((localIndex - phaseOffset) / sampleRate) * samplePitch;
    const oscillator = OSCILLATORS[sampleShape] || OSCILLATORS.sine;
    let sampleValue = oscillator(angle, oscState);

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
        wahwahState
      );
      const wahwahMultiplier = mapOsc(wahwahMod, 0.5, 1);
      sampleResonance *= wahwahMultiplier;
    }

    // Lowpass Filter
    if (lowpassCutoff > 0) {
      sampleValue = filter(
        sampleRate,
        sampleValue,
        lowpassCutoff,
        sampleResonance,
        lowpassInput,
        lowpassOutput
      );
    }

    // Highpass Filter
    if (highpassCutoff > 0) {
      sampleValue = filter(
        sampleRate,
        sampleValue,
        highpassCutoff,
        0,
        highpassInput,
        highpassOutput
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
        tremoloState
      );
      const tremoloMultiplier = mapOsc(tremoloMod, 0, 1.5);
      sampleValue *= tremoloMultiplier;
    }

    // Ring Effect
    if (ring_on && ringRate > 0 && ringStrength > 0) {
      const ringMod = modulate(
        sampleRate,
        localIndex,
        ring_shape,
        ringRate,
        ringStrength,
        ringState
      );
      const ringMultiplier = mapOsc(ringMod, 0.5, 1);
      sampleValue *= ringMultiplier;
    }

    // Volume
    const envelopeVolume = getEnvelopeVolume(
      i,
      startIndex,
      endIndex,
      sampleRate,
      amp_attack_duration,
      amp_decay_duration,
      amp_sustain_duration,
      amp_release_duration,
      amp_sustain_level,
      sustainSound,
      limitSound
    );
    sampleValue *= Math.max(0, envelopeVolume);
    sampleValue *= Math.max(0, ampVolume);

    // Set Buffer
    soundBuffer[i] += sampleValue;

    // Ramp values
    freqAccelDelta += freqJerkDelta;
    freqSemitonesDelta += freqAccelDelta;
    freqPitch += freqSemitonesDelta;
    ampVolume += ampVolumeDelta;
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
    ringStrength += ringStrengthDelta;
    ringRate += ringRateDelta;
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
  config: SoundConfig,
  sustainSound: boolean,
  limitSound: boolean,
  sampleRate: number,
  startIndex: number,
  endIndex: number,
  soundBuffer: Float32Array,
  pitchBuffer?: Float32Array,
  pitchRange?: [number, number],
  volume?: number,
  pitch?: Hertz
): void => {
  const sound: Sound = create(SOUND_VALIDATION);
  augment(sound, config);

  if (volume != null) {
    sound.amplitude.volume = volume;
  }
  if (pitch) {
    sound.frequency.pitch = pitch;
  }

  const fundamentalWave = sound.wave;
  const fundamentalPitch = sound.frequency.pitch;
  const fundamentalVolume = sound.amplitude.volume;

  const harmony_on = sound.harmony.on;
  const harmony_shapes = sound.harmony.shapes;
  const harmonics_count = sound.harmony.count;
  const harmony_falloff = sound.harmony.falloff;

  const volumeMod = harmony_on && harmonics_count > 0 ? 0.5 : 1;

  // Fundamental Wave
  sound.amplitude.volume = fundamentalVolume * volumeMod;
  fillBuffer(
    sound,
    sustainSound,
    limitSound,
    sampleRate,
    startIndex,
    endIndex,
    soundBuffer,
    pitchBuffer,
    pitchRange
  );

  // Harmonic Waves
  if (harmony_on) {
    let frequencyFactor = 2;
    for (let i = 0; i < harmonics_count; i += 1) {
      sound.wave = harmony_shapes[i] || fundamentalWave;
      sound.frequency.pitch = fundamentalPitch * frequencyFactor;
      sound.amplitude.volume =
        fundamentalVolume * (1 / (harmonics_count * harmony_falloff));
      sound.amplitude.volumeRamp = sound.harmony.falloffRamp;
      fillBuffer(
        sound,
        sustainSound,
        limitSound,
        sampleRate,
        startIndex,
        endIndex,
        soundBuffer,
        pitchBuffer,
        pitchRange
      );
      frequencyFactor += frequencyFactor;
    }
  }

  // Reverb Filter
  const reverb_on = sound.reverb.on;
  const reverb_strength = sound.reverb.strength;
  const reverb_delay = sound.reverb.delay;
  if (reverb_on) {
    let reverbStrength = reverb_strength;
    let reverbDelay = reverb_delay;
    const reverbStrengthDelta = getDeltaPerSample(
      sound.reverb.strengthRamp,
      sampleRate
    );
    const reverbDelayDelta = getDeltaPerSample(
      sound.reverb.delayRamp,
      sampleRate
    );
    // Create 8 comb filters
    const combAStates = FREEVERB_COMB_A_SIZES.map((size) => ({
      buffer: new Float32Array(size),
      index: 0,
      filter: 0,
      feedback: lerp(reverbDelay, 0.28, 0.7),
      damp: lerp(reverbStrength, 0, 0.4),
    }));
    const combBStates = FREEVERB_COMB_B_SIZES.map((size) => ({
      buffer: new Float32Array(size),
      index: 0,
      filter: 0,
      feedback: lerp(reverbDelay, 0.28, 0.7),
      damp: lerp(reverbStrength, 0, 0.4),
    }));
    // Create 4 allpass filters
    const allpassStates = FREEVERB_ALLPASS_SIZES.map((size) => ({
      buffer: new Float32Array(size),
      index: 0,
    }));
    for (let i = startIndex; i < endIndex; i += 1) {
      const sample = soundBuffer[i] || 0;
      // Set Buffer
      soundBuffer[i] = reverb(sample, combAStates, combBStates, allpassStates);
      // Ramp values
      reverbStrength += reverbStrengthDelta;
      reverbDelay += reverbDelayDelta;
    }
  }
};
