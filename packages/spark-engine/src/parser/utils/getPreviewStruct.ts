import type { SparkProgram, SparkStruct } from "../../../../sparkdown/src";

export const getPreviewStruct = (
  program: SparkProgram,
  line: number
): SparkStruct | null | undefined => {
  if (!program) {
    return undefined;
  }
  const structId = program.metadata?.lines?.[line]?.struct;
  if (!structId) {
    return null;
  }
  return program.structs?.[structId];
};
