import { EASE } from "../../core/constants/EASE";
import { interpolate } from "../../core/utils/interpolate";
import { adjustArrayWithEnvelope } from "./adjustArrayWithEnvelope";
import { adjustArrayWithVolumeBend } from "./adjustArrayWithVolumeBend";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { fillArrayWithOscillation } from "./fillArrayWithOscillation";
import { Waveform } from "./getWaveforms";

export const fillArrayWithWaveforms = (
  buffer: Float32Array,
  sampleRate: number,
  waveforms: readonly Waveform[]
): void => {
  // Apply Oscillator
  waveforms.forEach((waveform) => {
    const { waves } = waveform;

    waves.forEach((wave) => {
      const startIndex = wave.startIndex;
      const endIndex = wave.endIndex;

      const wavesMaxAmplitude = waves.reduce(
        (p, w) => ((w.amplitude || 1) > p ? w.amplitude || 1 : p),
        0
      );
      const waveVelocity = (wave.amplitude || 1) / wavesMaxAmplitude;

      // Add together harmonics (a.k.a. "additive synthesis")
      if (wave.harmonics) {
        const harmonicsTotalAmplitude = wave.harmonics.reduce(
          (p, h) => p + (h.amplitude || 1),
          0
        );
        wave.harmonics.forEach((harmonic) => {
          const type = harmonic.type;
          const hertz = convertNoteToHertz(harmonic.note) || 0;
          const pitchBend = harmonic.pitchBend;
          const pitchEase = harmonic.pitchEase;
          const harmonicVelocity =
            (harmonic.amplitude || 1) / harmonicsTotalAmplitude;

          fillArrayWithOscillation(
            buffer,
            startIndex,
            endIndex,
            sampleRate,
            hertz,
            pitchBend,
            pitchEase,
            waveVelocity * harmonicVelocity,
            type
          );
        });
      }

      const volumeBend = wave.volumeBend;
      const volumeEase = wave.volumeEase;
      adjustArrayWithVolumeBend(
        buffer,
        startIndex,
        endIndex,
        volumeBend,
        volumeEase
      );

      // (interpolate between sudden frequency changes to prevent crackles)
      const period = wave.period;
      const prevEndIndex = wave.prevEndIndex;
      const prevPeriod = wave.prevPeriod;
      const quarterPeriod = Math.floor(period * 0.25);
      const prevQuarterPeriod = Math.floor(prevPeriod * 0.25);
      const startEaseIndex = startIndex - prevQuarterPeriod;
      const endEaseIndex = startIndex + quarterPeriod;
      const startValue = buffer[startEaseIndex] || 0;
      const endValue = buffer[endEaseIndex] || 0;
      if (startIndex - prevEndIndex <= 1) {
        for (let i = startEaseIndex; i < endEaseIndex; i += 1) {
          const progress =
            (i - startEaseIndex) / (endEaseIndex - startEaseIndex);
          buffer[i] = interpolate(
            progress,
            startValue,
            endValue,
            EASE.quadInOut
          );
        }
      }
    });
  });

  // Apply Envelope
  waveforms.forEach((waveform) => {
    const {
      startIndex,
      endIndex,
      attackTime,
      attackEase,
      holdTime,
      decayTime,
      decayEase,
      releaseTime,
      releaseEase,
    } = waveform;
    const length = endIndex - startIndex;

    const attackLength = Math.min(length, Math.floor(attackTime * sampleRate));
    const holdLength = Math.min(length, Math.floor(holdTime * sampleRate));
    const decayLength = Math.min(length, Math.floor(decayTime * sampleRate));
    const releaseLength = Math.min(
      length,
      Math.floor(releaseTime * sampleRate)
    );

    const holdLevel = waveform.volume;
    const sustainLevel = waveform.volume * waveform.sustainLevel;

    adjustArrayWithEnvelope(
      buffer,
      startIndex,
      endIndex,
      attackLength,
      holdLength,
      decayLength,
      releaseLength,
      holdLevel,
      sustainLevel,
      attackEase,
      decayEase,
      releaseEase
    );
  });
};
