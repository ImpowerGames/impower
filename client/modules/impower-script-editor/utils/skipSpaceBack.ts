import { whitespace } from "./whitespace";

export const skipSpaceBack = (line: string, i: number, to: number): number => {
  while (i > to && whitespace(line.charCodeAt(i - 1))) {
    i -= 1;
  }
  return i;
};
