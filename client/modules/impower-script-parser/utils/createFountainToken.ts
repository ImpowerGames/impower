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
    ...(cursor !== undefined ? { start: cursor, end: cursor } : {}),
  } as FountainToken;
  if (text) {
    t.end = cursor + text.length - 1 + newLineLength;
  }
  return t;
};
