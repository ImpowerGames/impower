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
    ...(cursor !== undefined ? { offset: 0, from: cursor, to: cursor } : {}),
  } as FountainToken;
  if (text) {
    const indentMatch = text.match(/^([ \t]*)/);
    const indent = indentMatch[0] || "";
    t.offset = indent.length;
    t.to = cursor + text.length - 1 + newLineLength;
  }
  return t;
};
