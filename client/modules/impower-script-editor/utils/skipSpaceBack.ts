import { space } from "./space";

export function skipSpaceBack(line: string, i: number, to: number): number {
  while (i > to && space(line.charCodeAt(i - 1))) {
    i -= 1;
  }
  return i;
}
