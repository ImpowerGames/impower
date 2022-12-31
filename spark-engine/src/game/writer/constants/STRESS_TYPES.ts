import { StressType } from "../types/StressType";

export const STRESS_TYPES: readonly StressType[] = [
  "liltQuestion",
  "liltExclamation",
  "lilt",
  "resolvedAnxiousQuestion",
  "anxiousQuestion",
  "resolvedQuestion",
  "question",
  "exclamation",
  "comma",
  "partial",
  "anxious",
  "statement",
] as const;
