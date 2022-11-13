import { Tone } from "../types/Tone";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { easeInOutArray } from "./easeInOutArray";
import { fillArrayWithOscillation } from "./fillArrayWithOscillation";

export const fillArrayWithTones = (
  buffer: Float32Array,
  sampleRate: number,
  tones: Tone[]
): void => {
  // Zero out the buffer
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = 0;
  }

  tones.forEach((tone) => {
    const note = tone.note || "";
    const time = tone.time || 0;
    const duration = tone.duration || 0;
    const velocity = typeof tone.velocity === "number" ? tone.velocity : 1;
    const timeInSamples = Math.floor(time * sampleRate);
    const durationInSamples = Math.floor(duration * sampleRate);
    const startIndex = timeInSamples;
    const endIndex = timeInSamples + durationInSamples;
    const type = tone.type || "sine";
    const hertz = convertNoteToHertz(note);

    // Fill with Oscillator
    fillArrayWithOscillation(
      buffer,
      startIndex,
      endIndex,
      sampleRate,
      hertz,
      velocity,
      type
    );

    // Ease in and out to prevent crackles
    easeInOutArray(
      buffer,
      startIndex,
      endIndex,
      sampleRate,
      "cosine",
      duration * 0.5
    );
  });
};
