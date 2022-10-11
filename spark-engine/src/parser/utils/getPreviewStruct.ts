import { SparkStruct, SparkToken } from "../../../../sparkdown";
import { getSparkStruct } from "./getSparkStruct";

export const getPreviewStruct = (
  result: {
    tokens: SparkToken[];
    tokenLines: Record<number, number>;
    structs?: Record<string, SparkStruct>;
  },
  line: number
) => {
  if (!result) {
    return undefined;
  }
  if (!line) {
    return undefined;
  }
  let tokenIndex = result.tokenLines[line];
  let token = result.tokens[tokenIndex];
  if (token) {
    while (tokenIndex < result.tokens.length && token.skipToNextPreview) {
      tokenIndex += 1;
      token = result.tokens[tokenIndex];
    }
    const runtimeEntity = getSparkStruct(token, result?.structs || {});
    return runtimeEntity;
  }
  return null;
};
