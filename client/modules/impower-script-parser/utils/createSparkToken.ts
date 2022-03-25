import { SparkToken } from "../types/SparkToken";
import { SparkTokenType } from "../types/SparkTokenType";

export const createSparkToken = <T extends SparkToken>(
  type?: SparkTokenType,
  text?: string,
  line?: number,
  cursor?: number,
  newLineLength?: number
): T => {
  const t: T = {
    type,
    ...(text !== undefined ? { content: text } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(cursor !== undefined ? { offset: 0, from: cursor, to: cursor } : {}),
  } as T;
  if (text) {
    const indentMatch = text.match(/^([ \t]*)/);
    const indent = indentMatch[0] || "";
    const offset = indent.length;
    t.indent = Math.floor(offset / 2);
    t.offset = offset;
    t.to = cursor + text.length - 1 + newLineLength;
  }
  return t;
};
