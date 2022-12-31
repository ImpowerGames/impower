import { STRESS_TYPES } from "../constants/STRESS_TYPES";
import { Prosody } from "../types/Prosody";
import { StressType } from "../types/StressType";

export const getStressType = (
  phrase: string,
  prosody: Prosody | undefined
): StressType => {
  if (prosody) {
    for (let i = 0; i < STRESS_TYPES.length; i += 1) {
      const stressType = STRESS_TYPES[i] || "statement";

      const match = stressType
        ? phrase
            ?.toLowerCase()
            .match(new RegExp(prosody?.[stressType] || "", "u"))
        : undefined;
      if (match) {
        return stressType;
      }
    }
  }
  return "statement";
};
