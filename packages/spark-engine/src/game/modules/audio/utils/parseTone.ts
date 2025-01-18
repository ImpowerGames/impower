import { Tone } from "../types/Tone";

const PARAM_REGEX = /([a-z])/;

export const parseTone = (str: string): Tone => {
  const tone: Tone = {};
  const tokens = str.split(PARAM_REGEX);
  const firstArg = tokens[0];
  if (!Number.isNaN(Number(firstArg))) {
    tone.duration = Number(firstArg);
  }
  tokens.forEach((param, index) => {
    if (PARAM_REGEX.test(param)) {
      const value = tokens[index + 1];
      if (param === "t") {
        tone.time = Number(value);
      }
      if (param === "d") {
        tone.duration = Number(value);
      }
      if (param === "s") {
        tone.speed = Number(value);
      }
      if (param === "v") {
        tone.velocity = Number(value);
      }
      if (param === "p") {
        tone.pitch = value as any;
      }
      if (param === "b") {
        tone.bend = Number(value);
      }
      if (param === "i") {
        tone.instrument = Number(value);
      }
      if (param === "n") {
        tone.note = Number(value);
      }
      if (param === "m") {
        tone.mono = true;
      }
    }
  });
  return tone;
};
