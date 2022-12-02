import { getClockValueMS, isClockValue } from "../../core";
import { isCurve } from "../../core/utils/isCurve";
import { Tone, Wave } from "../types/Tone";
import { isNote } from "./isNote";

const TONE_REGEX = /^(?:([^|(<{[]+)[|])?([^|]+)(?:[|]([^\]}>)|]+))?$/;

const WAVES_REGEX =
  /([ ]*)([(<{[])([(<{[][^\n\r(<{[\]}>)]*[}]|[^\n\r(<{[\]}>)]*)([\]}>)])/g;

export const parseTone = (str: string): Tone | undefined => {
  if (!str) {
    return undefined;
  }

  const tone: Tone = { waves: [] };

  const envelopeMatch = str.match(TONE_REGEX);
  if (envelopeMatch) {
    const attack = (envelopeMatch[1] || "").trim();
    const content = (envelopeMatch[2] || "").trim();
    const release = (envelopeMatch[3] || "").trim();

    const matches = Array.from(content.matchAll(WAVES_REGEX) || []);
    matches.forEach((match, i) => {
      const wave: Wave = {};
      const space = match[1] || "";
      const openParen = match[2] || "";
      const inner = match[3] || "";
      const closeParen = match[4] || "";
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
      if (i !== 0) {
        wave.attackTime = 0;
      }
      if (i !== matches.length - 1) {
        wave.releaseTime = 0;
      }
      wave.merge = space ? "append" : "add";
      if (type) {
        wave.type = type;
      }
      const params = inner.split(",").map((p) => p.trim());
      params.forEach((param) => {
        if (isNote(param)) {
          wave.note = param;
        }
        if (!Number.isNaN(Number(param))) {
          wave.amplitude = Number(param);
        }
      });
      tone.waves?.push(wave);
    });

    if (tone.waves) {
      if (attack) {
        const firstWave = tone.waves[0];
        if (firstWave) {
          const attackParams = attack.split(" ").map((x) => x.trim());
          attackParams.forEach((param) => {
            if (isClockValue(param)) {
              firstWave.attackTime = getClockValueMS(param) / 1000;
            }
            if (isCurve(param)) {
              firstWave.attackCurve = param;
            }
          });
        }
      }
      if (release) {
        const lastWave = tone.waves[tone.waves.length - 1];
        if (lastWave) {
          const releaseParams = release.split(" ").map((x) => x.trim());
          releaseParams.forEach((param) => {
            if (isClockValue(param)) {
              lastWave.releaseTime = getClockValueMS(param) / 1000;
            }
            if (isCurve(param)) {
              lastWave.releaseCurve = param;
            }
          });
        }
      }
    }
  }
  return tone;
};
