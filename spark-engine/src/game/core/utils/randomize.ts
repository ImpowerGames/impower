import { RecursiveRandomization } from "../types/RecursiveRandomization";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { clampedRandom } from "./clampedRandom";
import { cull } from "./cull";
import { getAllProperties } from "./getAllProperties";
import { getProperty } from "./getProperty";
import { pick } from "./pick";
import { setProperty } from "./setProperty";

export const randomize = <T>(
  obj: T,
  validation: RecursiveValidation<T>,
  randomization: RecursiveRandomization<T>,
  cullProp?: string,
  rng?: () => number
): void => {
  const randomizerProps = getAllProperties(randomization);
  Object.entries(randomizerProps).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      const [firstOption, secondOption] = v;
      if (
        typeof firstOption === "string" &&
        typeof secondOption === "boolean"
      ) {
        // Handle self references on second pass
        setProperty(obj, k, undefined);
      } else if (typeof firstOption === "number") {
        const randomizedValue = clampedRandom(firstOption, secondOption, rng);
        const valid = getProperty(validation, k);
        if (Array.isArray(valid)) {
          // Round according to validation step
          const [, , steps] = valid;
          const step = steps?.[0];
          const fractionDigits = step.toString().split(".")?.[1]?.length || 0;
          const roundedVal = Number(randomizedValue.toFixed(fractionDigits));
          setProperty(obj, k, roundedVal);
        } else {
          setProperty(obj, k, randomizedValue);
        }
      } else {
        setProperty(obj, k, pick(v, rng));
      }
    }
  });
  Object.entries(randomizerProps).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      const [propertyPath, forceInverse] = v;
      if (
        typeof propertyPath === "string" &&
        typeof forceInverse === "boolean"
      ) {
        // Resolve self references
        const referencedValue = getProperty(obj, propertyPath);
        const inverseOfReferencedValue =
          typeof referencedValue === "number"
            ? 1 - referencedValue
            : !referencedValue;
        if (referencedValue) {
          setProperty(obj, k, inverseOfReferencedValue);
        } else {
          setProperty(
            obj,
            k,
            forceInverse
              ? inverseOfReferencedValue
              : pick([referencedValue, inverseOfReferencedValue], rng)
          );
        }
      }
    }
  });
  if (cullProp) {
    cull(obj, cullProp);
  }
};
