import { SAMPLE_RATE } from "../constants/SAMPLE_RATE";
import { EnvelopeOptions } from "../types/EnvelopeOptions";
import { OscillatorOptions } from "../types/OscillatorOptions";
import { getHertz } from "./getHertz";
import { oscillateArray } from "./oscillateArray";
import { rampArray } from "./rampArray";

export const fillArrayWithTones = (
  buffer: Float32Array,
  notes: {
    note?: string;
    time?: number;
    duration?: number;
    velocity?: number;
  }[],
  envelope?: EnvelopeOptions,
  oscillator?: OscillatorOptions
): void => {
  notes.forEach((tone) => {
    const note = tone.note || "";
    const offset = tone.time || 0;
    const duration = tone.duration || 0;
    const velocity = typeof tone.velocity === "number" ? tone.velocity : 1;
    const hertz = getHertz(note);
    const offsetSampleLength = Math.floor(offset * SAMPLE_RATE);
    const durationSampleLength = Math.floor(duration * SAMPLE_RATE);

    const oscillatorType = oscillator?.type || "sine";
    oscillateArray(
      buffer,
      oscillatorType,
      hertz,
      velocity,
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
