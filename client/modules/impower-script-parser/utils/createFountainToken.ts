import { FountainToken } from "../types/FountainSyntaxTree";
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
    ...(text !== undefined ? { text } : {}),
    ...(line !== undefined ? { line } : {}),
    ...(cursor !== undefined ? { start: cursor, end: cursor } : {}),
  };
  if (text) {
    t.end = cursor + text.length - 1 + newLineLength;
  }
  return t;
};
