import { FountainToken } from "../types/FountainToken";
import { FountainTokenType } from "../types/FountainTokenType";

export const createFountainToken = (
  type?: FountainTokenType,
  text?: string,
  line?: number,
  cursor?: number,
  newLineLength?: number
): FountainToken => {
  const t: FountainToken = {
    type,
    ...(text !== undefined ? { content: text } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(cursor !== undefined ? { indent: 0, start: cursor, end: cursor } : {}),
  } as FountainToken;
  if (text) {
    const indentMatch = text.match(/^([ \t]*)/);
    const indent = indentMatch[0] || "";
    t.indent = indent.length;
    t.end = cursor + text.length - 1 + newLineLength;
  }
  return t;
};
