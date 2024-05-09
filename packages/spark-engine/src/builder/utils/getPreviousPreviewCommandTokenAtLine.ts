import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { SparkToken } from "../../../../sparkdown/src/types/SparkToken";
import getPreviewCommandTokenAtLine from "./getPreviewCommandTokenAtLine";

const getPreviousPreviewCommandTokenAtLine = (
  program: SparkProgram,
  line: number
): SparkToken | null | undefined => {
  const currentPreviewCommandToken = getPreviewCommandTokenAtLine(
    program,
    line
  );
  for (let i = line; i >= 0; i -= 1) {
    const prevPreviewCommandToken = getPreviewCommandTokenAtLine(program, i);
    if (
      prevPreviewCommandToken?.id &&
      prevPreviewCommandToken?.id !== currentPreviewCommandToken?.id
    ) {
      return prevPreviewCommandToken;
    }
  }
  return null;
};

export default getPreviousPreviewCommandTokenAtLine;
