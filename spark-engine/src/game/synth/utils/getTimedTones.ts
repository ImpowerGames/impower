import { CurveType } from "../../core/types/CurveType";
import { EaseType } from "../../core/types/EaseType";
import { OscillatorType } from "../types/OscillatorType";
import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";

export interface TimedWave {
  hertz: number;
  type: OscillatorType;
  pitchBend: number;
  pitchEase?: EaseType;
  volumeBend: number;
  volumeEase?: EaseType;
  velocity: number;
  attackCurve?: CurveType;
  releaseCurve?: CurveType;
  attackTime: number;
  releaseTime: number;
}

export interface TimedTone {
  waves: TimedWave[];
  startIndex: number;
  endIndex: number;
  padding: number;
  period: number;
}

export const getTimedTone = (
  waves: TimedWave[],
  exactStartIndex: number,
  exactEndIndex: number,
  sampleRate: number
): Omit<TimedTone, "waves"> => {
  const frequency = waves?.[0]?.hertz || 1;
  const period = sampleRate / frequency;
  const i = exactEndIndex;
  const localIndex = i - exactStartIndex;
  const endPhase = (localIndex % period) / period;
  const padding = Math.floor(period * (1 - endPhase));
  return {
    startIndex: exactStartIndex,
    endIndex: exactEndIndex + padding,
    padding,
    period,
  };
};

export const getTimedTones = (
  tones: readonly Tone[],
  sampleRate: number
): TimedTone[] => {
  const timings: TimedTone[] = [];
  const flattenedTones: {
    time: number;
    duration: number;
    waves: TimedWave[];
  }[] = [];
  tones.forEach((tone) => {
    if (tone.waves) {
      const totalWaveDuration = tone.duration || 0;
      const appendedWaves = tone.waves.filter(
        (w, i) => i === 0 || w.merge === "append"
      );
      const totalWaveAmplitude = appendedWaves.reduce(
        (p, w) => p + (w.amplitude || 1),
        0
      );
      const waveDuration = totalWaveDuration / appendedWaves.length;
      let time = tone.time || 0;
      tone.waves.forEach((wave, i) => {
        const velocity = (wave.amplitude || 1) / (totalWaveAmplitude || 1);
        const duration = waveDuration;
        const timedWave: TimedWave = {
          type: wave.type || "sine",
          hertz: convertNoteToHertz(wave.note),
          pitchBend: wave.pitchBend || 0,
          pitchEase: wave.pitchEase,
          volumeBend: wave.volumeBend || 1,
          volumeEase: wave.volumeEase,
          attackCurve: wave.attackCurve,
          releaseCurve: wave.releaseCurve,
          attackTime: wave.attackTime || 0,
          releaseTime: wave.releaseTime || 0,
          velocity,
        };
        const lastTone = flattenedTones[flattenedTones.length - 1];
        if (i !== 0 && wave.merge === "add" && lastTone) {
          if (!lastTone.waves) {
            lastTone.waves = [];
          }
          lastTone.waves.push(timedWave);
        } else {
          flattenedTones.push({
            time,
            duration,
            waves: [timedWave],
          });
          time += waveDuration;
        }
      });
    }
  });

  for (let i = 0; i < flattenedTones.length; i += 1) {
    const prevTiming = timings[i - 1];
    const prevPadding = prevTiming?.padding || 0;
    const tone = flattenedTones[i];
    if (tone) {
      const time = tone.time || 0;
      const duration = tone.duration || 0;
      const exactStartIndex = Math.floor(time * sampleRate) + prevPadding;
      const exactEndIndex = Math.floor((time + duration) * sampleRate);
      const waves = tone.waves || [];
      const { startIndex, endIndex, padding, period } = getTimedTone(
        waves,
        exactStartIndex,
        exactEndIndex,
        sampleRate
      );
      timings[i] = {
        waves,
        startIndex,
        endIndex,
        padding,
        period,
      };
    }
  }
  return timings;
};
