import type { Animation } from "../../../../spark-engine/src/game/modules/ui/types/Animation";

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i;

const FUNCTION = /\b(scale(?:3d|x|y|z)?)\(([^)]*)\)/gi;

const amount = (token: string): number | undefined => {
  const value = token.trim();
  if (!NUMBER.test(value)) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  const factor = value.endsWith("%") ? parsed / 100 : parsed;
  return Number.isFinite(factor) ? Math.abs(factor) : undefined;
};

const scalesIn = (name: string, value: unknown): number[] => {
  if (typeof value === "number") {
    return name === "scale" && Number.isFinite(value) ? [Math.abs(value)] : [];
  }
  if (typeof value !== "string") {
    return [];
  }
  if (name === "scale") {
    return value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .flatMap((token) => {
        const factor = amount(token);
        return factor === undefined ? [] : [factor];
      });
  }
  if (name === "transform") {
    const found: number[] = [];
    for (const match of value.matchAll(FUNCTION)) {
      const kind = match[1]!.toLowerCase();
      const args = kind === "scalez" ? [] : match[2]!.split(/[\s,]+/).filter(Boolean).slice(0, 2);
      for (const arg of args) {
        const factor = amount(arg);
        if (factor !== undefined) {
          found.push(factor);
        }
      }
    }
    return found;
  }
  return [];
};

export const keyframeScale = (animations: readonly (Animation | undefined)[] | undefined): number => {
  let largest = 1;
  for (const animation of animations ?? []) {
    for (const frame of animation?.keyframes ?? []) {
      if (!frame || typeof frame !== "object") {
        continue;
      }
      for (const [key, value] of Object.entries(frame as Record<string, unknown>)) {
        for (const factor of scalesIn(key.toLowerCase(), value)) {
          largest = Math.max(largest, factor);
        }
      }
    }
  }
  return largest;
};
