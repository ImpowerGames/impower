/*
 * Helpers for authoring `Random<T>` specs with non-uniform distributions
 * and probabilistic on/off choices. See `ChanceSpec`, `PowSpec`,
 * `PowRangeSpec` in `../types/Random.ts` for the spec tuple shapes.
 */

import {
  type ChanceSpec,
  type PowLerpSpec,
  type PowSpec,
} from "../types/Random";

export const RANDOM_LERP = "lerp" as const;

export const chanceOf = (value: boolean, percentage: number): ChanceSpec => {
  return [value, percentage];
};

export const powRange = (
  min: number,
  max: number,
  exponent: number,
): PowSpec => {
  return [min, max, exponent];
};

export const pow = (
  min: number,
  max: number,
  exponent: number,
): PowLerpSpec => {
  return [min, max, exponent, RANDOM_LERP];
};
