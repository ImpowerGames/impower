import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { SparkToken } from "../../../../sparkdown/src/types/SparkToken";
import getPreviewCommandToken from "./getPreviewCommandToken";

const getNextPreviewCommandToken = (
  program: SparkProgram,
  line: number
): SparkToken | null | undefined => {
  const currentPreviewCommandToken = getPreviewCommandToken(program, line);
  const lastLine = program.metadata.lineCount;
  if (!lastLine) {
    return null;
  }
  for (let i = line; i <= lastLine; i += 1) {
    const nextPreviewCommandToken = getPreviewCommandToken(program, i);
    if (
      nextPreviewCommandToken?.id &&
      nextPreviewCommandToken?.id !== currentPreviewCommandToken?.id
    ) {
      return nextPreviewCommandToken;
    }
  }
  return null;
};

export default getNextPreviewCommandToken;
