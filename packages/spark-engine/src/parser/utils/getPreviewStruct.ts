import { SparkStruct, SparkToken } from "../../../../sparkdown/src";
import { getSparkStruct } from "./getSparkStruct";

export const getPreviewStruct = (
  program: {
    tokens: SparkToken[];
    metadata: { lines: { tokens: number[] }[] };
    structs?: Record<string, SparkStruct>;
  },
  line: number
): SparkStruct | null | undefined => {
  if (!program) {
    return undefined;
  }
  if (!line) {
    return undefined;
  }
  let tokenIndex = program.metadata?.lines[line]?.tokens?.[0] || -1;
  let token = program.tokens[tokenIndex];
  if (!token) {
    return null;
  }
  while (tokenIndex < program.tokens.length && token?.skipToNextPreview) {
    tokenIndex += 1;
    token = program.tokens[tokenIndex];
  }
  if (!token) {
    return null;
  }
  const runtimeEntity = getSparkStruct(token, program?.structs || {});
  return runtimeEntity;
};
