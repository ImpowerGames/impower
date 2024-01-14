import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { SparkVariable } from "../../../../sparkdown/src/types/SparkVariable";

const getPreviewVariable = (
  program: SparkProgram,
  line: number
): SparkVariable | null | undefined => {
  if (!program) {
    return undefined;
  }
  const id = program.metadata?.lines?.[line]?.struct;
  if (!id) {
    return null;
  }
  return program.variables?.[id];
};

export default getPreviewVariable;
