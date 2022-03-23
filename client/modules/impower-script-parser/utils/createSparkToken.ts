import { SparkToken } from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";

export const createSparkToken = (
  type?: SparkTokenType,
  text?: string,
  line?: number,
  cursor?: number,
  newLineLength?: number
): SparkToken => {
  const t: SparkToken = {
    type,
    ...(text !== undefined ? { content: text } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(cursor !== undefined ? { offset: 0, from: cursor, to: cursor } : {}),
  } as SparkToken;
  if (text) {
    const indentMatch = text.match(/^([ \t]*)/);
    const indent = indentMatch[0] || "";
    t.offset = indent.length;
    t.to = cursor + text.length - 1 + newLineLength;
  }
  return t;
};
