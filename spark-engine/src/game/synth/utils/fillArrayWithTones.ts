import { SAMPLE_RATE } from "../constants/SAMPLE_RATE";
import { EnvelopeOptions } from "../types/EnvelopeOptions";
import { fadeArray } from "./fadeArray";
import { getHertz } from "./getHertz";

export const fillArrayWithTones = (
  buffer: Float32Array,
  tones: {
    pitch?: string;
    offset?: number;
    duration?: number;
  }[],
  envelope?: EnvelopeOptions
): void => {
  const amplitude = 1;

  tones.forEach((tone) => {
    const pitch = tone.pitch || "";
    const offset = tone.offset || 0;
    const duration = tone.duration || 0;
    const hertz = getHertz(pitch);
    const offsetSampleLength = Math.floor(offset * SAMPLE_RATE);
    const durationSampleLength = Math.floor(duration * SAMPLE_RATE);
    const toneSampleLength = offsetSampleLength + durationSampleLength;

    for (let i = offsetSampleLength; i < toneSampleLength; i += 1) {
      const time = i / SAMPLE_RATE;
      const angle = hertz * time * Math.PI;

      buffer[i] = Math.sin(angle) * amplitude;
    }

    const attackType = envelope?.attackCurve || "cosine";
    const attackLength = durationSampleLength * (envelope?.attack || 0.5);
    const releaseType = envelope?.releaseCurve || "cosine";
    const releaseLength = durationSampleLength * (envelope?.release || 0.5);
    fadeArray(
      buffer,
      attackType,
      attackLength,
      "in",
      offsetSampleLength,
      durationSampleLength
    );
    fadeArray(
      buffer,
      releaseType,
      releaseLength,
      "out",
      offsetSampleLength,
      durationSampleLength
    );
  });
};
