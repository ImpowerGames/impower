import { space } from "./space";

export function skipSpace(line: string, i = 0): number {
  while (i < line.length && space(line.charCodeAt(i))) {
    i += 1;
  }
  return i;
}
