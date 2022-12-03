import { EASE, interpolate } from "../../core";
import { Tone } from "../types/Tone";
import { easeInArray } from "./easeInArray";
import { easeOutArray } from "./easeOutArray";
import { fillArrayWithOscillation } from "./fillArrayWithOscillation";
import { getTimedTones, TimedTone } from "./getTimedTones";

export const fillArrayWithTones = (
  buffer: Float32Array,
  sampleRate: number,
  tones: readonly Tone[]
): TimedTone[] => {
  // Zero out the buffer
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = 0;
  }

  const timedTones = getTimedTones(tones, sampleRate);

  timedTones.forEach((tone, toneIndex) => {
    const { startIndex, endIndex, period } = tone;

    const quarterPeriod = Math.floor(period * 0.25);

    const prev = timedTones[toneIndex - 1];
    const prevPeriod = prev?.period || 0;
    const prevEndIndex = prev?.endIndex || 0;
    const prevQuarterPeriod = Math.floor(prevPeriod * 0.25);

    if (tone.waves) {
      tone.waves.forEach((wave) => {
        const type = wave.type;
        const hertz = wave.hertz || 0;
        const pitchBend = wave.pitchBend;
        const pitchEase = wave.pitchEase;
        const volumeBend = wave.volumeBend;
        const volumeEase = wave.volumeEase;
        const velocity = wave.velocity;

        // Oscillator
        fillArrayWithOscillation(
          buffer,
          startIndex,
          endIndex,
          sampleRate,
          hertz,
          pitchBend,
          pitchEase,
          volumeBend,
          volumeEase,
          velocity,
          type
        );
      });
    }

    // (interpolate quick frequency changes to prevent crackles)
    const startEaseIndex = startIndex - prevQuarterPeriod;
    const endEaseIndex = startIndex + quarterPeriod;
    const startValue = buffer[startEaseIndex] || 0;
    const endValue = buffer[endEaseIndex] || 0;
    if (startIndex - prevEndIndex <= 1) {
      for (let i = startEaseIndex; i < endEaseIndex; i += 1) {
        const progress = (i - startEaseIndex) / (endEaseIndex - startEaseIndex);
        buffer[i] = interpolate(progress, startValue, endValue, EASE.quadInOut);
      }
    }
  });

  timedTones.forEach((tone) => {
    const { startIndex, endIndex } = tone;
    const length = endIndex - startIndex;
    const firstWave = tone.waves?.[0];
    const lastWave = tone.waves?.[tone.waves?.length - 1];
    // Envelope
    const attackCurve = firstWave?.attackCurve;
    const attackTime = firstWave?.attackTime || 0;
    const releaseCurve = lastWave?.releaseCurve;
    const releaseTime = lastWave?.releaseTime || 0;
    const attackLength = Math.min(length, Math.floor(attackTime * sampleRate));
    const releaseLength = Math.min(
      length,
      Math.floor(releaseTime * sampleRate)
    );
    if (attackTime > 0) {
      // Attack
      easeInArray(buffer, startIndex, attackCurve, attackLength);
    }
    if (releaseTime > 0) {
      // Release
      easeOutArray(buffer, endIndex, releaseCurve, releaseLength);
    }
  });

  return timedTones;
};
