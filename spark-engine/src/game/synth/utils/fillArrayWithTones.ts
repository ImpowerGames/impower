import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { createFrequencyBuffers } from "./createFrequencyBuffers";
import { easeInArray } from "./easeInArray";
import { easeOutArray } from "./easeOutArray";
import { fillArrayWithOscillation } from "./fillArrayWithOscillation";
import { getToneIndices } from "./getToneIndices";

export const fillArrayWithTones = (
  buffer: Float32Array,
  sampleRate: number,
  tones: Tone[]
): void => {
  // Zero out the buffer
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = 0;
  }

  const frequencyBuffers = createFrequencyBuffers(sampleRate, tones);

  tones.forEach((tone) => {
    const [startIndex, endIndex] = getToneIndices(tone, sampleRate);

    // Oscillators
    if (tone.waves) {
      tone.waves.forEach((wave, waveIndex) => {
        const velocity = typeof wave.velocity === "number" ? wave.velocity : 1;
        const type = wave.type || "sine";
        const note = wave.note || "";
        const hertz = convertNoteToHertz(note);
        // Fill with Oscillator
        fillArrayWithOscillation(
          buffer,
          startIndex,
          endIndex,
          sampleRate,
          frequencyBuffers[waveIndex] || hertz,
          velocity,
          type
        );
      });
    }

    // ASR Envelope
    // (ease in and out amplitude to prevent crackles)
    const attackCurve =
      tone.envelope?.attackCurve != null ? tone.envelope?.attackCurve : "sine";
    const attackTime =
      tone.envelope?.attackTime != null
        ? tone.envelope?.attackTime
        : (tone.duration || 0) * 0.5;
    const releaseCurve =
      tone.envelope?.releaseCurve != null
        ? tone.envelope?.releaseCurve
        : "sine";
    const releaseTime =
      tone.envelope?.releaseTime != null
        ? tone.envelope?.releaseTime
        : (tone.duration || 0) * 0.5;
    // Attack
    easeInArray(buffer, startIndex, sampleRate, attackCurve, attackTime);
    // Release
    easeOutArray(buffer, endIndex, sampleRate, releaseCurve, releaseTime);
  });
};
