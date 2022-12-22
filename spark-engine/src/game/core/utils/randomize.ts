import { RecursiveRandomization } from "../types/RecursiveRandomization";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { create } from "./create";
import { denormalize } from "./denormalize";
import { getAllProperties } from "./getAllProperties";
import { getProperty } from "./getProperty";
import { normalize } from "./normalize";
import { pick } from "./pick";
import { randomClamped } from "./randomClamped";
import { setProperty } from "./setProperty";

export const randomize = <T>(
  validation: RecursiveValidation<T>,
  randomization: RecursiveRandomization<T>,
  rng: (() => number) | undefined
): T => {
  const result = create(validation);
  normalize(result, validation);
  const randomizerProps = getAllProperties(randomization);
  Object.entries(randomizerProps).forEach(([k, v]) => {
    if (Array.isArray(v)) {
      const [firstOption, secondOption] = v;
      if (typeof firstOption === "number") {
        const randomizedValue = randomClamped(firstOption, secondOption, rng);
        setProperty(result, k, randomizedValue);
      } else if (
        typeof firstOption === "string" &&
        typeof secondOption === "boolean"
      ) {
        const otherValue = getProperty(result, k);
        if (secondOption) {
          setProperty(result, k, otherValue);
        } else {
          const inverseOfOtherValue =
            typeof otherValue === "boolean"
              ? !otherValue
              : typeof otherValue === "number"
              ? 1 - otherValue
              : otherValue;
          setProperty(result, k, inverseOfOtherValue);
        }
      } else {
        setProperty(result, k, pick(v, rng));
      }
    }
  });
  denormalize(result, validation);
  return result;
};
