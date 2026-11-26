import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { getTimingFunction, type TimingFunction } from "../../../../sparkle-style-transformer/src/utils/animationShorthand";

export const getUiEases = (
  program: Pick<SparkProgram, "context"> | undefined,
): Record<string, string> | null => {
  const eases = program?.context?.["ease"] as Record<string, TimingFunction> | undefined;
  if (!eases) {
    return null;
  }
  const resolved: Record<string, string> = {};
  for (const [name, ease] of Object.entries(eases)) {
    if (!name.startsWith("$")) {
      resolved[name] = getTimingFunction(ease);
    }
  }
  return resolved;
};
