import { Graphic } from "../../../sparkle/src/types/graphic";
import { parseGraphic } from "../../../sparkle/src/utils/parseGraphic";

const VARIABLE_REGEX = /(--(?:.|\n)+[)][;])/g;

export const extractAllGraphics = (
  prefix: string,
  css: string
): Record<string, Graphic> => {
  const result: Record<string, Graphic> = {};
  if (css) {
    const matches = css.match(VARIABLE_REGEX);
    matches?.forEach((match) => {
      const separatorIndex = match.indexOf(":");
      const key = match.substring(0, separatorIndex);
      const value = match.substring(separatorIndex + 1);
      if (key && value && key.startsWith(prefix)) {
        const name = key.replace(prefix, "").trim();
        result[name] = parseGraphic(value);
      }
    });
  }
  return result;
};
