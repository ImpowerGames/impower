import { SparkParseResult } from "../../../../sparkdown";
import { getSparkEntity } from "../../parser";

export const getPreviewEntity = (result: SparkParseResult, line: number) => {
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
    const runtimeEntity = getSparkEntity(token, result?.entities || {});
    return runtimeEntity;
  }
  return null;
};
