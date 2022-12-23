import { RecursiveRandomization } from "../types/RecursiveRandomization";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { cull } from "./cull";
import { denormalize } from "./denormalize";
import { getAllProperties } from "./getAllProperties";
import { getProperty } from "./getProperty";
import { normalize } from "./normalize";
import { pick } from "./pick";
import { randomClamped } from "./randomClamped";
import { setProperty } from "./setProperty";

export const randomize = <T>(
  obj: T,
  validation: RecursiveValidation<T>,
  randomization: RecursiveRandomization<T>,
  cullProp?: string,
  rng?: () => number
): void => {
  normalize(obj, validation);
  const randomizerProps = getAllProperties(randomization);
  Object.entries(randomizerProps).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      const [firstOption, secondOption] = v;
      if (
        typeof firstOption === "string" &&
        typeof secondOption === "boolean"
      ) {
        // Handle self references on second pass
      } else if (typeof firstOption === "number") {
        const randomizedValue = randomClamped(firstOption, secondOption, rng);
        setProperty(obj, k, randomizedValue);
      } else {
        setProperty(obj, k, pick(v, rng));
      }
    }
  });
  Object.entries(randomizerProps).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      const [firstOption, secondOption] = v;
      if (
        typeof firstOption === "string" &&
        typeof secondOption === "boolean"
      ) {
        // Resolve self references
        const referencedValue = getProperty(obj, firstOption);
        if (secondOption) {
          setProperty(obj, k, referencedValue);
        } else {
          const inverseOfOtherValue =
            typeof referencedValue === "number"
              ? 1 - referencedValue
              : !referencedValue;
          setProperty(obj, k, inverseOfOtherValue);
        }
      }
    }
  });
  if (cullProp) {
    cull(obj, cullProp);
  }
  denormalize(obj, validation);
};
