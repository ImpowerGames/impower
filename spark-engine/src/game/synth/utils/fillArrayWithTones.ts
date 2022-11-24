import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { createFrequencyBuffers } from "./createFrequencyBuffers";
import { easeInOutArray } from "./easeInOutArray";
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

    // Ease in and out to prevent crackles
    easeInOutArray(
      buffer,
      startIndex,
      endIndex,
      sampleRate,
      tone.velocityCurve || "circ",
      (tone.duration || 0) * 0.5
    );
  });
};
