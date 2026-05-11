import { type Random } from "../types/Random";
import { type Schema } from "../types/Schema";
import { clampedRandom } from "./clampedRandom";
import { cull } from "./cull";
import { getAllProperties } from "./getAllProperties";
import { getProperty } from "./getProperty";
import { pick } from "./pick";
import { RANDOM_LERP } from "./randomSpec";
import { setProperty } from "./setProperty";

const roundForSchema = <T>(
  value: number,
  validation: Schema<T>,
  key: string,
  rangeMin: number,
  rangeMax: number,
): number => {
  const valid = getProperty(validation, key);
  if (Array.isArray(valid)) {
    const step = valid[0];
    const fractionDigits = step.toString().split(".")?.[1]?.length || 0;
    return Number(value.toFixed(fractionDigits));
  }
  const distance = Math.abs(rangeMax - rangeMin);
  const fractionDigits =
    distance <= 2 ? 2 : rangeMin.toString().split(".")?.[1]?.length || 0;
  return Number(value.toFixed(fractionDigits));
};

export const randomizeProperties = <T>(
  obj: T,
  validation: Schema<T>,
  randomization: Random<T>,
  cullProp?: string,
  rng?: () => number,
): void => {
  const r = rng || Math.random;
  const randomizerProps = getAllProperties(randomization);

  Object.entries(randomizerProps).forEach(([k, v]) => {
    if (!Array.isArray(v)) {
      return;
    }
    const first = v[0];
    const second = v[1];

    // [boolean, percentage]
    if (
      v.length === 2 &&
      typeof first === "boolean" &&
      typeof second === "number"
    ) {
      setProperty(obj, k, r() < second ? first : !first);
      return;
    }

    // pow (lerp) — [min, max, exponent, "lerp"]
    if (
      v.length === 4 &&
      v[3] === RANDOM_LERP &&
      typeof first === "number" &&
      typeof second === "number" &&
      typeof v[2] === "number"
    ) {
      const [min, max, exponent] = v as PowOrRangeTuple;
      const u = Math.pow(r(), exponent);
      const value = min + u * (max - min);
      setProperty(obj, k, roundForSchema(value, validation, k, min, max));
      return;
    }

    // powRange — [min, max, exponent]
    if (
      v.length === 3 &&
      typeof first === "number" &&
      typeof second === "number" &&
      typeof v[2] === "number"
    ) {
      const [min, max, exponent] = v as PowOrRangeTuple;
      const sampled = min + r() * (max - min);
      const value = Math.pow(sampled, exponent);
      setProperty(obj, k, roundForSchema(value, validation, k, min, max));
      return;
    }

    if (typeof first === "number") {
      // Uniform range — [min, max]
      const value = clampedRandom(first, second, rng);
      setProperty(obj, k, roundForSchema(value, validation, k, first, second));
      return;
    }

    // Otherwise pick uniformly from the array
    setProperty(obj, k, pick(v, rng));
  });

  if (cullProp) {
    cull(obj, cullProp);
  }
};

type PowOrRangeTuple = [number, number, number, ...unknown[]];
