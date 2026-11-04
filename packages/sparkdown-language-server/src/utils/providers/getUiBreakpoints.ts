import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";

export const getUiBreakpoints = (
  program: Pick<SparkProgram, "context"> | undefined,
): Record<string, number> | null =>
  program?.context?.["config"]?.["ui"]?.["breakpoints"] ?? null;
