import { Note } from "../types/Note";
import { Tone } from "../types/Tone";

const TONE_REGEX =
  /[(<{[]([(<{[][^\n\r(<{[\]}>)]*[}]|[^\n\r(<{[\]}>)]*)[\]}>)]/g;

export const parseTone = (str: string): Tone | undefined => {
  if (!str) {
    return undefined;
  }
  const tone: Tone = {};
  const replacer = (match: string, inner: string): string => {
    const sine = match.startsWith("(") && match.endsWith(")");
    const triangle = match.startsWith("<") && match.endsWith(">");
    const sawtooth = match.startsWith("{") && match.endsWith("}");
    const square = match.startsWith("[") && match.endsWith("]");
    const type = sine
      ? "sine"
      : triangle
      ? "triangle"
      : sawtooth
      ? "sawtooth"
      : square
      ? "square"
      : "";
    if (type) {
      const [noteString, velocityString] = inner.split("*");
      const note = noteString as Note;
      const velocity =
        velocityString && !Number.isNaN(velocityString)
          ? Number(velocityString)
          : 1;
      if (!tone.waves) {
        tone.waves = [];
      }
      tone.waves.push({ note, type, velocity });
    }
    return match;
  };
  str.replace(TONE_REGEX, replacer);
  return tone;
};
