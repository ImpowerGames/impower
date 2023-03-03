import { PathCommand } from "../types/Path";

/**
 * Stringify segment array to path string
 */
export const stringifyPath = (segments: PathCommand[]): string => {
  const tokens: (string | number)[] = [];
  segments.forEach(({ command: key, data }) => {
    tokens.push(key);
    switch (key) {
      case "C":
      case "c":
        tokens.push(
          data[0],
          `${data[1]},`,
          data[2],
          `${data[3]},`,
          data[4],
          data[5]
        );
        break;
      case "S":
      case "s":
      case "Q":
      case "q":
        tokens.push(data[0], `${data[1]},`, data[2], data[3]);
        break;
      default:
        tokens.push(...data);
        break;
    }
  });
  return tokens.join(" ");
};
