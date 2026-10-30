import type { SparkdownNodeName } from "../types/SparkdownNodeName";
import { explicitRuleNames } from "./explicitRuleNames";

export const nodeNameSet = (names: SparkdownNodeName[]): Set<string> =>
  new Set<string>(names.flatMap(explicitRuleNames));
