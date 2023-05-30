import { whitespace } from "./whitespace";

export const skipSpace = (line: string, i = 0): number => {
  while (i < line.length && whitespace(line.charCodeAt(i))) {
    i += 1;
  }
  return i;
};
