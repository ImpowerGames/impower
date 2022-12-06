import { Harmonic } from "../types/Harmonic";
import { Tone } from "../types/Tone";
import { Wave } from "../types/Wave";
import { isNote } from "./isNote";

const WAVES_REGEX =
  /([(<{[])([(<{[][^\n\r(<{[\]}>)]*[}]|[^\n\r(<{[\]}>)]*)([\]}>)])/g;

export const parseTone = (str: string): Tone | undefined => {
  if (!str) {
    return undefined;
  }

  const tone: Tone = {};

  const parts = str.split(" ");
  parts.forEach((part) => {
    const wave: Wave = { harmonics: [] };
    const matches = Array.from(part.matchAll(WAVES_REGEX) || []);
    matches.forEach((match) => {
      const harmonic: Harmonic = {};
      const openParen = match[1] || "";
      const inner = match[2] || "";
      const closeParen = match[3] || "";
      const sine = openParen.startsWith("(") && closeParen.endsWith(")");
      const triangle = openParen.startsWith("<") && closeParen.endsWith(">");
      const sawtooth = openParen.startsWith("{") && closeParen.endsWith("}");
      const square = openParen.startsWith("[") && closeParen.endsWith("]");
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
        harmonic.type = type;
      }
      const params = inner.split(",").map((p) => p.trim());
      params.forEach((param) => {
        if (isNote(param)) {
          harmonic.note = param;
        }
        if (!Number.isNaN(Number(param))) {
          harmonic.amplitude = Number(param);
        }
      });
      wave.harmonics.push(harmonic);
    });
    if (!tone.waves) {
      tone.waves = [];
    }
    tone.waves.push(wave);
  });

  return tone;
};
