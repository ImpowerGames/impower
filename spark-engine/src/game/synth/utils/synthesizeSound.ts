import { randomizer, shuffle } from "../../../../../spark-evaluate";
import { clone, lerp, unlerp } from "../../core";
import { OSCILLATORS, OscillatorState } from "../constants/OSCILLATORS";
import { SOUND_VALIDATION } from "../constants/SOUND_VALIDATION";
import { Hertz } from "../types/Hertz";
import { OscillatorType } from "../types/OscillatorType";
import { Sound, SoundConfig } from "../types/Sound";
import { convertSemitonesToFrequencyFactor } from "./convertSemitonesToFrequencyFactor";

const roundToNearestMultiple = (n: number, period: number): number => {
  return Math.ceil(n / period) * period;
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
    direction === "up" ||
    (direction === "down-up" && !isEvenCycle) ||
    (direction === "up-down" && isEvenCycle);
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
  numNotesPlayed: number,
  seed: string
): T | undefined => {
  const cycleIndex = getCycleIndex(numNotesPlayed, choices.length);
  const cycleSeed =
    direction === "random" ? (seed || "") + cycleIndex : undefined;
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
  percentage: number,
  validation: [number] | [number, number[], boolean[]],
  sampleRate: number
): number => {
  const [, range] = validation;
  const minAmountPerSecond = range?.[0] || 0;
  const maxAmountPerSecond = range?.[1] || 0;
  if (percentage <= 0) {
    return 0;
  }
  const thingsPerSecond = lerp(
    percentage,
    minAmountPerSecond,
    maxAmountPerSecond
  );
  const secondsPerThing = 1 / thingsPerSecond;
  const samplesPerThing = sampleRate * secondsPerThing;
  const thingsPerSample = 1 / samplesPerThing;
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
  pitchBuffer?: Float32Array
): { minPitch: number; maxPitch: number } => {
  const sound_seed = sound.seed;
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
  const vibrato_shape = sound.vibrato.shape;
  const vibrato_on = sound.vibrato.on;
  const vibrato_strength = sound.vibrato.strength;
  const vibrato_rate = sound.vibrato.rate;
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
  const arpeggio_semitones = sound.arpeggio.semitones;
  const arpeggio_shapes = arpeggio_semitones.map(
    (_, i) => sound.arpeggio.shapes[i] || sound_wave
  );
  const arpeggio_semitones_reversed = [...arpeggio_semitones].reverse();
  const arpeggio_shapes_reversed = [...arpeggio_shapes].reverse();
  const arpeggio_direction = sound.arpeggio.direction;

  let freqPitchDelta = getDeltaPerSample(
    sound.frequency.ramp,
    SOUND_VALIDATION.frequency.ramp,
    sampleRate
  );
  let freqPitchAccelerationDelta = getDeltaPerSample(
    sound.frequency.accel,
    SOUND_VALIDATION.frequency.accel,
    sampleRate
  );
  const freqPitchJerkDelta = getDeltaPerSample(
    sound.frequency.jerk,
    SOUND_VALIDATION.frequency.jerk,
    sampleRate
  );
  const ampVolumeDelta = getDeltaPerSample(
    sound.amplitude.ramp,
    SOUND_VALIDATION.amplitude.ramp,
    sampleRate
  );
  const lowpassCutoffDelta = getDeltaPerSample(
    sound.lowpass.cutoffRamp,
    SOUND_VALIDATION.lowpass.cutoffRamp,
    sampleRate
  );
  const highpassCutoffDelta = getDeltaPerSample(
    sound.highpass.cutoffRamp,
    SOUND_VALIDATION.highpass.cutoffRamp,
    sampleRate
  );
  const vibratoRateDelta = getDeltaPerSample(
    sound.vibrato.rateRamp,
    SOUND_VALIDATION.vibrato.rateRamp,
    sampleRate
  );
  const vibratoStrengthDelta = getDeltaPerSample(
    sound.vibrato.strengthRamp,
    SOUND_VALIDATION.vibrato.strengthRamp,
    sampleRate
  );
  const tremoloRateDelta = getDeltaPerSample(
    sound.tremolo.rateRamp,
    SOUND_VALIDATION.tremolo.rateRamp,
    sampleRate
  );
  const tremoloStrengthDelta = getDeltaPerSample(
    sound.tremolo.strengthRamp,
    SOUND_VALIDATION.tremolo.strengthRamp,
    sampleRate
  );
  const wahwahRateDelta = getDeltaPerSample(
    sound.wahwah.rateRamp,
    SOUND_VALIDATION.wahwah.rateRamp,
    sampleRate
  );
  const wahwahStrengthDelta = getDeltaPerSample(
    sound.wahwah.strengthRamp,
    SOUND_VALIDATION.wahwah.strengthRamp,
    sampleRate
  );
  const ringRateDelta = getDeltaPerSample(
    sound.ring.rateRamp,
    SOUND_VALIDATION.ring.rateRamp,
    sampleRate
  );
  const ringStrengthDelta = getDeltaPerSample(
    sound.ring.strengthRamp,
    SOUND_VALIDATION.ring.strengthRamp,
    sampleRate
  );
  const arpeggioRateDelta = getDeltaPerSample(
    sound.arpeggio.rateRamp,
    SOUND_VALIDATION.arpeggio.rateRamp,
    sampleRate
  );

  const rng = randomizer(sound_seed);
  const oscState: OscillatorState = {
    interpolate: true,
    rng,
  };
  const vibratoState: OscillatorState = {
    interpolate: true,
    rng,
  };
  const tremoloState: OscillatorState = {
    interpolate: true,
    rng,
  };
  const ringState: OscillatorState = {
    interpolate: true,
    rng,
  };
  const wahwahState: OscillatorState = {
    interpolate: true,
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
  let tremoloRate = tremolo_rate;
  let tremoloStrength = tremolo_strength;
  let wahwahRate = wahwah_rate;
  let wahwahStrength = wahwah_strength;
  let ringRate = ring_rate;
  let ringStrength = ring_strength;
  let arpeggioRate = arpeggio_rate;
  let arpLengthPlayed = 0;
  let arpNumNotesPlayed = 0;
  const lowpassInput: [number, number] = [0, 0];
  const lowpassOutput: [number, number, number] = [0, 0, 0];
  const highpassInput: [number, number] = [0, 0];
  const highpassOutput: [number, number, number] = [0, 0, 0];

  // Fill buffer
  for (let i = startIndex; i < endIndex; i += 1) {
    const localIndex = i - startIndex;

    let samplePitch = freqPitch;
    let sampleShape = sound_wave;
    let sampleResonance = lowpass_resonance;

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
          arpNumNotesPlayed,
          sound_seed
        ) || sound_wave;
      const arpNoteSemitones =
        choose(
          arpeggio_semitones,
          arpeggio_semitones_reversed,
          arpeggio_direction,
          arpNumNotesPlayed,
          sound_seed
        ) || 0;
      const arpSemitones = arpOctaveSemitones + arpNoteSemitones;
      const secondsPerNote = 1 / arpeggioRate;
      const samplesPerNote = sampleRate * secondsPerNote;
      const periodLength = sampleRate / samplePitch;
      // Ensure frequency changes only occur at zero crossings (to prevent crackles)
      const arpLimit = roundToNearestMultiple(samplesPerNote, periodLength);
      arpLengthPlayed += 1;
      if (arpLengthPlayed >= arpLimit) {
        arpLengthPlayed = 0;
        arpNumNotesPlayed += 1;
        samplePitch *= convertSemitonesToFrequencyFactor(arpSemitones);
      }
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
    const angle = (localIndex / sampleRate) * samplePitch;
    const oscillator = OSCILLATORS[sampleShape];
    let sampleValue = oscillator(angle, oscState);

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
    ampVolume += ampVolumeDelta;
    freqPitchAccelerationDelta += freqPitchJerkDelta;
    freqPitchDelta += freqPitchAccelerationDelta;
    freqPitch += freqPitchDelta;
    lowpassCutoff += lowpassCutoffDelta;
    highpassCutoff += highpassCutoffDelta;
    vibratoStrength += vibratoStrengthDelta;
    vibratoRate += vibratoRateDelta;
    tremoloStrength += tremoloStrengthDelta;
    tremoloRate += tremoloRateDelta;
    wahwahStrength += wahwahStrengthDelta;
    wahwahRate += wahwahRateDelta;
    ringStrength += ringStrengthDelta;
    ringRate += ringRateDelta;
    arpeggioRate += arpeggioRateDelta;
  }

  return { minPitch, maxPitch };
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
  volume?: number,
  pitch?: Hertz
): {
  minPitch: number;
  maxPitch: number;
} => {
  const sound: Sound = clone(config, SOUND_VALIDATION);

  // TODO: Harmony Effect
  // const harmony_count = sound.harmony.count;
  // const harmony_strength = sound.harmony.strength;
  // const harmony_delay = sound.harmony.delay;
  // const harmonyStrengthDelta = getSampleDelta(
  //   sound.harmony.strengthRamp,
  //   SOUND_VALIDATION.harmony.strengthRamp,
  //   sampleRate
  // );
  // const harmonyDelayDelta = getSampleDelta(
  //   sound.harmony.delayRamp,
  //   SOUND_VALIDATION.harmony.delayRamp,
  //   sampleRate
  // );
  // let harmonyStrength = harmony_strength;
  // let harmonyDelay = harmony_delay;

  // TODO: Reverb Effect
  // const reverb_strength = sound.reverb.strength;
  // const reverb_delay = sound.reverb.delay;
  // const reverbStrengthDelta = getSampleDelta(
  //   sound.reverb.strengthRamp,
  //   SOUND_VALIDATION.reverb.strengthRamp,
  //   sampleRate
  // );
  // const reverbDelayDelta = getSampleDelta(
  //   sound.reverb.delayRamp,
  //   SOUND_VALIDATION.reverb.delayRamp,
  //   sampleRate
  // );
  // let reverbStrength = reverb_strength;
  // let reverbDelay = reverb_delay;

  if (volume != null) {
    sound.amplitude.volume = volume;
  }
  if (pitch) {
    sound.frequency.pitch = pitch;
  }

  return fillBuffer(
    sound,
    sustainSound,
    limitSound,
    sampleRate,
    startIndex,
    endIndex,
    soundBuffer,
    pitchBuffer
  );
};
