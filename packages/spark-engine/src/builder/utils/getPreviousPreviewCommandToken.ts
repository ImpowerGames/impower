import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { SparkToken } from "../../../../sparkdown/src/types/SparkToken";
import getPreviewCommandToken from "./getPreviewCommandToken";

const getPreviousPreviewCommandToken = (
  program: SparkProgram,
  line: number
): SparkToken | null | undefined => {
  const currentPreviewCommandToken = getPreviewCommandToken(program, line);
  for (let i = line; i >= 0; i -= 1) {
    const prevPreviewCommandToken = getPreviewCommandToken(program, i);
    if (
      prevPreviewCommandToken?.id &&
      prevPreviewCommandToken?.id !== currentPreviewCommandToken?.id
    ) {
      return prevPreviewCommandToken;
    }
  }
  return null;
};

export default getPreviousPreviewCommandToken;
