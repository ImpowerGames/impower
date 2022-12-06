import { EaseType } from "../../core/types/EaseType";
import { Harmonic } from "../types/Harmonic";
import { Tone } from "../types/Tone";
import { Wave } from "../types/Wave";
import { convertNoteToHertz } from "./convertNoteToHertz";

export interface TimedWave extends Wave {
  startIndex: number;
  endIndex: number;
  period: number;
  prevEndIndex: number;
  prevPeriod: number;
}

export interface Waveform {
  startIndex: number;
  endIndex: number;
  startPeriod: number;
  endPeriod: number;

  waves: TimedWave[];

  volume: number;
  attackTime: number;
  holdTime: number;
  decayTime: number;
  releaseTime: number;
  attackEase: EaseType;
  decayEase: EaseType;
  releaseEase: EaseType;
  sustainLevel: number;
}

export const getFundamentalFrequency = (harmonics: Harmonic[]): number => {
  let lowestFrequency = Number.MAX_SAFE_INTEGER;
  harmonics.forEach((h) => {
    const f = convertNoteToHertz(h.note);
    if (f < lowestFrequency) {
      lowestFrequency = f;
    }
  });
  return lowestFrequency;
};

export const getFirstFrequency = (harmonics: Harmonic[]): number => {
  return convertNoteToHertz(harmonics?.[0]?.note);
};

export const getWaveTiming = (
  frequency: number,
  exactStartIndex: number,
  exactEndIndex: number,
  sampleRate: number
): {
  startIndex: number;
  endIndex: number;
  period: number;
} => {
  const period = sampleRate / frequency;
  const i = exactEndIndex;
  const localIndex = i - exactStartIndex;
  const endPhase = (localIndex % period) / period;
  const padding = Math.floor(period * (1 - endPhase));
  return {
    startIndex: exactStartIndex,
    endIndex: exactEndIndex + padding,
    period,
  };
};

export const getWaveforms = (
  tones: readonly Tone[],
  sampleRate: number
): Waveform[] => {
  const waveforms: Waveform[] = [];
  const allTimedWaves: TimedWave[] = [];

  for (let i = 0; i < tones.length; i += 1) {
    const tone = tones[i];
    if (tone) {
      const toneTime = tone.time || 0;
      const toneDuration = tone.duration || 0;
      const waves = tone.waves || [];
      const waveDuration = toneDuration / waves.length;
      const timedWaves: TimedWave[] = [];
      waves.forEach((wave, i) => {
        const prevTiming = allTimedWaves[allTimedWaves.length - 1];
        const prevEndIndex = prevTiming?.endIndex || 0;
        const prevPeriod = prevTiming?.period || 0;
        const duration = waveDuration;
        const time = toneTime + i * waveDuration;
        const exactStartIndex = Math.floor(time * sampleRate);
        const exactEndIndex = Math.floor((time + duration) * sampleRate);
        const harmonics = wave.harmonics || [];
        const amplitude = harmonics.reduce((p, h) => p + (h.amplitude || 1), 0);
        const { startIndex, endIndex, period } = getWaveTiming(
          getFirstFrequency(harmonics),
          prevEndIndex > exactStartIndex ? prevEndIndex : exactStartIndex,
          exactEndIndex,
          sampleRate
        );
        const timedWave = {
          ...wave,
          amplitude,
          startIndex,
          endIndex,
          period,
          prevEndIndex,
          prevPeriod,
        };
        timedWaves.push(timedWave);
        allTimedWaves.push(timedWave);
      });
      const firstWave = timedWaves?.[0];
      const lastWave = timedWaves?.[timedWaves.length - 1];
      waveforms.push({
        waves: timedWaves,
        startIndex: firstWave?.startIndex || 0,
        endIndex: lastWave?.endIndex || 0,
        startPeriod: firstWave?.period || 0,
        endPeriod: lastWave?.period || 0,
        volume: tone.volume || 1,
        attackTime: tone.attackTime || 0,
        holdTime: tone.holdTime || 0,
        decayTime: tone.decayTime || 0,
        releaseTime: tone.releaseTime || 0,
        attackEase: tone.attackEase || "linear",
        decayEase: tone.decayEase || "linear",
        releaseEase: tone.releaseEase || "linear",
        sustainLevel: tone.sustainLevel || 1,
      });
    }
  }
  return waveforms;
};
