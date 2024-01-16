import type { SparkToken } from "../../../../sparkdown/src";
import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";

const getPreviewCommandToken = (
  program: SparkProgram,
  line: number
): SparkToken | null | undefined => {
  if (!program) {
    return undefined;
  }
  if (line == null) {
    return undefined;
  }
  const lineTokens = program.metadata?.lines?.[line]?.tokens;
  if (!lineTokens) {
    return null;
  }
  for (let i = 0; i < lineTokens.length; i += 1) {
    const tokenIndex = lineTokens[i]!;
    const token = program.tokens[tokenIndex];
    if (token?.id) {
      return token;
    }
  }
  return null;
};

export default getPreviewCommandToken;
