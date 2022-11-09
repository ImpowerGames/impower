import { SAMPLE_RATE } from "../constants/SAMPLE_RATE";
import { EnvelopeOptions } from "../types/EnvelopeOptions";
import { OscillatorOptions } from "../types/OscillatorOptions";
import { getHertz } from "./getHertz";
import { oscillateArray } from "./oscillateArray";
import { rampArray } from "./rampArray";

export const fillArrayWithTones = (
  buffer: Float32Array,
  tones: {
    pitch?: string;
    offset?: number;
    duration?: number;
  }[],
  envelope?: EnvelopeOptions,
  oscillator?: OscillatorOptions
): void => {
  tones.forEach((tone) => {
    const pitch = tone.pitch || "";
    const offset = tone.offset || 0;
    const duration = tone.duration || 0;
    const hertz = getHertz(pitch);
    const offsetSampleLength = Math.floor(offset * SAMPLE_RATE);
    const durationSampleLength = Math.floor(duration * SAMPLE_RATE);

    const oscillatorType = oscillator?.type || "sine";
    oscillateArray(
      buffer,
      oscillatorType,
      hertz,
      offsetSampleLength,
      durationSampleLength
    );

    const attack = typeof envelope?.attack === "number" ? envelope?.attack : 1;
    const release =
      typeof envelope?.release === "number" ? envelope?.release : 1;
    const total = attack + release;
    const attackFlex = attack / total;
    const releaseFlex = release / total;

    const attackType = envelope?.attackCurve || "cosine";
    const attackLength = durationSampleLength * attackFlex;
    const releaseType = envelope?.releaseCurve || "cosine";
    const releaseLength = durationSampleLength * releaseFlex;
    rampArray(
      buffer,
      attackType,
      attackLength,
      "in",
      offsetSampleLength,
      durationSampleLength
    );
    rampArray(
      buffer,
      releaseType,
      releaseLength,
      "out",
      offsetSampleLength,
      durationSampleLength
    );
  });
};
