import { Note } from "../types/Note";
import { Tone } from "../types/Tone";

const TONE_REGEX =
  /[(<{[]([(<{[][^\n\r(<{[\]}>)]*[}]|[^\n\r(<{[\]}>)]*)[\]}>)]/g;

export const parseTones = (str: string): Tone[] => {
  const tones: Tone[] = [];
  if (!str) {
    return tones;
  }
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
      tones.push({ note, type, velocity });
    }
    return match;
  };
  str.replace(TONE_REGEX, replacer);
  return tones;
};
