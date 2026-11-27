import type { Animation } from "../types/Animation";

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

const largest = (tokens: string[]): number => {
  const factors = tokens.flatMap((token) => {
    const factor = amount(token);
    return factor === undefined ? [] : [factor];
  });
  return factors.length ? Math.max(...factors) : 1;
};

const scaleProperty = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.abs(value) : 1;
  }
  return typeof value === "string" ? largest(value.trim().split(/\s+/).slice(0, 2)) : 1;
};

const transformProperty = (value: unknown): number => {
  if (typeof value !== "string") {
    return 1;
  }
  let product = 1;
  for (const match of value.matchAll(FUNCTION)) {
    const kind = match[1]!.toLowerCase();
    if (kind !== "scalez") {
      product *= largest(match[2]!.split(/[\s,]+/).filter(Boolean).slice(0, 2));
    }
  }
  return product;
};

export const keyframeScale = (animations: readonly (Animation | undefined)[] | undefined): number => {
  let reach = 1;
  for (const animation of animations ?? []) {
    for (const frame of animation?.keyframes ?? []) {
      if (!frame || typeof frame !== "object") {
        continue;
      }
      let scale = 1;
      for (const [key, value] of Object.entries(frame as Record<string, unknown>)) {
        const name = key.toLowerCase();
        if (name === "scale") {
          scale *= scaleProperty(value);
        } else if (name === "transform") {
          scale *= transformProperty(value);
        }
      }
      reach = Math.max(reach, scale);
    }
  }
  return reach;
};
